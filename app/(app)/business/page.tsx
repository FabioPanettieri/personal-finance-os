import type { Metadata } from 'next'

import { SectionTitle } from '@/components/finance/section-title'
import { SplitOverview } from '@/features/business/components/split-overview'
import { Money } from '@/components/ui/money'
import { BusinessCards, businessColor } from '@/features/dashboard/components/business-performance'
import { splitTotals } from '@/lib/dashboard/business'
import { PeriodTabs, SpendingList } from '@/features/dashboard/components/home'
import { DEFAULT_TIME_ZONE, today } from '@/lib/dates'
import type { Cents } from '@/lib/money'
import { transactionsHref } from '@/lib/transactions/filters'
import { getProfile, requireUser } from '@/server/auth/session'
import { personalBusinessSplit } from '@/server/repositories/business'
import { loadDashboard } from '@/server/services/dashboard'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Business' }

/** VOXEL Studio e YouTube: quanto incassano, quanto spendono, quanto resta. E da dove arrivano le entrate. */
export default async function BusinessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('/business')
  const params = await searchParams
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : null)
  const profile = await getProfile()
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE
  const db = await createSupabaseServerClient()
  const d = await loadDashboard(db, { period: one('period'), from: one('from'), to: one('to') }, today(timeZone), timeZone)
  const range = { from: d.period.from, to: d.period.to }
  const split = splitTotals(await personalBusinessSplit(db, range), d.currency)
  const totals = d.businesses.reduce(
    (t, b) => ({ revenue: (t.revenue + b.revenue) as Cents, expenses: (t.expenses + b.expenses) as Cents, profit: (t.profit + b.profit) as Cents }),
    { revenue: 0 as Cents, expenses: 0 as Cents, profit: 0 as Cents },
  )
  const heroColors = d.businesses.length > 1 ? d.businesses.slice(0, 3).map((b, i) => businessColor(b, i)) : ['#7C6CF2', '#E5484D']

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Business</h1>
          <p className="mt-1 text-[15px] text-fg-muted">{d.period.label}: incassi, spese e utile delle tue attività.</p>
        </div>
        <PeriodTabs period={d.period} basePath="/business" />
      </header>

      <section
        aria-labelledby="business-hero"
        data-testid="business-hero"
        className="mb-6 overflow-hidden rounded-[var(--radius-card)] p-5 text-white lg:mb-8 lg:p-7"
        style={{ background: `linear-gradient(rgb(0 0 0 / 0.32), rgb(0 0 0 / 0.32)), linear-gradient(135deg, ${heroColors.join(', ')})` }}
      >
        <h2 id="business-hero" className="text-[13px] font-semibold tracking-wide text-white/80 uppercase">
          Le tue attività · {d.period.label}
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-end">
          <div>
            <p className="text-[13px] text-white/75">Incassi</p>
            <Money value={totals.revenue} currency={d.currency} className="block text-[26px] font-bold text-white lg:text-[30px]" />
          </div>
          <span aria-hidden className="hidden pb-2 text-2xl text-white/60 sm:block">−</span>
          <div>
            <p className="text-[13px] text-white/75">Spese</p>
            <Money value={totals.expenses} currency={d.currency} className="block text-[26px] font-bold text-white lg:text-[30px]" />
          </div>
          <span aria-hidden className="hidden pb-2 text-2xl text-white/60 sm:block">=</span>
          <div className="rounded-[16px] bg-black/20 px-4 py-3">
            <p className="text-[13px] text-white/80">Utile</p>
            <Money value={totals.profit} currency={d.currency} signDisplay="exceptZero" className="block text-[30px] font-extrabold text-white lg:text-[36px]" />
          </div>
        </div>
        <p className="mt-4 text-[14px] text-white/85">
          {split.total.income > 0
            ? `Il business vale il ${Math.round((split.business.income / split.total.income) * 100)}% delle tue entrate del periodo.`
            : 'Nessuna entrata nel periodo.'}{' '}
          Tocca un’attività per vedere mese per mese incassi, spese e categorie.
        </p>
      </section>

      <div className="mb-6 lg:mb-8">
        <BusinessCards items={d.businesses} currency={d.currency} range={range} />
      </div>

      <div className="mb-6 lg:mb-8">
        <SplitOverview split={split} currency={d.currency} />
      </div>

      <section aria-labelledby="sources-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
        <SectionTitle id="sources-title">Da dove arrivano le entrate</SectionTitle>
        {d.incomeSources.length > 0 ? (
          <SpendingList
            currency={d.currency}
            items={d.incomeSources.map((s) => ({
              key: s.incomeSourceId ?? 'none',
              label: s.label,
              amount: s.amount,
              share: s.share,
              href: transactionsHref({ ...range, type: 'income', incomeSourceId: s.incomeSourceId ?? 'none' }),
            }))}
          />
        ) : (
          <p className="py-6 text-center text-sm text-fg-muted">Nessuna entrata in questo periodo.</p>
        )}
      </section>
    </>
  )
}
