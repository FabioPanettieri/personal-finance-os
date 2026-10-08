import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, LineChart, RotateCcw } from 'lucide-react'
import Link from 'next/link'

import { Money } from '@/components/ui/money'
import { accountColor } from '@/lib/banks'
import { formatIsoDate, type IsoDate } from '@/lib/dates'
import type { Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

export type TransactionRowData = {
  id: string
  bookedOn: IsoDate
  description: string
  amount: Cents
  currency: string
  type: 'income' | 'expense' | 'transfer' | 'investment' | 'refund'
  accountName: string
  accountInstitution: string | null
  categoryName: string | null
  businessName: string | null
  isCategorized: boolean
  /** Solo per i trasferimenti: false = l'altra metà non è ancora collegata. */
  isTransferLinked?: boolean
}

const ICONS = { income: ArrowDownLeft, expense: ArrowUpRight, refund: RotateCcw, transfer: ArrowLeftRight, investment: LineChart }

/**
 * Riga movimento: icona nel colore della banca, descrizione, conto e
 * categoria, importo. I movimenti tra conti propri hanno importo neutro: non
 * sono né entrate né spese. "Da sistemare" in evidenza.
 */
export function TransactionRow({ tx, showDate = false }: { tx: TransactionRowData; showDate?: boolean }) {
  const Icon = ICONS[tx.type]
  const internal = tx.type === 'transfer' || tx.type === 'investment'
  const color = accountColor({ institution: tx.accountInstitution, name: tx.accountName })
  const detail = internal ? (tx.type === 'transfer' ? 'Tra i tuoi conti' : 'Investimento') : (tx.businessName ?? tx.categoryName)
  return (
    <Link href={`/transactions/${tx.id}`} className="-mx-2 flex items-center gap-3 rounded-[14px] px-2 py-2.5 transition-colors hover:bg-surface-2">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
      >
        <Icon className="size-[18px]" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-fg">{tx.description}</span>
        <span className="block truncate text-[13px] text-fg-muted">
          {!tx.isCategorized ? (
            <span className="font-medium text-warning">Da sistemare · </span>
          ) : internal && tx.isTransferLinked === false ? (
            <span className="font-medium text-fg">Da abbinare · </span>
          ) : null}
          {[tx.accountName, detail, showDate ? formatIsoDate(tx.bookedOn) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Money
        value={tx.amount}
        currency={tx.currency}
        signDisplay={internal ? 'never' : 'exceptZero'}
        className={cn('shrink-0 text-[15px] font-semibold', internal ? 'text-fg-muted' : tx.amount > 0 ? 'text-positive' : 'text-fg')}
      />
    </Link>
  )
}
