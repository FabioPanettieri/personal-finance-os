import { Money } from '@/components/ui/money'
import { formatIsoDate } from '@/lib/dates'
import { formatPercent, type Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'
import type { GoalView } from '@/server/services/goals'

/** Riepilogo di un obiettivo: barra, importi, scadenza e quanto serve al mese. */
export function GoalSummary({ goal, compact = false }: { goal: GoalView; compact?: boolean }) {
  const p = goal.progress
  const statusText =
    p.status === 'achieved'
      ? 'Obiettivo raggiunto'
      : p.status === 'overdue'
        ? `Scaduto il ${formatIsoDate(goal.deadline!)}`
        : p.monthlyNeeded !== null
          ? null
          : goal.tracking === 'linked_accounts'
            ? `Dai saldi di ${goal.accountNames.join(', ')}`
            : 'Senza scadenza'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('min-w-0 truncate font-semibold text-fg', compact ? 'text-[15px]' : 'text-[17px]')}>{goal.name}</p>
        <span className={cn('shrink-0 text-[13px] font-semibold', p.status === 'achieved' ? 'text-positive' : 'text-fg-muted')}>{formatPercent(p.ratio)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Avanzamento di ${goal.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p.ratio * 100)}
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={cn('h-full rounded-full', p.status === 'achieved' ? 'bg-positive' : p.status === 'overdue' ? 'bg-warning' : 'bg-fg')} style={{ width: `${Math.max(p.ratio > 0 ? 2 : 0, p.ratio * 100)}%` }} />
      </div>
      <p className="text-[13px] text-fg-muted">
        <Money value={p.current as Cents} currency="EUR" className="font-semibold text-fg" /> di <Money value={goal.targetCents as Cents} currency="EUR" />
        {p.status === 'active' && p.monthlyNeeded !== null ? (
          <>
            {' · '}
            <span data-testid="goal-monthly">
              servono <Money value={p.monthlyNeeded as Cents} currency="EUR" className="font-semibold text-fg" /> al mese fino al {formatIsoDate(goal.deadline!)}
            </span>
          </>
        ) : statusText ? (
          ` · ${statusText}`
        ) : null}
      </p>
    </div>
  )
}
