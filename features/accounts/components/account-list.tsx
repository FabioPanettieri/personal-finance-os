import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { formatIsoDate } from '@/lib/dates'
import type { Account } from '@/server/repositories/accounts'

import { AccountTypeBadge } from './account-type-badge'

export function AccountAvatar({ account, size = 'md' }: { account: Pick<Account, 'name' | 'color'>; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={
        size === 'lg'
          ? 'grid size-12 shrink-0 place-items-center rounded-[12px] text-base font-semibold text-white'
          : 'grid size-10 shrink-0 place-items-center rounded-[10px] text-sm font-semibold text-white'
      }
      style={{ backgroundColor: account.color ?? 'var(--fg-subtle)' }}
    >
      {account.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function activityLabel(account: Account): string {
  if (account.transactionCount === 0) return 'Nessuna transazione'
  const count = account.transactionCount === 1 ? '1 transazione' : `${account.transactionCount} transazioni`
  return account.lastTransactionOn ? `${count} · ultima ${formatIsoDate(account.lastTransactionOn)}` : count
}

export function AccountList({ accounts, label }: { accounts: Account[]; label: string }) {
  return (
    <Card className="p-0 lg:p-0">
      <ul aria-label={label} className="divide-y divide-line">
        {accounts.map((account) => (
          <li key={account.id}>
            <Link
              href={`/accounts/${account.id}`}
              className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:gap-4 sm:px-5"
            >
              <AccountAvatar account={account} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate text-[15px] font-medium text-fg">{account.name}</p>
                  <AccountTypeBadge type={account.type} />
                  {account.isActive ? null : <Badge tone="warning">Disattivato</Badge>}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-fg-muted">
                  {[account.institution, account.currency].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-0.5 text-xs text-fg-subtle">{activityLabel(account)}</p>
              </div>
              <div className="text-right">
                <Money value={account.balance} currency={account.currency} className="text-[15px] font-semibold text-fg" />
                <p className="text-xs text-fg-subtle">Saldo</p>
              </div>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
