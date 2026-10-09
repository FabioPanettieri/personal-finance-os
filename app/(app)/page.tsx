import { ChevronRight, DatabaseBackup, FileText, FileUp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { AccountRow, BankCard } from '@/components/finance/bank-card'
import { SectionTitle } from '@/components/finance/section-title'
import { TransactionRow } from '@/components/finance/transaction-row'
import { Money } from '@/components/ui/money'
import { GoalSummary } from '@/features/goals/components/goal-card'
import { MonthSummary, NetWorthHero, PeriodTabs, ReviewBanner, SpendingList } from '@/features/dashboard/components/home'
import { splitAccounts } from '@/features/accounts/split'
import { DEFAULT_TIME_ZONE, today } from '@/lib/dates'
import { transactionsHref } from '@/lib/transactions/filters'
import { getProfile, requireUser } from '@/server/auth/session'
import { loadDashboard } from '@/server/services/dashboard'
import { readBackupStatus } from '@/server/services/backup-status'
import { loadGoals } from '@/server/services/goals'
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
  const db = await createSupabaseServerClient()
  const [d, goals] = await Promise.all([loadDashboard(db, { period: one('period'), from: one('from'), to: one('to') }, now, timeZone), loadGoals(db, now)])
  const { period, currency } = d
  const range = { from: period.from, to: period.to }
  const name = profile?.display_name?.trim().split(/\s+/)[0]
  const { main, other } = splitAccounts(d.accounts)
  const backup = readBackupStatus()

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

      <div className="mb-6 flex flex-col gap-3 lg:mb-8">
        <ReviewBanner transactions={d.review.transactions} importRows={d.review.importRows} />
        {d.hasData && backup.kind !== 'ok' ? (
          <Link
            href="/settings/backup"
            data-testid="backup-warning"
            className="flex min-h-[64px] items-center gap-4 rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft px-5 py-3 transition-colors hover:bg-surface-2"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-warning">
              <DatabaseBackup aria-hidden className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-fg">{backup.kind === 'none' ? 'Nessun backup dei tuoi dati' : `Ultimo backup ${backup.days} giorni fa`}</span>
              <span className="block text-[13px] text-fg-muted">Si fa da solo all’avvio di Finanze sul PC. Tocca per i dettagli.</span>
            </span>
            <ChevronRight aria-hidden className="size-5 text-fg-subtle" />
          </Link>
        ) : null}
        <Link
          href="/reports"
          data-testid="report-link"
          className="flex min-h-[64px] items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-3 transition-colors hover:bg-surface-2"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-fg">
            <FileText aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-fg">Report del mese</span>
            <span className="block text-[13px] text-fg-muted">Settimana, mese e anno in poche righe, con il confronto</span>
          </span>
          <ChevronRight aria-hidden className="size-5 text-fg-subtle" />
        </Link>
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

      <section aria-labelledby="goals-title" data-testid="home-goals" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:mb-8 lg:p-6">
        <SectionTitle id="goals-title" href="/goals" linkLabel={goals.length > 0 ? 'Tutti' : 'Crea'}>
          Obiettivi
        </SectionTitle>
        {goals.length > 0 ? (
          <ul aria-label="Obiettivi in corso" className="grid gap-5 lg:grid-cols-3">
            {goals.slice(0, 3).map((g) => (
              <li key={g.id}>
                <Link href="/goals" className="block rounded-[14px] hover:opacity-90">
                  <GoalSummary goal={g} compact />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Link href="/goals" className="block py-2 text-[14px] text-fg-muted hover:text-fg">
            Nessun obiettivo: crea il primo (fondo emergenze, vacanza, un acquisto…) e segui quanto manca.
          </Link>
        )}
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
