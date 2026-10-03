'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { fieldErrorsFrom, type FormState } from '@/features/auth/schemas'
import { DEFAULT_TIME_ZONE } from '@/lib/dates'
import { MAX_FILE_BYTES } from '@/lib/imports/pipeline'
import { getProfile, requireUser } from '@/server/auth/session'
import { cancelImport, commitImport, createImportPreview, setImportRowIncluded, updateImportRow } from '@/server/services/imports'
import { createSupabaseServerClient } from '@/server/supabase/server'

import { createImportSchema, idSchema, rowPatchSchema } from './schemas'

export type ImportFormState = FormState & { errors?: string[] }

/** Upload + anteprima. Nessuna transazione viene scritta qui. */
export async function createImportAction(_prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  const user = await requireUser('/imports/new')
  const parsed = createImportSchema.safeParse({ source: formData.get('source'), accountId: formData.get('accountId') })
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error) }

  const upload = formData.get('file')
  if (!(upload instanceof File) || upload.size === 0) return { status: 'error', fieldErrors: { file: 'Scegli un file CSV' } }
  if (upload.size > MAX_FILE_BYTES) return { status: 'error', fieldErrors: { file: 'Il file supera 10 MB' } }

  const profile = await getProfile()
  const result = await createImportPreview(await createSupabaseServerClient(), {
    userId: user.id,
    accountId: parsed.data.accountId,
    source: parsed.data.source,
    file: { name: upload.name, size: upload.size, type: upload.type, bytes: new Uint8Array(await upload.arrayBuffer()) },
    timeZone: profile?.timezone ?? DEFAULT_TIME_ZONE,
  })
  if (!result.ok) return { status: 'error', errors: result.errors }

  revalidatePath('/imports')
  redirect(`/imports/${result.value.importId}`)
}

export async function updateRowAction(importId: string, rowId: string, _prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  await requireUser()
  if (!idSchema.safeParse(rowId).success || !idSchema.safeParse(importId).success) return { status: 'error', message: 'Riga non trovata' }
  const parsed = rowPatchSchema.safeParse({
    type: formData.get('type') ?? '',
    categoryId: formData.get('categoryId') ?? '',
    businessId: formData.get('businessId') ?? '',
    incomeSourceId: formData.get('incomeSourceId') ?? '',
    transferAccountId: formData.get('transferAccountId') ?? '',
  })
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error) }

  const result = await updateImportRow(await createSupabaseServerClient(), rowId, parsed.data)
  if (!result.ok) return { status: 'error', message: result.errors.join(' ') }
  revalidatePath(`/imports/${importId}`)
  return { status: 'idle', message: 'Classificazione aggiornata.' }
}

export async function toggleRowAction(importId: string, rowId: string, include: boolean): Promise<ImportFormState> {
  await requireUser()
  if (!idSchema.safeParse(rowId).success || !idSchema.safeParse(importId).success) return { status: 'error', message: 'Riga non trovata' }
  const result = await setImportRowIncluded(await createSupabaseServerClient(), rowId, include)
  if (!result.ok) return { status: 'error', message: result.errors.join(' ') }
  revalidatePath(`/imports/${importId}`)
  return { status: 'idle' }
}

export async function commitImportAction(importId: string): Promise<ImportFormState> {
  await requireUser()
  if (!idSchema.safeParse(importId).success) return { status: 'error', message: 'Importazione non trovata' }
  const profile = await getProfile()
  const result = await commitImport(await createSupabaseServerClient(), importId, profile?.timezone ?? DEFAULT_TIME_ZONE)
  if (!result.ok) return { status: 'error', message: result.errors.join(' ') }
  revalidatePath('/imports')
  revalidatePath(`/imports/${importId}`)
  revalidatePath('/accounts', 'layout')
  revalidatePath('/net-worth')
  return { status: 'idle', message: `Importate ${result.value.imported} righe.` }
}

export async function cancelImportAction(importId: string): Promise<ImportFormState> {
  await requireUser()
  if (!idSchema.safeParse(importId).success) return { status: 'error', message: 'Importazione non trovata' }
  const result = await cancelImport(await createSupabaseServerClient(), importId)
  if (!result.ok) return { status: 'error', message: result.errors.join(' ') }
  revalidatePath('/imports')
  revalidatePath(`/imports/${importId}`)
  return { status: 'idle', message: 'Importazione annullata.' }
}
