import { Briefcase, User } from 'lucide-react'

import { Money } from '@/components/ui/money'
import type { ScopeTotals, SplitTotals } from '@/lib/dashboard/business'
import { cn } from '@/lib/utils/cn'

function Column({ title, icon: Icon, totals, currency, netLabel, testId }: { title: string; icon: typeof User; totals: ScopeTotals; currency: string; netLabel: string; testId: string }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-3 rounded-[18px] bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-fg">
        <Icon aria-hidden className="size-4 text-fg-muted" /> {title}
      </p>
      <dl className="flex flex-col gap-1.5 text-[14px]">
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">Entrate</dt>
          <dd>
            <Money value={totals.income} currency={currency} className="font-semibold text-fg" />
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

/** Personale e business affiancati: ogni movimento sta in una sola colonna, la somma è il totale. */
export function SplitOverview({ split, currency }: { split: SplitTotals; currency: string }) {
  return (
    <section aria-labelledby="split-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
      <h2 id="split-title" className="mb-1 text-[17px] font-semibold text-fg">
        Personale e business
      </h2>
      <p className="mb-4 text-[13px] text-fg-muted">
        Un movimento è business solo se ha un business assegnato: nessuno è contato due volte. I trasferimenti tra i tuoi conti non compaiono qui.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Column title="Personale" icon={User} totals={split.personal} currency={currency} netLabel="Ti restano" testId="split-personal" />
        <Column title="Business" icon={Briefcase} totals={split.business} currency={currency} netLabel="Utile" testId="split-business" />
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
