import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { SectionTitle } from '@/components/finance/section-title'
import { Money } from '@/components/ui/money'
import { BusinessMonthlyChart } from '@/features/business/components/monthly-chart'
import { SplitOverview } from '@/features/business/components/split-overview'
import { SpendingList } from '@/features/dashboard/components/home'
import type { Flows } from '@/lib/dashboard/metrics'
import { DEFAULT_TIME_ZONE, today } from '@/lib/dates'
import { formatPercent, type Cents } from '@/lib/money'
import { REPORT_KIND_LABELS, REPORT_KINDS, shiftAnchor } from '@/lib/reports/periods'
import { transactionsHref } from '@/lib/transactions/filters'
import { cn } from '@/lib/utils/cn'
import { getProfile, requireUser } from '@/server/auth/session'
import { loadReport } from '@/server/services/reports'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Report' }

const TONE_DOT = { positive: 'bg-positive', negative: 'bg-negative', warning: 'bg-warning', neutral: 'bg-fg-muted' } as const
const rate = (f: Flows) => (f.income > 0 ? (f.income - f.expenses) / f.income : null)

function Kpi({ label, value, previous, previousLabel, testId, tone }: { label: string; value: number; previous: number | null; previousLabel: string; testId: string; tone?: string }) {
  return (
    <div data-testid={testId} className="rounded-[18px] bg-surface-2 p-4">
      <p className="text-[13px] text-fg-muted">{label}</p>
      <Money value={value as Cents} currency="EUR" className={cn('mt-0.5 block text-[22px] font-bold', tone ?? 'text-fg')} />
      {previous !== null ? (
        <p className="mt-1 text-[12px] text-fg-subtle">
          {previousLabel}: <Money value={previous as Cents} currency="EUR" />
        </p>
      ) : null}
    </div>
  )
}

