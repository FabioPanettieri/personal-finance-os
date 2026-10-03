'use client'

import { useMemo, useState } from 'react'

import { BalanceChart } from '@/features/accounts/components/balance-chart'
import { addDays, type IsoDate } from '@/lib/dates'
import { NET_WORTH_RANGES, netWorthSeries, type NetWorthPoint, type NetWorthRange } from '@/lib/dashboard/metrics'
import { addMonths } from '@/lib/dashboard/period'
import { cn } from '@/lib/utils/cn'

const RANGE_LABELS: Record<NetWorthRange, string> = { '30d': '30 giorni', '90d': '90 giorni', '6m': '6 mesi', '1y': '1 anno', all: 'Tutto' }

function rangeStart(range: NetWorthRange, today: IsoDate): IsoDate | null {
  switch (range) {
    case '30d':
      return addDays(today, -29)
    case '90d':
      return addDays(today, -89)
    case '6m':
      return addMonths(today, -6)
    case '1y':
      return addMonths(today, -12)
    default:
      return null
  }
}

/**
 * Patrimonio netto nel tempo: somma dei saldi dei conti a fine giornata
 * (stessa logica di account_balances), solo dai dati esistenti.
 */
export function NetWorthChart({ history, today, currency }: { history: NetWorthPoint[]; today: IsoDate; currency: string }) {
  const [range, setRange] = useState<NetWorthRange>('90d')
  const points = useMemo(() => netWorthSeries(history, rangeStart(range, today), today), [history, range, today])

  return (
    <div>
      <div role="group" aria-label="Intervallo del grafico" className="mb-3 flex flex-wrap gap-1">
        {NET_WORTH_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className={cn(
              'min-h-11 rounded-full px-3 text-xs font-medium transition-colors sm:min-h-8',
              range === r ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>
      {points.length >= 2 ? (
        <BalanceChart points={points} currency={currency} label={`Patrimonio netto, ${RANGE_LABELS[range].toLowerCase()}`} />
      ) : (
        <p className="grid h-48 place-items-center rounded-[var(--radius-control)] bg-surface-2 px-6 text-center text-sm text-fg-muted">
          {history.length === 0
            ? 'Nessun movimento ancora: lo storico parte dalla prima importazione.'
            : 'Un solo giorno di dati: l’andamento comparirà con i prossimi movimenti.'}
        </p>
      )}
    </div>
  )
}
