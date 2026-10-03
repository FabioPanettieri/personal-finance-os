import Link from 'next/link'

import { Money } from '@/components/ui/money'
import type { DashboardAccount } from '@/server/services/dashboard'
import { formatIsoDate } from '@/lib/dates'

/**
 * Un riquadro per conto. Il saldo è quello di account_balances (lo stesso
 * della pagina Conti); la variazione è la somma dei movimenti del periodo.
 */
export function AccountOverview({ accounts, periodLabel }: { accounts: DashboardAccount[]; periodLabel: string }) {
  const active = accounts.filter((a) => a.isActive || a.balance !== 0)
  return (
    <ul aria-label="Conti" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {active.map((a) => {
        const isCard = a.type.code === 'card'
        return (
          <li key={a.id}>
            <Link
              href={`/accounts/${a.id}`}
              className="flex h-full flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:bg-surface-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color ?? 'var(--fg-subtle)' }} />
                  <span className="truncate text-sm font-medium text-fg">{a.name}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-muted">{a.type.label}</span>
              </div>
              <Money value={a.balance} currency={a.currency} emphasizeUnits className="text-xl font-semibold tracking-[-0.01em] text-fg" />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-fg-muted">
                <span>
                  {periodLabel}:{' '}
                  {a.periodChange === null ? (
                    'nessun movimento'
                  ) : (
                    <Money value={a.periodChange} currency={a.currency} signDisplay="exceptZero" className="font-medium text-fg" />
                  )}
                </span>
                <span>{a.lastTransactionOn ? `Ultimo ${formatIsoDate(a.lastTransactionOn)}` : 'Nessun movimento'}</span>
              </div>
              {isCard && a.balance > 0 ? (
                <p className="text-xs text-fg-subtle">Addebiti saldati dal conto: le spese della carta non sono importate.</p>
              ) : null}
              {a.investedAtCost !== null && a.investedAtCost !== 0 ? (
                <p className="text-xs text-fg-subtle">
                  Di cui investiti al costo <Money value={a.investedAtCost} currency={a.currency} />
                </p>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
