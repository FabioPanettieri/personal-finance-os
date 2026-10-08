import { FileUp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { AccountRow, BankCard } from '@/components/finance/bank-card'
import { SectionTitle } from '@/components/finance/section-title'
import { TransactionRow } from '@/components/finance/transaction-row'
import { Money } from '@/components/ui/money'
import { MonthSummary, NetWorthHero, PeriodTabs, ReviewBanner, SpendingList } from '@/features/dashboard/components/home'
import { splitAccounts } from '@/features/accounts/split'
import { DEFAULT_TIME_ZONE, today } from '@/lib/dates'
import { transactionsHref } from '@/lib/transactions/filters'
import { getProfile, requireUser } from '@/server/auth/session'
import { loadDashboard } from '@/server/services/dashboard'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Home' }

function greeting(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat('it-IT', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date()))
  return hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera'
}

/**
 * Home: quanto hai, cosa è successo nel periodo, cosa va sistemato. Una vista
 * sui dati (saldi da account_balances, flussi dagli aggregati SQL), nessuna
 * metrica salvata. Trasferimenti e versamenti agli investimenti non sono mai
 * entrate o uscite.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('/')
  const params = await searchParams
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : null)
  const profile = await getProfile()
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE
  const now = today(timeZone)
  const d = await loadDashboard(await createSupabaseServerClient(), { period: one('period'), from: one('from'), to: one('to') }, now, timeZone)
  const { period, currency } = d
  const range = { from: period.from, to: period.to }
  const name = profile?.display_name?.trim().split(/\s+/)[0]
  const { main, other } = splitAccounts(d.accounts)

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">
            {greeting(timeZone)}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="mt-1 text-[15px] text-fg-muted">Ecco come vanno i tuoi soldi.</p>
        </div>
        <PeriodTabs period={period} />
      </header>

      {!d.hasData ? (
        <Link
          href="/imports/new"
          className="mb-6 flex items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6 transition-colors hover:bg-surface-2"
        >
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full text-white"
            style={{ background: 'linear-gradient(135deg, var(--bank-revolut), var(--bank-ing) 55%, var(--bank-tr))' }}
          >
            <FileUp aria-hidden className="size-5" />
          </span>
          <span>
            <span className="block text-base font-semibold text-fg">Nessun movimento ancora</span>
            <span className="block text-sm text-fg-muted">Importa il primo estratto di ING, Revolut o Trade Republic: tocca qui.</span>
          </span>
        </Link>
      ) : null}

      <div className="mb-6 grid gap-4 lg:mb-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
        <NetWorthHero
          breakdown={d.breakdown}
          monthChange={d.netWorthMonthChange}
          history={d.history}
          today={now}
          currency={currency}
          hasData={d.hasData}
        />
        <MonthSummary
          title={period.preset === 'this-month' ? 'Questo mese' : period.label}
          income={d.flows.income}
          expenses={d.flows.expenses}
          incomeHref={transactionsHref({ ...range, type: 'income' })}
          expensesHref={transactionsHref({ ...range, type: 'spending' })}
          currency={currency}
        />
      </div>

      <div className="mb-6 lg:mb-8">
        <ReviewBanner transactions={d.review.transactions} importRows={d.review.importRows} />
      </div>

      <section aria-labelledby="accounts-title" className="mb-6 lg:mb-8">
        <SectionTitle id="accounts-title" href="/accounts" linkLabel="Tutti i conti">
          I tuoi conti
        </SectionTitle>
        <ul aria-label="Conti" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:gap-4">
          {main.map((a) => (
            <li key={a.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
              <BankCard
                account={{ ...a, typeLabel: a.type.label }}
                footer={
                  a.investedAtCost ? (
                    <>
                      di cui <Money value={a.investedAtCost} currency={a.currency} /> investiti
                    </>
                  ) : a.periodChange !== null ? (
                    <>
                      <Money value={a.periodChange} currency={a.currency} signDisplay="exceptZero" /> nel periodo
                    </>
                  ) : (
                    'Nessun movimento nel periodo'
                  )
                }
              />
            </li>
          ))}
        </ul>
        {other.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:gap-4">
            {other.map((a) => (
              <AccountRow
                key={a.id}
                account={{ ...a, typeLabel: a.type.label }}
                note={a.type.code === 'card' && a.balance > 0 ? 'Addebiti saldati · spese della carta non importate' : a.type.label}
              />
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <section aria-labelledby="spending-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
          <SectionTitle id="spending-title">Dove vanno i soldi</SectionTitle>
          <SpendingList
            currency={currency}
            items={d.categories
              .filter((c) => c.amount > 0)
              .slice(0, 6)
              .map((c) => ({
                key: c.categoryId ?? 'none',
                label: c.label,
                amount: c.amount,
                share: c.share,
                href: transactionsHref({ ...range, type: 'spending', categoryId: c.categoryId ?? 'none' }),
              }))}
          />
        </section>
        <section aria-labelledby="recent-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
          <SectionTitle id="recent-title" href="/transactions" linkLabel="Tutti">
            Ultimi movimenti
          </SectionTitle>
          {d.recent.length > 0 ? (
            <ul aria-label="Ultimi movimenti">
              {d.recent.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <TransactionRow tx={t} showDate />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-fg-muted">Nessun movimento.</p>
          )}
        </section>
      </div>
    </>
  )
}
