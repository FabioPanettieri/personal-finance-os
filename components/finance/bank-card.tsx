import Link from 'next/link'
import type { ReactNode } from 'react'

import { Money } from '@/components/ui/money'
import { accountColor, bankGradient } from '@/lib/banks'
import type { Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

type BankCardAccount = { id: string; name: string; institution: string | null; color: string | null; currency: string; balance: Cents; typeLabel: string }

/** Carta del conto con il colore della banca (Revolut viola, ING arancione, Trade Republic blu). */
export function BankCard({ account, footer, className }: { account: BankCardAccount; footer?: ReactNode; className?: string }) {
  const color = accountColor(account)
  return (
    <Link
      href={`/accounts/${account.id}`}
      data-testid={`bank-card-${account.name}`}
      className={cn(
        'group flex min-h-[156px] flex-col justify-between gap-6 rounded-[var(--radius-card)] p-5 text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]',
        className,
      )}
      style={{ background: bankGradient(color) }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-base font-bold tracking-[-0.01em]">{account.name}</span>
        <span className="shrink-0 text-xs font-medium text-white/75">{account.typeLabel}</span>
      </div>
      <div>
        <Money value={account.balance} currency={account.currency} emphasizeUnits className="text-[28px] font-bold tracking-[-0.02em] text-white [&_span]:text-white/80" />
        {footer ? <div className="mt-1 text-[13px] text-white/80">{footer}</div> : null}
      </div>
    </Link>
  )
}

/** Riga compatta per i conti secondari (deposito, carta…), con la barretta del colore della banca. */
export function AccountRow({ account, note }: { account: BankCardAccount; note?: ReactNode }) {
  return (
    <Link
      href={`/accounts/${account.id}`}
      data-testid={`account-row-${account.name}`}
      className="flex min-h-[72px] items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <span aria-hidden className="h-10 w-1 shrink-0 rounded-full" style={{ background: accountColor(account) }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-fg">{account.name}</span>
        <span className="block truncate text-[13px] text-fg-muted">{note ?? account.typeLabel}</span>
      </span>
      <Money value={account.balance} currency={account.currency} className="shrink-0 text-[17px] font-bold text-fg" />
    </Link>
  )
}
