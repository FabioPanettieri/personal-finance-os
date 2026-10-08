import { History } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { NewImportForm } from '@/features/imports/components/new-import-form'
import { requireUser } from '@/server/auth/session'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Importa' }

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
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Importa un estratto</h1>
          <p className="mt-1 text-[15px] text-fg-muted">Scarica il CSV dall’app della banca e caricalo qui.</p>
        </div>
        <Link
          href="/imports"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-medium text-fg-muted hover:text-fg"
        >
          <History aria-hidden className="size-4" />
          Storico
        </Link>
      </header>
      <NewImportForm accounts={data.map((a) => ({ id: a.id, name: a.name, currency: a.currency, bankProfile: a.default_bank_profile }))} />
    </div>
  )
}
