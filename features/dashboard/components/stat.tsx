import type { ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { DeltaBadge } from '@/components/ui/delta-badge'
import { Money } from '@/components/ui/money'
import type { Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

/**
 * Indicatore della dashboard: etichetta, numero grande, confronto neutro con
 * il periodo precedente (solo se significativo) e una nota.
 */
export function Stat({
  label,
  value,
  currency,
  ratio,
  ratioLabel,
  goodWhen = 'up',
  note,
  hero = false,
  className,
  testId,
}: {
  label: string
  value: Cents | null
  currency: string
  ratio?: number | null
  ratioLabel?: string | null
  goodWhen?: 'up' | 'down'
  note?: ReactNode
  hero?: boolean
  className?: string
  testId?: string
}) {
  return (
    <Card className={cn('flex flex-col gap-2 p-4 lg:p-5', className)} data-testid={testId}>
      <p className="text-[12px] font-medium tracking-wide text-fg-muted uppercase">{label}</p>
      <p className={cn('font-semibold tracking-[-0.02em] text-fg', hero ? 'text-3xl lg:text-4xl' : 'text-2xl lg:text-[28px]')}>
        {value === null ? <span className="text-fg-subtle">—</span> : <Money value={value} currency={currency} emphasizeUnits />}
      </p>
      {ratio !== undefined ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          {ratio === null ? (
            <span>Nessun confronto: dati del periodo precedente insufficienti</span>
          ) : (
            <>
              <DeltaBadge ratio={ratio} goodWhen={goodWhen} />
              <span>{ratioLabel}</span>
            </>
          )}
        </p>
      ) : null}
      {note ? <div className="text-xs text-fg-muted">{note}</div> : null}
    </Card>
  )
}
