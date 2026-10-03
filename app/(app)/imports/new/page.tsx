import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { NewImportForm } from '@/features/imports/components/new-import-form'
import { requireUser } from '@/server/auth/session'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Nuova importazione' }

export default async function NewImportPage() {
  await requireUser('/imports/new')
  const db = await createSupabaseServerClient()
  const { data, error } = await db
    .from('accounts')
    .select('id, name, currency, default_bank_profile')
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw new Error('Lettura conti non riuscita')

  return (
    <>
      <Link href="/imports" className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" />
        Importazioni
      </Link>
      <PageHeader title="Importa CSV" description="Il file viene analizzato e ti mostriamo un’anteprima: niente viene importato senza la tua conferma." />
      <Card className="max-w-3xl">
        <NewImportForm accounts={data.map((a) => ({ id: a.id, name: a.name, currency: a.currency, bankProfile: a.default_bank_profile }))} />
      </Card>
    </>
  )
}
