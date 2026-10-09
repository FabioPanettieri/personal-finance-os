import { Briefcase, User } from 'lucide-react'

import { Money } from '@/components/ui/money'
import type { ScopeTotals, SplitTotals } from '@/lib/dashboard/business'
import { cn } from '@/lib/utils/cn'

const PERSONAL = 'var(--chart-income)'
const BUSINESS = '#7C6CF2'

function Column({
  title,
  icon: Icon,
  totals,
  currency,
  netLabel,
  testId,
  color,
}: {
  title: string
  icon: typeof User
  totals: ScopeTotals
  currency: string
  netLabel: string
  testId: string
  color: string
}) {
  return (
    <div data-testid={testId} className="relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[18px] border border-line bg-surface-2 p-4">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <p className="flex items-center gap-2 text-[14px] font-semibold text-fg">
        <span className="grid size-7 place-items-center rounded-full text-white" style={{ background: color }}>
          <Icon aria-hidden className="size-3.5" />
        </span>
        {title}
      </p>
      <dl className="flex flex-col gap-1.5 text-[14px]">
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">Entrate</dt>
          <dd>
            <Money value={totals.income} currency={currency} className="font-semibold text-positive" />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">Uscite</dt>
          <dd>
            <Money value={totals.expenses} currency={currency} className="font-semibold text-fg" />
          </dd>
        </div>
        <div className="mt-1 flex justify-between gap-3 border-t border-line pt-2">
          <dt className="font-medium text-fg">{netLabel}</dt>
          <dd>
            <Money
              value={totals.net}
              currency={currency}
              signDisplay="exceptZero"
              className={cn('text-[17px] font-bold', totals.net > 0 ? 'text-positive' : totals.net < 0 ? 'text-negative' : 'text-fg')}
            />
          </dd>
        </div>
      </dl>
    </div>
  )
}

/** Barra divisa in due: quanto pesa il business su entrate o uscite. */
function ShareBar({ label, personal, business }: { label: string; personal: number; business: number }) {
  const total = personal + business
  const businessShare = total > 0 ? business / total : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[12px] text-fg-muted">
        <span>{label}</span>
        <span>{total > 0 ? `${Math.round(businessShare * 100)}% business` : '—'}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${label}: ${Math.round(businessShare * 100)}% business`}>
        {total > 0 ? (
          <>
            <span style={{ width: `${(1 - businessShare) * 100}%`, background: PERSONAL }} />
            <span style={{ width: `${businessShare * 100}%`, background: BUSINESS }} />
          </>
        ) : null}
      </div>
    </div>
  )
}

/** Personale e business affiancati: ogni movimento sta in una sola colonna, la somma è il totale. */
export function SplitOverview({ split, currency }: { split: SplitTotals; currency: string }) {
  return (
    <section aria-labelledby="split-title" className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
      <h2 id="split-title" className="mb-1 text-[17px] font-semibold text-fg">
        Personale e business
      </h2>
      <p className="mb-4 text-[13px] text-fg-muted">
        Ogni movimento sta in una sola colonna: è “business” solo se gli hai assegnato un’attività. I giroconti tra i tuoi conti non contano.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Column title="Personale" icon={User} totals={split.personal} currency={currency} netLabel="Ti restano" testId="split-personal" color={PERSONAL} />
        <Column title="Business" icon={Briefcase} totals={split.business} currency={currency} netLabel="Utile" testId="split-business" color={BUSINESS} />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <ShareBar label="Entrate" personal={split.personal.income} business={split.business.income} />
        <ShareBar label="Uscite" personal={split.personal.expenses} business={split.business.expenses} />
      </div>
      <p className="mt-3 flex flex-wrap justify-between gap-2 text-[13px] text-fg-muted" data-testid="split-total">
        <span>Totale (personale + business)</span>
        <span>
          Entrate <Money value={split.total.income} currency={currency} className="font-semibold text-fg" /> · Uscite{' '}
          <Money value={split.total.expenses} currency={currency} className="font-semibold text-fg" />
        </span>
      </p>
    </section>
  )
}
