import type { Metadata } from 'next'

import { SectionTitle } from '@/components/finance/section-title'
import { SplitOverview } from '@/features/business/components/split-overview'
import { BusinessCards } from '@/features/dashboard/components/business-performance'
import { splitTotals } from '@/lib/dashboard/business'
import { PeriodTabs, SpendingList } from '@/features/dashboard/components/home'
import { DEFAULT_TIME_ZONE, today } from '@/lib/dates'
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

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Business</h1>
          <p className="mt-1 text-[15px] text-fg-muted">{d.period.label}: incassi, spese e utile delle tue attività.</p>
        </div>
        <PeriodTabs period={d.period} basePath="/business" />
      </header>

      <div className="mb-6 lg:mb-8">
        <SplitOverview split={split} currency={d.currency} />
      </div>

      <div className="mb-6 lg:mb-8">
        <BusinessCards items={d.businesses} currency={d.currency} range={range} />
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
