import { FileUp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { AccountOverview } from '@/features/dashboard/components/account-overview'
import { ImportHealthList, ReviewCard } from '@/features/dashboard/components/attention'
import { BreakdownList } from '@/features/dashboard/components/breakdown-list'
import { BusinessPerformanceList } from '@/features/dashboard/components/business-performance'
import { CashFlowChart } from '@/features/dashboard/components/cash-flow-chart'
import { NetWorthChart } from '@/features/dashboard/components/net-worth-chart'
import { PeriodSelector } from '@/features/dashboard/components/period-selector'
import { RecentActivity } from '@/features/dashboard/components/recent-activity'
import { Stat } from '@/features/dashboard/components/stat'
import { DEFAULT_TIME_ZONE, formatIsoDate, today } from '@/lib/dates'
import { transactionsHref } from '@/lib/transactions/filters'
import { getProfile, requireUser } from '@/server/auth/session'
import { loadDashboard } from '@/server/services/dashboard'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Home' }

/**
 * Dashboard finanziaria: una vista sui dati, non un secondo sistema contabile.
 * Saldi da account_balances, flussi dagli aggregati SQL (migration 0007),
 * nessuna metrica salvata. Trasferimenti e versamenti agli investimenti non
 * sono mai entrate o uscite.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('/')
  const params = await searchParams
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : null)
  const profile = await getProfile()
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE
  const now = today(timeZone)
  const d = await loadDashboard(await createSupabaseServerClient(), { period: one('period'), from: one('from'), to: one('to') }, now, timeZone)
  const { period, currency, breakdown } = d
  const range = { from: period.from, to: period.to }
  const periodText = `${formatIsoDate(period.from)} – ${formatIsoDate(period.to)}`

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 lg:mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-fg lg:text-[28px]">Home</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {period.label} · {periodText}
          </p>
        </div>
        <PeriodSelector period={period} />
      </header>

      {!d.hasData ? (
        <EmptyState
          icon={FileUp}
          title="Nessun movimento ancora"
          description="Importa gli estratti di ING, Revolut e Trade Republic: la dashboard si costruisce dai tuoi movimenti, senza numeri inventati."
          action={
            <Link href="/imports/new" className="text-sm font-medium text-accent hover:underline">
              Importa un estratto conto
            </Link>
          }
          className="mb-6"
        />
      ) : null}

      <div className="mb-4 lg:mb-6">
        <ReviewCard review={d.review} />
      </div>

      <section aria-label="Indicatori principali" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:mb-6 lg:grid-cols-4 lg:gap-4">
        <Stat
          testId="kpi-net-worth"
          label="Patrimonio netto"
          value={d.hasData ? breakdown.netWorth : null}
          currency={currency}
          hero
          note={
            breakdown.investedAtCost !== 0 ? (
              <>
                Investimenti al costo <Money value={breakdown.investedAtCost} currency={currency} />: valore di mercato non disponibile
              </>
            ) : (
              'Saldo attuale di tutti i conti'
            )
          }
        />
        <Stat
          testId="kpi-liquidity"
          label="Liquidità"
          value={d.hasData ? breakdown.liquidity : null}
          currency={currency}
          hero
          note={
            breakdown.cards !== 0 ? (
              <>
                Carte escluse: <Money value={breakdown.cards} currency={currency} signDisplay="exceptZero" />
              </>
            ) : (
              'Conti correnti, deposito e liquidità sul broker'
            )
          }
        />
        <Stat
          testId="kpi-income"
          label="Entrate"
          value={d.hasData ? d.flows.income : null}
          currency={currency}
          ratio={period.previous ? d.comparison.income : undefined}
          ratioLabel={period.previousLabel}
          note={<Link href={transactionsHref({ ...range, type: 'income' })} className="hover:text-fg hover:underline">{d.flows.incomeCount} movimenti</Link>}
        />
        <Stat
          testId="kpi-expenses"
          label="Uscite"
          value={d.hasData ? d.flows.expenses : null}
          currency={currency}
          ratio={period.previous ? d.comparison.expenses : undefined}
          ratioLabel={period.previousLabel}
          goodWhen="down"
          note={<Link href={transactionsHref({ ...range, type: 'spending' })} className="hover:text-fg hover:underline">{d.flows.expenseCount} movimenti · al netto dei rimborsi</Link>}
        />
      </section>

      <Card className="mb-4 lg:mb-6">
        <CardHeader
          title="Andamento del patrimonio"
          description={d.firstDataDate ? `Dal ${formatIsoDate(d.firstDataDate)}: nessuno storico prima dei dati importati.` : undefined}
        />
        <NetWorthChart history={d.history} today={now} currency={currency} />
      </Card>

      <div className="mb-4 grid gap-4 lg:mb-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
        <Card>
          <CardHeader
            title="Cash flow"
            description={
              <span data-testid="kpi-cash-flow">
                Netto del periodo{' '}
                <Money value={d.flows.cashFlow} currency={currency} signDisplay="exceptZero" tone="signed" className="font-semibold" />
              </span>
            }
          />
          <CashFlowChart bars={d.bars} currency={currency} />
        </Card>
        <Card>
          <CardHeader title="Spese per categoria" description="Al netto dei rimborsi" />
          <BreakdownList
            label="Spese per categoria"
            currency={currency}
            empty="Nessuna spesa nel periodo."
            items={d.categories.map((c) => ({
              key: c.categoryId ?? 'none',
              label: c.label,
              amount: c.amount,
              share: c.share,
              count: c.count,
              href: transactionsHref({ ...range, type: 'spending', categoryId: c.categoryId ?? 'none' }),
            }))}
          />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:mb-6 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader title="Fonti di reddito" />
          <BreakdownList
            label="Fonti di reddito"
            currency={currency}
            empty="Nessuna entrata nel periodo."
            items={d.incomeSources.map((s) => ({
              key: s.incomeSourceId ?? 'none',
              label: s.label,
              amount: s.amount,
              share: s.share,
              count: s.count,
              href: transactionsHref({ ...range, type: 'income', incomeSourceId: s.incomeSourceId ?? 'none' }),
            }))}
          />
        </Card>
        <Card>
          <CardHeader title="Attività" description="Solo movimenti classificati con il business" />
          <BusinessPerformanceList items={d.businesses} currency={currency} range={range} />
        </Card>
      </div>

      <section aria-labelledby="accounts-heading" className="mb-4 lg:mb-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="accounts-heading" className="text-[13px] font-medium tracking-wide text-fg-muted uppercase">
            Conti
          </h2>
          <Link href="/accounts" className="text-sm text-fg-muted hover:text-fg">
            Tutti i conti
          </Link>
        </div>
        <AccountOverview accounts={d.accounts} periodLabel="Nel periodo" />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
        <Card>
          <CardHeader
            title="Attività recenti"
            action={
              <Link href="/transactions" className="text-sm text-fg-muted hover:text-fg">
                Tutti i movimenti
              </Link>
            }
          />
          <RecentActivity items={d.recent} />
        </Card>
        <Card>
          <CardHeader title="Ultimo import" />
          <ImportHealthList imports={d.imports} />
        </Card>
      </div>

      {d.otherCurrencies.length > 0 ? (
        <p className="mt-4 text-xs text-fg-subtle">
          Importi in {currency}. Conti in altre valute ({d.otherCurrencies.join(', ')}) non sono sommati: vedi la pagina Conti.
        </p>
      ) : null}
    </>
  )
}
