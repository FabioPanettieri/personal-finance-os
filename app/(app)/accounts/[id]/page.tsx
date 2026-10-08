import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, LineChart, ListOrdered } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'

import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { AccountActiveToggle } from '@/features/accounts/components/account-active-toggle'
import { AccountEditForm } from '@/features/accounts/components/account-edit-form'
import { BalanceChart } from '@/features/accounts/components/balance-chart'
import { accountIdSchema } from '@/features/accounts/schemas'
import { accountColor, bankForAccount, bankGradient } from '@/lib/banks'
import { balanceSeries, movementsInBalanceWindow, summarizeFlows } from '@/lib/accounts'
import { formatIsoDate } from '@/lib/dates'
import { formatAmountInput } from '@/lib/money/parse'
import { requireUser } from '@/server/auth/session'
import { getAccount, listAccountMovements } from '@/server/repositories/accounts'
import { createSupabaseServerClient } from '@/server/supabase/server'

type Params = { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: 'Dettaglio conto' }

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4 lg:p-5">
      <span className="text-[12px] font-medium tracking-wide text-fg-muted uppercase">{label}</span>
      <span className="text-lg font-semibold text-fg lg:text-xl">{children}</span>
      {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
    </Card>
  )
}

export default async function AccountDetailPage({ params }: Params) {
  const { id } = await params
  await requireUser(`/accounts/${id}`)
  if (!accountIdSchema.safeParse(id).success) notFound()

  const db = await createSupabaseServerClient()
  const account = await getAccount(db, id)
  if (!account) notFound()

  const movements = await listAccountMovements(db, id)
  const windowed = movementsInBalanceWindow(movements, account.initialBalanceOn)
  const flows = summarizeFlows(windowed)
  const series = balanceSeries(movements, account.initialBalance, account.initialBalanceOn)
  const isInvestment = account.type.kind === 'investment'
  const windowLabel = account.initialBalanceOn ? `Dal ${formatIsoDate(account.initialBalanceOn)}` : 'Tutti i movimenti'

  return (
    <>
      <Link
        href="/accounts"
        className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Conti
      </Link>

      <header
        className="mb-6 flex flex-col gap-6 rounded-[var(--radius-card)] p-5 text-white sm:flex-row sm:items-end sm:justify-between lg:mb-8 lg:p-6"
        style={{ background: bankGradient(accountColor(account)) }}
      >
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-[-0.02em] lg:text-[28px]">{account.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
            {account.institution ? <span>{account.institution}</span> : null}
            <span>· {account.type.label}</span>
            <span>· {account.currency}</span>
            {account.isActive ? null : <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-semibold">Disattivato</span>}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-[13px] font-medium text-white/75">Saldo</p>
          <p className="text-[34px] font-bold tracking-[-0.02em] lg:text-[40px]">
            <Money value={account.balance} currency={account.currency} emphasizeUnits className="text-white [font-variant-numeric:normal] [&_span]:text-white/80" />
          </p>
        </div>
      </header>

      <section aria-label="Riepilogo movimenti" className="mb-4 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-4 lg:gap-4">
        <Stat label="Entrate" hint={windowLabel}>
          <Money value={flows.income} currency={account.currency} />
        </Stat>
        <Stat label="Uscite" hint={flows.refunds > 0 ? 'Al netto dei rimborsi' : windowLabel}>
          <Money value={flows.netExpenses} currency={account.currency} />
        </Stat>
        <Stat label="Trasferimenti" hint="Tra conti propri: non sono entrate né spese">
          <span className="flex flex-col text-base lg:text-lg">
            <span className="inline-flex items-center gap-1">
              <ArrowDownLeft aria-label="In entrata" className="size-4 text-fg-subtle" />
              <Money value={flows.transfersIn} currency={account.currency} />
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowUpRight aria-label="In uscita" className="size-4 text-fg-subtle" />
              <Money value={flows.transfersOut} currency={account.currency} />
            </span>
          </span>
        </Stat>
        <Stat
          label="Transazioni"
          hint={account.lastTransactionOn ? `Ultima attività ${formatIsoDate(account.lastTransactionOn)}` : 'Nessuna attività'}
        >
          <span className="tabular">{account.transactionCount}</span>
        </Stat>
      </section>

      {flows.investedOut > 0 || flows.investedIn > 0 ? (
        <Card className="mb-4 flex items-center gap-3 p-4 lg:mb-6">
          <LineChart aria-hidden className="size-5 text-accent" />
          <p className="text-sm text-fg-muted">
            Versati verso investimenti:{' '}
            <Money value={flows.investedOut} currency={account.currency} className="font-medium text-fg" />
            {flows.investedIn > 0 ? (
              <>
                {' '}
                · rientrati: <Money value={flows.investedIn} currency={account.currency} className="font-medium text-fg" />
              </>
            ) : null}
          </p>
        </Card>
      ) : null}

      {isInvestment ? (
        <p className="mb-4 rounded-[var(--radius-control)] bg-accent-soft px-4 py-3 text-sm text-fg lg:mb-6">
          Per i conti investimento il saldo riflette solo i movimenti di liquidità (versamenti e prelievi). Valore di
          mercato e rendimento arriveranno con lo Sprint 8.
        </p>
      ) : null}

      <Card className="mb-4 lg:mb-6">
        <CardHeader title="Andamento del saldo" description={series.length >= 2 ? windowLabel : undefined} />
        {series.length >= 2 ? (
          <BalanceChart points={series} currency={account.currency} label={`Andamento del saldo di ${account.name}`} />
        ) : (
          <EmptyState
            icon={account.transactionCount === 0 ? ListOrdered : ArrowLeftRight}
            title={account.transactionCount === 0 ? 'Nessuna transazione' : 'Dati insufficienti per il grafico'}
            description={
              account.transactionCount === 0
                ? 'Il grafico comparirà dopo la prima importazione dei movimenti (Sprint 3).'
                : 'Servono movimenti in almeno due giorni diversi per disegnare l’andamento.'
            }
          />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="Impostazioni del conto" description={`Valuta ${account.currency} · tipo ${account.type.label} (non modificabili)`} />
          <AccountEditForm
            accountId={account.id}
            fixedColor={bankForAccount(account) !== null}
            values={{
              name: account.name,
              institution: account.institution ?? '',
              color: account.color,
              initialBalance: formatAmountInput(account.initialBalance),
              initialBalanceOn: account.initialBalanceOn ?? '',
              iban: account.iban ?? '',
              currency: account.currency,
            }}
          />
        </Card>
        <Card>
          <CardHeader title="Stato" />
          <AccountActiveToggle accountId={account.id} isActive={account.isActive} />
        </Card>
      </div>
    </>
  )
}
