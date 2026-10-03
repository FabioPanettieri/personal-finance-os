import { ChevronRight, Landmark, LineChart } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { PageHeader } from '@/components/ui/page-header'
import { totalsByCurrency } from '@/lib/accounts'
import { requireUser } from '@/server/auth/session'
import { listAccounts } from '@/server/repositories/accounts'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Patrimonio' }

/**
 * Sprint 2: punto d'accesso ai conti (su mobile Conti è raggiungibile da qui,
 * senza aggiungere voci alla bottom navigation). Storico e valore di mercato
 * arrivano negli sprint 5–9.
 */
export default async function NetWorthPage() {
  await requireUser('/net-worth')
  const accounts = await listAccounts(await createSupabaseServerClient())
  const totals = totalsByCurrency(accounts.map((a) => ({ currency: a.currency, balance: a.balance, kind: a.type.kind })))
  const activeCount = accounts.filter((a) => a.isActive).length

  return (
    <>
      <PageHeader title="Patrimonio" description="Il valore complessivo dei tuoi conti e investimenti nel tempo." />
      <div className="grid gap-3 sm:grid-cols-2 lg:gap-4">
        <Link href="/accounts" className="group rounded-[var(--radius-card)] focus-visible:outline-offset-4">
          <Card className="flex h-full min-h-[120px] items-center gap-4 transition-colors group-hover:bg-surface-2">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <Landmark aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-fg">Conti</p>
              <p className="text-sm text-fg-muted">
                {activeCount === 1 ? '1 conto attivo' : `${activeCount} conti attivi`}
                {totals.map((t) => (
                  <span key={t.currency} className="block font-medium text-fg">
                    <Money value={t.total} currency={t.currency} />
                  </span>
                ))}
              </p>
            </div>
            <ChevronRight aria-hidden className="size-4 text-fg-subtle" />
          </Card>
        </Link>
        <Link href="/investments" className="group rounded-[var(--radius-card)] focus-visible:outline-offset-4">
          <Card className="flex h-full min-h-[120px] items-center gap-4 transition-colors group-hover:bg-surface-2">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted">
              <LineChart aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-fg">Investimenti</p>
              <p className="text-sm text-fg-muted">Valore di mercato e PAC — Sprint 8</p>
            </div>
            <ChevronRight aria-hidden className="size-4 text-fg-subtle" />
          </Card>
        </Link>
      </div>
      <EmptyState
        className="mt-4 lg:mt-6"
        title="Storico del patrimonio in arrivo"
        description="L’andamento nel tempo sarà disponibile dopo le prime importazioni e il riconoscimento dei trasferimenti (Sprint 5)."
      />
    </>
  )
}
