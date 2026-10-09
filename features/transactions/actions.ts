'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/server/auth/session'
import { parseTransactionFilters } from '@/lib/transactions/filters'
import { categoryTree } from '@/server/repositories/dashboard'
import {
  BULK_LIMIT,
  bulkClassify,
  bulkConfirm,
  classifyTransaction,
  confirmTransaction,
  matchingTransactionIds,
  updateTransactionDetails,
} from '@/server/repositories/transactions'
import { linkTransfer, unlinkTransfer } from '@/server/repositories/transfers'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type ConfirmState = { status: 'idle' | 'error' | 'done'; message?: string }

function revalidate(id: string | null) {
  if (id) revalidatePath(`/transactions/${id}`)
  // Anche l'altra metà di un trasferimento cambia.
  revalidatePath('/transactions/[id]', 'page')
  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/')
  revalidatePath('/business')
}

/** Conferma la classificazione proposta di un movimento (RLS: solo i propri). */
export async function confirmTransactionAction(id: string): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Movimento non trovato.' }
  const ok = await confirmTransaction(await createSupabaseServerClient(), id)
  if (!ok) return { status: 'error', message: 'Movimento non trovato o già confermato.' }
  revalidate(id)
  return { status: 'done', message: 'Classificazione confermata.' }
}

/** "Sistema" un movimento con una scelta rapida (ed eventualmente ricordala). */
export async function classifyTransactionAction(id: string, _prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Movimento non trovato.' }
  const choice = formData.get('choice')
  if (typeof choice !== 'string' || choice.length > 60) return { status: 'error', message: 'Scegli un’opzione.' }
  const remember = formData.get('remember') === 'on'
  const result = await classifyTransaction(await createSupabaseServerClient(), id, choice, remember)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate(id)
  const parts = ['Fatto.']
  if (result.linked) parts.push('Collegato all’altra metà del trasferimento.')
  if (result.ruleCreated) parts.push('Lo ricorderò per i prossimi movimenti uguali.')
  return { status: 'done', message: parts.join(' ') }
}

/** Collega il movimento all'altra metà scelta: un trasferimento tra conti propri. */
export async function linkTransferAction(id: string, otherId: string): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(otherId).success) return { status: 'error', message: 'Movimento non trovato.' }
  const result = await linkTransfer(await createSupabaseServerClient(), id, otherId)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate(id)
  return { status: 'done', message: 'Trasferimento collegato.' }
}

/** Scollega le due metà: restano trasferimenti "da abbinare". */
export async function unlinkTransferAction(id: string, groupId: string): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(groupId).success) return { status: 'error', message: 'Trasferimento non trovato.' }
  const result = await unlinkTransfer(await createSupabaseServerClient(), groupId)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate(id)
  return { status: 'done', message: 'Trasferimento scollegato.' }
}

export type DetailsState = ConfirmState & { field?: string }

/** Modifica descrizione, note, categoria, business e fonte di un movimento. */
export async function updateTransactionDetailsAction(id: string, _prev: DetailsState, formData: FormData): Promise<DetailsState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Movimento non trovato.' }
  const text = (key: string) => {
    const v = formData.get(key)
    return typeof v === 'string' ? v : ''
  }
  const optionalId = (key: string) => {
    const v = text(key)
    return z.uuid().safeParse(v).success ? v : null
  }
  const result = await updateTransactionDetails(await createSupabaseServerClient(), id, {
    description: text('description'),
    notes: text('notes') || null,
    categoryId: optionalId('categoryId'),
    businessId: optionalId('businessId'),
    incomeSourceId: optionalId('incomeSourceId'),
  })
  if (!result.ok) return { status: 'error', message: result.error, field: result.field }
  revalidate(id)
  return { status: 'done', message: 'Modifiche salvate.' }
}

const bulkSchema = z.object({
  scope: z.enum(['selected', 'all']),
  operation: z.enum(['confirm', 'classify']),
  choice: z.string().max(60).optional(),
  direction: z.enum(['in', 'out']).optional(),
  filters: z.string().max(2000).default(''),
  ids: z.array(z.uuid()).max(BULK_LIMIT),
})

/**
 * Modifica di gruppo: sui movimenti selezionati oppure su tutti quelli che
 * corrispondono ai filtri della lista (al massimo 1000).
 */
export async function bulkTransactionsAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  await requireUser()
  const parsed = bulkSchema.safeParse({
    scope: formData.get('scope'),
    operation: formData.get('operation'),
    choice: formData.get('choice') || undefined,
    direction: formData.get('direction') || undefined,
    filters: formData.get('filters') ?? '',
    ids: formData.getAll('id'),
  })
  if (!parsed.success) return { status: 'error', message: 'Selezione non valida.' }
  const input = parsed.data
  const db = await createSupabaseServerClient()

  let ids = input.ids
  if (input.scope === 'all') {
    const filters = parseTransactionFilters(Object.fromEntries(new URLSearchParams(input.filters)))
    const tree = filters.categoryId && filters.categoryId !== 'none' ? await categoryTree(db) : []
    const categoryIds =
      filters.categoryId && filters.categoryId !== 'none' ? [filters.categoryId, ...tree.filter((c) => c.parentId === filters.categoryId).map((c) => c.id)] : null
    ids = (await matchingTransactionIds(db, filters, categoryIds)).ids
  }
  if (ids.length === 0) return { status: 'error', message: 'Nessun movimento selezionato.' }

  const result =
    input.operation === 'confirm'
      ? await bulkConfirm(db, ids)
      : input.choice && input.direction
        ? await bulkClassify(db, ids, input.choice, input.direction)
        : ({ ok: false, error: 'Scegli cosa sono.' } as const)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate(null)
  const done = result.updated === 1 ? '1 movimento aggiornato' : `${result.updated} movimenti aggiornati`
  const skipped =
    result.skipped === 0 ? '' : input.operation === 'confirm' ? ` (${result.skipped} erano già a posto)` : ` (${result.skipped} saltati: entrata/uscita non compatibile)`
  return { status: 'done', message: `${done}${skipped}.` }
}
