import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Cents } from '@/lib/money'

import { Card } from './card'
import { Money } from './money'

/** Card KPI della dashboard. `value: null` = nessun dato (non zero). */
export function KpiCard({
  label,
  value,
  icon: Icon,
  footer,
}: {
  label: string
  value: Cents | null
  icon: LucideIcon
  footer?: ReactNode
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 lg:p-5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium tracking-wide text-fg-muted uppercase">{label}</span>
        <Icon aria-hidden className="size-4 text-fg-subtle" />
      </div>
      <div className="text-xl font-semibold tracking-[-0.01em] text-fg lg:text-2xl">
        {value === null ? <span className="text-fg-subtle">—</span> : <Money value={value} />}
      </div>
      {footer ? <div className="text-xs text-fg-muted">{footer}</div> : null}
    </Card>
  )
}
