import { LineChart } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { SectionTitle } from '@/components/finance/section-title'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { PlanActions, PlanForm, PriceForm } from '@/features/investments/components/forms'
import { accountColor, bankGradient } from '@/lib/banks'
import { DEFAULT_TIME_ZONE, formatIsoDate, today } from '@/lib/dates'
import { FREQUENCY_LABELS } from '@/lib/investments/portfolio'
import { formatPercent, type Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'
import { getProfile, requireUser } from '@/server/auth/session'
import { loadInvestments } from '@/server/services/investments'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Investimenti' }

const qty = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 })
const tone = (v: number) => (v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : 'text-fg')

/**
 * Investimenti: quanto hai versato, quanto vale, quanto hai guadagnato.
 * Versamento ≠ rendimento: il rendimento è valore − versato netto.
 * Prezzi inseriti a mano (nessuna API di prezzi): senza prezzo un titolo vale al costo.
 */
export default async function InvestmentsPage() {
  await requireUser('/investments')
  const profile = await getProfile()
  const now = today(profile?.timezone ?? DEFAULT_TIME_ZONE)
  const brokers = await loadInvestments(await createSupabaseServerClient(), now)

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Investimenti</h1>
        <p className="mt-1 text-[15px] text-fg-muted">Quanto hai versato, quanto vale oggi, quanto hai guadagnato.</p>
      </header>

      {brokers.length === 0 ? (
        <EmptyState icon={LineChart} title="Nessun conto di investimento" description="Il conto Trade Republic viene creato con il tuo account." />
      ) : null}

      {brokers.map(({ account, summary: s, positions, closed, plans, monthlyPlanned, instruments }) => (
        <div key={account.id} className="mb-10 flex flex-col gap-6">
          <section
            aria-label={`Riepilogo ${account.name}`}
            data-testid="portfolio-hero"
            className="rounded-[var(--radius-card)] p-6 text-white lg:p-7"
            style={{ background: bankGradient(accountColor(account)) }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={`/accounts/${account.id}`} className="text-base font-bold hover:underline">
                {account.name}
              </Link>
              <span className="text-xs text-white/80">{s.unpriced > 0 ? `${s.unpriced} titoli senza prezzo: valutati al costo` : 'Prezzi aggiornati da te'}</span>
            </div>
            <p className="mt-4 text-[13px] text-white/80">Valore attuale</p>
            <Money value={s.value as Cents} currency={account.currency} emphasizeUnits className="block text-[40px] leading-none font-bold tracking-[-0.03em] text-white [&_span]:text-white/80" />
            <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-black/25 px-3 py-1.5 text-[14px] font-semibold" data-testid="portfolio-gain">
              Rendimento <Money value={s.gain as Cents} currency={account.currency} signDisplay="exceptZero" className="text-white" />
              {s.gainRatio !== null ? <span className="text-white/80">({formatPercent(s.gainRatio, 'it-IT', 'exceptZero')})</span> : null}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-4">
              {[
                ['Versato netto', s.netDeposits],
                ['Titoli', s.securitiesValue],
                ['Liquidità', s.liquidity],
                ['Dividendi e interessi', s.income],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-white/75">{label}</dt>
                  <dd className="font-semibold">
                    <Money value={value as Cents} currency={account.currency} className="text-white" />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-white/75">
              Rendimento = valore attuale − versato netto. Un nuovo versamento aumenta il valore e il versato della stessa cifra: non è un guadagno.
            </p>
          </section>

          <section aria-labelledby={`positions-${account.id}`} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
            <SectionTitle id={`positions-${account.id}`}>I tuoi titoli</SectionTitle>
            {positions.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">Nessun titolo: importa l’estratto di Trade Republic per vedere le posizioni.</p>
            ) : (
              <ul aria-label="Posizioni" className="flex flex-col divide-y divide-line">
                {positions.map((p) => {
                  const name = p.instrument?.name ?? 'Strumento'
                  return (
                    <li key={p.instrumentId} data-testid={`position-${name}`} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-fg">{name}</p>
                          <p className="text-[13px] text-fg-muted">
                            {[p.instrument?.isin, `${qty.format(p.quantity)} quote`, `costo medio ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: account.currency }).format(p.costCents / 100 / p.quantity)}`]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Money value={(p.marketValueCents ?? p.costCents) as Cents} currency={account.currency} className="block text-[17px] font-bold text-fg" />
                          {p.unrealizedCents !== null ? (
                            <Money value={p.unrealizedCents as Cents} currency={account.currency} signDisplay="exceptZero" className={cn('text-[13px] font-semibold', tone(p.unrealizedCents))} />
                          ) : (
                            <span className="text-[13px] text-warning">al costo</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[12px] text-fg-subtle">
                          {p.price ? `Ultimo prezzo ${p.price.unitPrice.toLocaleString('it-IT', { maximumFractionDigits: 8 })} € del ${formatIsoDate(p.price.valuedOn)}` : 'Nessun prezzo: inseriscilo per vedere il guadagno'}
                        </p>
                        <PriceForm accountId={account.id} instrumentId={p.instrumentId} quantity={p.quantity} name={name} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {closed.length > 0 ? (
              <p className="mt-4 text-[13px] text-fg-muted">
                Venduti: {closed.map((c) => c.instrument?.name ?? 'Strumento').join(', ')} · guadagno realizzato{' '}
                <Money value={s.realized as Cents} currency={account.currency} signDisplay="exceptZero" className={cn('font-semibold', tone(s.realized))} />
              </p>
            ) : null}
          </section>

          <section aria-labelledby={`plans-${account.id}`} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
            <SectionTitle id={`plans-${account.id}`}>Piani di accumulo</SectionTitle>
            {plans.length > 0 ? (
              <>
                <p className="mb-3 text-[14px] text-fg-muted">
                  Investi circa <Money value={monthlyPlanned as Cents} currency={account.currency} className="font-semibold text-fg" /> al mese.
                </p>
                <ul aria-label="Piani di accumulo" className="mb-5 flex flex-col divide-y divide-line">
                  {plans.map((p) => (
                    <li key={p.id} className={cn('flex items-center justify-between gap-3 py-3', !p.isActive && 'opacity-60')}>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-fg">{p.name}</p>
                        <p className="text-[13px] text-fg-muted">
                          <Money value={p.amountCents as Cents} currency={account.currency} /> · {FREQUENCY_LABELS[p.frequency].toLowerCase()}
                          {p.instrumentName ? ` · ${p.instrumentName}` : ''}
                          {' · '}
                          {p.isActive ? (p.next ? `prossimo ${formatIsoDate(p.next)}` : 'terminato') : 'in pausa'}
                        </p>
                      </div>
                      <PlanActions id={p.id} isActive={p.isActive} name={p.name} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mb-4 text-[14px] text-fg-muted">Nessun piano: aggiungi il tuo PAC per vedere quanto investi ogni mese e la prossima esecuzione.</p>
            )}
            <details>
              <summary className="cursor-pointer text-[14px] font-semibold text-fg">Aggiungi un piano</summary>
              <div className="mt-4">
                <PlanForm accountId={account.id} instruments={instruments} defaultStart={now} />
              </div>
            </details>
          </section>
        </div>
      ))}
    </>
  )
}
