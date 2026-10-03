import { TrendingDown, TrendingUp } from 'lucide-react'

import { formatPercent } from '@/lib/money'

import { Badge } from './badge'

/**
 * Variazione percentuale. `goodWhen` dice se l'aumento è favorevole (entrate)
 * o sfavorevole (spese): il colore segue il significato, non il segno.
 * Mai solo colore: anche segno e icona.
 */
export function DeltaBadge({ ratio, goodWhen = 'up' }: { ratio: number | null; goodWhen?: 'up' | 'down' }) {
  if (ratio === null || !Number.isFinite(ratio)) {
    return <Badge tone="neutral">—</Badge>
  }
  if (ratio === 0) {
    return <Badge tone="neutral">{formatPercent(0)}</Badge>
  }
  const isUp = ratio > 0
  const isGood = goodWhen === 'up' ? isUp : !isUp
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <Badge tone={isGood ? 'positive' : 'negative'}>
      <Icon aria-hidden className="size-3.5" />
      <span className="tabular">{formatPercent(ratio, 'it-IT', 'exceptZero')}</span>
    </Badge>
  )
}