/**
 * Report: settimana, mese, anno. Osservazioni solo dai dati, confronto con il
 * periodo precedente (e con lo stesso mese dell'anno prima), confronto tra
 * anni e storico del patrimonio.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('/reports')
  const params = await searchParams
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : null)
  const profile = await getProfile()
  const now = today(profile?.timezone ?? DEFAULT_TIME_ZONE)
  const r = await loadReport(await createSupabaseServerClient(), { kind: one('kind'), at: one('at') }, now)
  const { period, flows, previousFlows: prev, currency } = r
  const href = (kind: string, at: string | null) => `/reports?kind=${kind}${at ? `&at=${at}` : ''}`
  const prevAt = shiftAnchor(period, -1, now)
  const nextAt = shiftAnchor(period, 1, now)
  const range = { from: period.from, to: period.to }
  const saved = flows.income - flows.expenses
  const savedRate = rate(flows)

  return (
    <>
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Report</h1>
          <p className="mt-1 text-[15px] text-fg-muted">Com’è andata, in poche righe e numeri veri.</p>
        </div>
        <nav aria-label="Tipo di report" className="flex rounded-full border border-line bg-surface p-1">
          {REPORT_KINDS.map((k) => (
            <Link
              key={k}
              href={href(k, null)}
              aria-current={period.kind === k ? 'page' : undefined}
              className={cn('inline-flex min-h-10 items-center rounded-full px-4 text-[13px] font-semibold sm:min-h-9', period.kind === k ? 'bg-fg text-canvas' : 'text-fg-muted hover:text-fg')}
            >
              {REPORT_KIND_LABELS[k]}
            </Link>
          ))}
        </nav>
      </header>

      <div className="mb-5 flex items-center justify-between gap-2">
        <Link href={href(period.kind, prevAt)} aria-label="Periodo precedente" className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg-muted hover:text-fg">
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <h2 className="text-center text-[18px] font-semibold text-fg">
          {period.label}
          {period.ongoing ? <span className="block text-[12px] font-medium text-fg-subtle">in corso</span> : null}
        </h2>
        {nextAt ? (
          <Link href={href(period.kind, nextAt)} aria-label="Periodo successivo" className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg-muted hover:text-fg">
            <ChevronRight aria-hidden className="size-5" />
          </Link>
        ) : (
          <span className="size-11" />
        )}
      </div>

      <section aria-labelledby="insights-title" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
        <SectionTitle id="insights-title">In breve</SectionTitle>
        <ul aria-label="Osservazioni" className="flex flex-col gap-3">
          {r.insights.map((i) => (
            <li key={i.key} data-testid={`insight-${i.key}`} className="flex gap-3 text-[15px] leading-snug text-fg">
              <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', TONE_DOT[i.tone])} />
              {i.text}
            </li>
          ))}
        </ul>
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Kpi label="Entrate" value={flows.income} previous={prev.incomeCount + prev.expenseCount > 0 ? prev.income : null} previousLabel={period.previous.label} testId="report-income" tone="text-positive" />
        <Kpi label="Uscite" value={flows.expenses} previous={prev.incomeCount + prev.expenseCount > 0 ? prev.expenses : null} previousLabel={period.previous.label} testId="report-expenses" />
        <div data-testid="report-saved" className="rounded-[18px] bg-surface-2 p-4">
          <p className="text-[13px] text-fg-muted">{saved >= 0 ? 'Messo da parte' : 'Speso in più'}</p>
          <Money value={Math.abs(saved) as Cents} currency={currency} className={cn('mt-0.5 block text-[22px] font-bold', saved >= 0 ? 'text-fg' : 'text-negative')} />
          {savedRate !== null ? <p className="mt-1 text-[12px] text-fg-subtle">{formatPercent(savedRate)} delle entrate</p> : null}
        </div>
      </div>

      {r.lastYearFlows && period.lastYear && r.lastYearFlows.incomeCount + r.lastYearFlows.expenseCount > 0 ? (
        <p className="-mt-3 mb-6 text-[13px] text-fg-muted" data-testid="report-last-year">
          {period.lastYear.label}: entrate <Money value={r.lastYearFlows.income} currency={currency} className="font-semibold text-fg" />, uscite{' '}
          <Money value={r.lastYearFlows.expenses} currency={currency} className="font-semibold text-fg" />.
        </p>
      ) : null}

      {r.months ? (
        <section aria-labelledby="months-title" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
          <SectionTitle id="months-title">Mese per mese</SectionTitle>
          <BusinessMonthlyChart
            months={r.months.map((m) => ({ month: m.month, revenue: m.income, expenses: m.expenses, profit: m.net, count: m.income + m.expenses > 0 ? 1 : 0 }))}
            currency={currency}
            series={['Entrate', 'Uscite']}
            label={`Entrate e uscite mese per mese nel ${period.label}`}
          />
        </section>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2 lg:gap-6">
        <section aria-labelledby="cats-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
          <SectionTitle id="cats-title" href={transactionsHref({ ...range, type: 'spending' })} linkLabel="Movimenti">
            Dove sono andati i soldi
          </SectionTitle>
          <SpendingList
            currency={currency}
            items={r.categories
              .filter((c) => c.amount > 0)
              .slice(0, 8)
              .map((c) => ({ key: c.categoryId ?? 'none', label: c.label, amount: c.amount, share: c.share, href: transactionsHref({ ...range, type: 'spending', categoryId: c.categoryId ?? 'none' }) }))}
          />
        </section>
        <SplitOverview split={r.split} currency={currency} />
      </div>

      {period.kind === 'year' ? (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <section aria-labelledby="compare-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
            <SectionTitle id="compare-title">Confronto con il {period.previous.label}</SectionTitle>
            <table className="w-full text-[14px]" data-testid="year-compare">
              <thead className="text-left text-[12px] text-fg-muted">
                <tr>
                  <th className="pb-2 font-medium" />
                  <th className="pb-2 text-right font-medium">{period.label}</th>
                  <th className="pb-2 text-right font-medium">{period.previous.label}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(
                  [
                    ['Entrate', flows.income, prev.income],
                    ['Uscite', flows.expenses, prev.expenses],
                    ['Messo da parte', flows.cashFlow, prev.cashFlow],
                    ['Patrimonio a fine anno', r.netWorth.end, r.previousYearEnd],
                  ] as const
                ).map(([label, cur, before]) => (
                  <tr key={label}>
                    <td className="py-2 text-fg-muted">{label}</td>
                    <td className="py-2 text-right font-semibold text-fg">{cur === null ? '—' : <Money value={cur as Cents} currency={currency} />}</td>
                    <td className="py-2 text-right text-fg-muted">{before === null ? '—' : <Money value={before as Cents} currency={currency} />}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 text-fg-muted">Quota risparmiata</td>
                  <td className="py-2 text-right font-semibold text-fg">{rate(flows) === null ? '—' : formatPercent(rate(flows)!)}</td>
                  <td className="py-2 text-right text-fg-muted">{rate(prev) === null ? '—' : formatPercent(rate(prev)!)}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section aria-labelledby="history-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
            <SectionTitle id="history-title">Storico del patrimonio</SectionTitle>
            {r.history.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">Lo storico parte dalla prima importazione.</p>
            ) : (
              <ul aria-label="Patrimonio a fine anno" className="divide-y divide-line">
                {r.history.map((y) => (
                  <li key={y.year} className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
                    <span className="text-fg-muted">
                      {y.year}
                      {y.ongoing ? ' (oggi)' : ''}
                    </span>
                    <span className="text-right">
                      <Money value={y.value as Cents} currency={currency} className="font-semibold text-fg" />
                      {y.change !== null ? (
                        <Money value={y.change as Cents} currency={currency} signDisplay="exceptZero" className={cn('ml-2 text-[13px]', y.change > 0 ? 'text-positive' : y.change < 0 ? 'text-negative' : 'text-fg-muted')} />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </>
  )
}
