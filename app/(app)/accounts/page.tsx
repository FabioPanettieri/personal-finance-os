import { ChevronRight, Landmark, LineChart } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { AccountRow, BankCard } from '@/components/finance/bank-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { splitAccounts } from '@/features/accounts/split'
import { totalsByCurrency } from '@/lib/accounts'
import { formatIsoDate } from '@/lib/dates'
import { requireUser } from '@/server/auth/session'
import { listAccounts, type Account } from '@/server/repositories/accounts'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Conti' }

function activity(account: Account): string {
  if (account.transactionCount === 0) return 'Nessun movimento'
  const count = account.transactionCount === 1 ? '1 movimento' : `${account.transactionCount} movimenti`
  return account.lastTransactionOn ? `${count} · ultimo ${formatIsoDate(account.lastTransactionOn)}` : count
}

/** Le carte grandi per Revolut, ING e Trade Republic; righe compatte per gli altri conti. */
function AccountGrid({ accounts, label }: { accounts: Account[]; label: string }) {
  const { main, other } = splitAccounts(accounts.map((a) => ({ ...a, isActive: true })))
  return (
    <ul aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-6 lg:gap-4">
      {main.map((a) => (
        <li key={a.id} className="sm:col-span-2">
          <BankCard account={{ ...a, typeLabel: a.type.label }} footer={activity(a)} />
        </li>
      ))}
      {other.map((a) => (
        <li key={a.id} className="sm:col-span-3">
          <AccountRow account={{ ...a, typeLabel: a.type.label }} note={`${a.type.label} · ${activity(a)}`} />
        </li>
      ))}
    </ul>
  )
}

/** I tuoi conti: saldi calcolati dai movimenti, mai inseriti a mano. */
export default async function AccountsPage() {
  await requireUser('/accounts')
  const accounts = await listAccounts(await createSupabaseServerClient())

  const header = (
    <header className="mb-5">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Conti</h1>
      <p className="mt-1 text-[15px] text-fg-muted">Saldi calcolati dai movimenti importati.</p>
    </header>
  )

  if (accounts.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={Landmark}
          title="Nessun conto"
          description="I conti iniziali vengono creati con il tuo account. Se non li vedi, verifica che le migration del database siano applicate."
        />
      </>
    )
  }

  const active = accounts.filter((a) => a.isActive)
  const inactive = accounts.filter((a) => !a.isActive)
  const totals = totalsByCurrency(accounts.map((a) => ({ currency: a.currency, balance: a.balance, kind: a.type.kind })))

  return (
    <>
      {header}
      <div className="flex flex-col gap-6 lg:gap-8">
        {totals.map((t) => (
          <section key={t.currency} aria-label={`Totale ${t.currency}`} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
            <p className="text-[13px] font-medium text-fg-muted">Saldo complessivo{totals.length > 1 ? ` · ${t.currency}` : ''}</p>
            <Money value={t.total} currency={t.currency} emphasizeUnits className="mt-1 block text-[36px] font-bold tracking-[-0.03em] text-fg lg:text-[44px]" />
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-fg-muted">Liquidità</dt>
                <dd className="font-semibold text-fg">
                  <Money value={t.liquid} currency={t.currency} />
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">Investimenti (versato)</dt>
                <dd className="font-semibold text-fg">
                  <Money value={t.investment} currency={t.currency} />
                </dd>
              </div>
              {t.other !== 0 ? (
                <div>
                  <dt className="text-fg-muted">Altri conti</dt>
                  <dd className="font-semibold text-fg">
                    <Money value={t.other} currency={t.currency} />
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-xs text-fg-subtle">I soldi spostati tra i tuoi conti non cambiano il totale.</p>
          </section>
        ))}

        <Link
          href="/investments"
          className="flex min-h-[72px] items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: 'var(--bank-tr)' }}>
            <LineChart aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-fg">Investimenti</span>
            <span className="block text-[13px] text-fg-muted">Valore dei titoli, rendimento e piani di accumulo</span>
          </span>
          <ChevronRight aria-hidden className="size-5 text-fg-subtle" />
        </Link>

        <section aria-labelledby="active-accounts">
          <h2 id="active-accounts" className="mb-3 text-[17px] font-semibold text-fg">
            I tuoi conti
          </h2>
          {active.length > 0 ? (
            <AccountGrid accounts={active} label="Conti attivi" />
          ) : (
            <EmptyState icon={Landmark} title="Nessun conto attivo" description="Riattiva un conto dall’elenco qui sotto." />
          )}
        </section>

        {inactive.length > 0 ? (
          <section aria-labelledby="inactive-accounts">
            <h2 id="inactive-accounts" className="mb-3 text-[17px] font-semibold text-fg-muted">
              Disattivati · {inactive.length}
            </h2>
            <AccountGrid accounts={inactive} label="Conti disattivati" />
          </section>
        ) : null}
      </div>
    </>
  )
}
