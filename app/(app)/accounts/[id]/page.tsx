import { ArrowLeft, ArrowLeftRight, LineChart, ListOrdered } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { AccountActiveToggle } from '@/features/accounts/components/account-active-toggle'
import { AccountEditForm } from '@/features/accounts/components/account-edit-form'
import { BalanceChart } from '@/features/accounts/components/balance-chart'
import { AccountFlowTiles } from '@/features/accounts/components/flow-tiles'
import { accountIdSchema } from '@/features/accounts/schemas'
import { accountColor, bankForAccount, bankGradient } from '@/lib/banks'
import { balanceSeries, monthlyAccountFlows, movementsInBalanceWindow, summarizeFlows, type MonthlyAccountFlow } from '@/lib/accounts'
import { DEFAULT_TIME_ZONE, formatIsoDate, today } from '@/lib/dates'
import type { Cents } from '@/lib/money'
import { transactionsHref } from '@/lib/transactions/filters'
import { formatAmountInput } from '@/lib/money/parse'
import { requireUser } from '@/server/auth/session'
import { getAccount, listAccountMovements, type Account } from '@/server/repositories/accounts'
import { createSupabaseServerClient } from '@/server/supabase/server'

type Params = { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: 'Dettaglio conto' }

/** Carta di credito: plafond mensile e quanto ne hai usato con l'ultimo addebito. */
function CardLimit({ account, monthly }: { account: Account; monthly: MonthlyAccountFlow[] }) {
  const last = [...monthly].reverse().find((m) => m.spending > 0)
  const limit = account.creditLimit
  const share = limit && last ? Math.min(1, last.spending / limit) : 0
  return (
    <Card className="mb-4 lg:mb-6" data-testid="card-limit">
      <CardHeader
        title="Plafond della carta"
        description="Il dettaglio degli acquisti non c’è: ogni addebito mensile sul conto conta come spesa “Carta di credito”."
      />
      {limit ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-sm text-fg-muted">
              {last ? (
                <>
                  Ultimo addebito{' '}
                  <span className="font-semibold text-fg capitalize">{MONTH_LONG.format(new Date(`${last.month}T00:00:00Z`))}</span>:{' '}
                  <Money value={last.spending} currency={account.currency} className="font-semibold text-fg" />
                </>
              ) : (
                'Nessun addebito negli ultimi mesi.'
              )}
            </p>
            <p className="text-sm text-fg-muted">
              Plafond <Money value={limit} currency={account.currency} className="font-semibold text-fg" /> al mese
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Usato il ${Math.round(share * 100)}% del plafond`}>
            <div
              className="h-full rounded-full"
              style={{ width: `${share * 100}%`, background: share > 0.85 ? 'var(--negative)' : share > 0.6 ? 'var(--warning)' : 'var(--positive)' }}
            />
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            Usato il {Math.round(share * 100)}% · disponibili{' '}
            <Money value={Math.max(0, limit - (last?.spending ?? 0)) as Cents} currency={account.currency} className="font-medium text-fg" />
          </p>
        </>
      ) : (
        <p className="text-sm text-fg-muted">Imposta il plafond mensile qui sotto, in “Impostazioni del conto”.</p>
      )}
    </Card>
  )
}

const MONTH_LONG = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' })

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
  const monthly = monthlyAccountFlows(windowed, today(DEFAULT_TIME_ZONE))
  const isTradeRepublic = account.institution === 'Trade Republic'
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

      <AccountFlowTiles
        flows={flows}
        monthly={monthly}
        currency={account.currency}
        windowLabel={windowLabel}
        transactionCount={account.transactionCount}
        lastActivity={account.lastTransactionOn ? `Ultima attività ${formatIsoDate(account.lastTransactionOn)}` : 'Nessuna attività'}
        hrefs={{
          income: transactionsHref({ accountId: account.id, type: 'income' }),
          spending: transactionsHref({ accountId: account.id, type: 'spending' }),
          transfers: transactionsHref({ accountId: account.id, type: 'transfer' }),
          all: transactionsHref({ accountId: account.id }),
        }}
      />

      {account.type.code === 'card' ? <CardLimit account={account} monthly={monthly} /> : null}

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
          {isTradeRepublic
            ? 'Conto d’appoggio per il PAC: i soldi che arrivano qui servono a comprare gli ETF del piano di accumulo. Non sono spese: i versamenti contano come investimento, gli acquisti del PAC compaiono in Investimenti. '
            : null}
          Il saldo qui è la liquidità del conto; valore dei titoli e rendimento sono in{' '}
          <Link href="/investments" className="font-semibold underline">
            Investimenti
          </Link>
          .
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
              ...(account.type.code === 'card' ? { creditLimit: account.creditLimit ? formatAmountInput(account.creditLimit) : '' } : {}),
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
