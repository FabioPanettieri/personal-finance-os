import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import type { CurrencyTotals } from '@/lib/accounts'

/** Somma dei saldi per valuta: una card per valuta, mai somme tra valute diverse. */
export function AccountTotals({ totals }: { totals: CurrencyTotals[] }) {
  return (
    <div className="grid gap-3 lg:gap-4">
      {totals.map((t) => (
        <Card key={t.currency}>
          <p className="text-[12px] font-medium tracking-wider text-fg-muted uppercase">
            Saldo complessivo{totals.length > 1 ? ` · ${t.currency}` : ''}
          </p>
          <p className="mt-2 text-4xl font-semibold tracking-[-0.03em] text-fg lg:text-[44px]">
            <Money value={t.total} currency={t.currency} emphasizeUnits className="[font-variant-numeric:normal]" />
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:flex sm:flex-wrap">
            <div>
              <dt className="text-fg-muted">Liquidità</dt>
              <dd className="font-medium text-fg">
                <Money value={t.liquid} currency={t.currency} />
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">Conti investimento (versato netto)</dt>
              <dd className="font-medium text-fg">
                <Money value={t.investment} currency={t.currency} />
              </dd>
            </div>
            {t.other !== 0 ? (
              <div>
                <dt className="text-fg-muted">Altri conti</dt>
                <dd className="font-medium text-fg">
                  <Money value={t.other} currency={t.currency} />
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-4 text-xs text-fg-subtle">
            Somma dei saldi di tutti i conti, compresi i disattivati. I trasferimenti tra conti propri si compensano e
            non aumentano il totale. Il valore di mercato degli investimenti arriverà con lo Sprint 8.
          </p>
        </Card>
      ))}
    </div>
  )
}
