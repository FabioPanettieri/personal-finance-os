import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { SectionTitle } from '@/components/finance/section-title'
import { TransactionRow } from '@/components/finance/transaction-row'
import { Money } from '@/components/ui/money'
import { BusinessMonthlyChart } from '@/features/business/components/monthly-chart'
import { PeriodTabs, SpendingList } from '@/features/dashboard/components/home'
import { businessMonths } from '@/lib/dashboard/business'
import { BASE_CURRENCY, businessMargin, spendingByCategory } from '@/lib/dashboard/metrics'
import { addMonths, monthsInRange, resolvePeriod } from '@/lib/dashboard/period'
import { DEFAULT_TIME_ZONE, isIsoDate, today } from '@/lib/dates'
import { cents, formatPercent } from '@/lib/money'
import { parseTransactionFilters, transactionsHref } from '@/lib/transactions/filters'
import { cn } from '@/lib/utils/cn'
import { getProfile, requireUser } from '@/server/auth/session'
import { businessCategorySpending, businessMonthly, getBusiness } from '@/server/repositories/business'
import { categoryTree } from '@/server/repositories/dashboard'
import { listTransactions } from '@/server/repositories/transactions'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Business' }

/** Un'attività nel dettaglio: utile e margine del periodo, andamento a 12 mesi, dove vanno le spese, ultimi movimenti. */
export default async function BusinessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  await requireUser(`/business/${id}`)
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createSupabaseServerClient()
  const business = await getBusiness(db, id)
  if (!business) notFound()

  const search = await searchParams
  const one = (key: string) => (typeof search[key] === 'string' ? (search[key] as string) : null)
  const profile = await getProfile()
  const now = today(profile?.timezone ?? DEFAULT_TIME_ZONE)
  const { data: first } = await db.from('transactions').select('booked_on').eq('business_id', id).order('booked_on').limit(1).maybeSingle()
  const firstDate = first && isIsoDate(first.booked_on) ? first.booked_on : null
  const period = resolvePeriod({ period: one('period'), from: one('from'), to: one('to') }, now, firstDate)
  const range = { from: period.from, to: period.to }
  const trend = { from: monthsInRange({ from: addMonths(now, -11), to: now })[0]!, to: now }
  const currency = BASE_CURRENCY

  const [periodRows, trendRows, categoryRows, tree, recent] = await Promise.all([
    businessMonthly(db, id, range),
    businessMonthly(db, id, trend),
    businessCategorySpending(db, id, range),
    categoryTree(db),
    listTransactions(db, parseTransactionFilters({ business: id, from: range.from, to: range.to }), null),
  ])
  const revenue = cents(periodRows.filter((r) => r.currency === currency).reduce((s, r) => s + r.revenueCents, 0))
  const expenses = cents(periodRows.filter((r) => r.currency === currency).reduce((s, r) => s + r.expenseCents, 0))
  const profit = cents(revenue - expenses)
  const margin = businessMargin(revenue, profit)
  const categories = spendingByCategory(categoryRows, tree, currency).filter((c) => c.amount > 0)

  return (
    <>
      <Link href="/business" className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" />
        Business
      </Link>
      <header className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">{business.name}</h1>
          {business.description ? <p className="mt-1 text-[15px] text-fg-muted">{business.description}</p> : null}
        </div>
        <PeriodTabs period={period} basePath={`/business/${id}`} />
      </header>

      <section aria-label="Risultato del periodo" data-testid="business-hero" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-6 lg:mb-8 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-medium text-fg-muted">Utile · {period.label}</p>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted">
            Margine <span className="font-semibold text-fg tabular">{margin === null ? 'N/D' : formatPercent(margin)}</span>
          </span>
        </div>
        <Money
          value={profit}
          currency={currency}
          signDisplay="exceptZero"
          emphasizeUnits
          className={cn('mt-1 block text-[44px] leading-none font-bold tracking-[-0.03em]', profit > 0 ? 'text-positive' : profit < 0 ? 'text-negative' : 'text-fg')}
        />
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Link href={transactionsHref({ businessId: id, type: 'income', ...range })} className="rounded-[14px] bg-surface-2 p-3 hover:bg-line">
            <span className="block text-fg-muted">Incassi</span>
            <span className="mt-0.5 block text-[17px] font-semibold text-fg">
              <Money value={revenue} currency={currency} />
            </span>
          </Link>
          <Link href={transactionsHref({ businessId: id, type: 'spending', ...range })} className="rounded-[14px] bg-surface-2 p-3 hover:bg-line">
            <span className="block text-fg-muted">Spese</span>
            <span className="mt-0.5 block text-[17px] font-semibold text-fg">
              <Money value={expenses} currency={currency} />
            </span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="trend-title" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:mb-8 lg:p-6">
        <SectionTitle id="trend-title">Ultimi 12 mesi</SectionTitle>
        <BusinessMonthlyChart
          months={businessMonths(trendRows, monthsInRange(trend), currency)}
          currency={currency}
          label={`Incassi e spese di ${business.name} negli ultimi 12 mesi`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <section aria-labelledby="costs-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
          <SectionTitle id="costs-title">Dove vanno le spese</SectionTitle>
          <SpendingList
            currency={currency}
            items={categories.slice(0, 8).map((c) => ({
              key: c.categoryId ?? 'none',
              label: c.label,
              amount: c.amount,
              share: c.share,
              color: c.color,
              count: c.count,
              href: transactionsHref({ ...range, businessId: id, type: 'spending', categoryId: c.categoryId ?? 'none' }),
            }))}
          />
        </section>
        <section aria-labelledby="recent-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
          <SectionTitle id="recent-title" href={transactionsHref({ businessId: id, ...range })} linkLabel="Tutti">
            Movimenti del periodo
          </SectionTitle>
          {recent.items.length > 0 ? (
            <ul aria-label="Movimenti del business">
              {recent.items.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <TransactionRow tx={t} showDate />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-fg-muted">Nessun movimento in questo periodo.</p>
          )}
        </section>
      </div>
    </>
  )
}
