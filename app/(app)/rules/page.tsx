import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { AcceptSuggestion, ApplyRulesButton, NewRuleForm, RuleActions } from '@/features/rules/components/rule-forms'
import { formatMoney, formatPercent, type Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'
import { requireUser } from '@/server/auth/session'
import { businessList, categoryTree, reviewCounts } from '@/server/repositories/dashboard'
import { listRules, ruleSuggestions, type RuleView } from '@/server/repositories/rules'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Regole' }

const MATCH_LABELS: Record<string, string> = { contains: 'contiene', starts_with: 'inizia con', equals: 'è uguale a', regex: 'corrisponde a' }
const FIELD_LABELS: Record<string, string> = { description: 'Descrizione', counterparty: 'Controparte', counterparty_iban: 'IBAN controparte', source_type: 'Causale della banca' }
const ORIGIN_LABELS: Record<RuleView['origin'], string> = { user: 'Tua', learned: 'Imparata', system: 'Predefinita' }

function condition(r: RuleView): string {
  const parts = [`${FIELD_LABELS[r.matchField] ?? r.matchField} ${MATCH_LABELS[r.matchType] ?? r.matchType} “${r.pattern}”`]
  if (r.direction !== 'any') parts.push(r.direction === 'in' ? 'entrate' : 'uscite')
  if (r.amountMinCents !== null || r.amountMaxCents !== null)
    parts.push(
      `importo ${r.amountMinCents !== null ? `da ${formatMoney(r.amountMinCents as Cents)}` : ''}${r.amountMaxCents !== null ? ` fino a ${formatMoney(r.amountMaxCents as Cents)}` : ''}`.trim(),
    )
  return parts.join(' · ')
}

function RuleList({ rules, label }: { rules: RuleView[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line">
      {rules.map((r) => (
        <li key={r.id} data-testid={`rule-${r.pattern}`} className={cn('flex flex-wrap items-center justify-between gap-3 py-3', !r.isActive && 'opacity-55')}>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold break-words text-fg">{r.reviewReason ? 'Da controllare' : (r.target ?? r.setType ?? 'Regola')}</p>
            <p className="text-[13px] break-words text-fg-muted">{condition(r)}</p>
            <p className="text-[12px] text-fg-subtle">
              {ORIGIN_LABELS[r.origin]} · affidabilità {formatPercent(r.confidence)} · {r.autoApply ? 'si applica da sola' : 'propone soltanto'}
              {r.hitCount > 0 ? ` · usata ${r.hitCount} volte` : ''}
              {r.isActive ? '' : ' · disattivata'}
            </p>
          </div>
          <RuleActions id={r.id} name={r.name} isActive={r.isActive} autoApply={r.autoApply} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Regole di classificazione: quelle tue, quelle imparate dalle correzioni e le
 * predefinite. Sotto il 90% di affidabilità una regola propone soltanto.
 */
export default async function RulesPage() {
  await requireUser('/rules')
  const db = await createSupabaseServerClient()
  const [rules, suggestions, tree, businesses, review] = await Promise.all([listRules(db), ruleSuggestions(db), categoryTree(db), businessList(db), reviewCounts(db)])
  const own = rules.filter((r) => r.origin !== 'system')
  const system = rules.filter((r) => r.origin === 'system')
  const nameOf = (categoryId: string | null, businessId: string | null) =>
    [businesses.find((b) => b.id === businessId)?.name, tree.find((c) => c.id === categoryId)?.name].filter(Boolean).join(' · ') || 'Senza categoria'

  return (
    <>
      <Link href="/transactions" className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" />
        Movimenti
      </Link>
      <header className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Regole</h1>
        <p className="mt-1 text-[15px] text-fg-muted">Classificano da sole i movimenti degli estratti. Sotto il 90% di affidabilità propongono soltanto: confermi tu.</p>
      </header>

      <section aria-label="Applica le regole" className="mb-6 flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
        <p className="text-[15px] text-fg">
          {review.transactions === 0 ? 'Nessun movimento da sistemare.' : review.transactions === 1 ? '1 movimento da sistemare.' : `${review.transactions} movimenti da sistemare.`}
          <span className="block text-[13px] text-fg-muted">Dopo aver creato o cambiato una regola, applicala anche a quelli già importati.</span>
        </p>
        <ApplyRulesButton pending={review.transactions} />
      </section>

      {suggestions.length > 0 ? (
        <section aria-labelledby="suggestions-title" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
          <h2 id="suggestions-title" className="mb-1 text-[17px] font-semibold text-fg">
            Imparate dalle tue correzioni
          </h2>
          <p className="mb-3 text-[13px] text-fg-muted">Hai classificato più volte nello stesso modo questi movimenti: vuoi che d’ora in poi lo faccia io?</p>
          <ul aria-label="Regole suggerite" className="flex flex-col divide-y divide-line">
            {suggestions.slice(0, 10).map((s) => (
              <li key={`${s.pattern}-${s.direction}`} data-testid={`suggestion-${s.pattern}`} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold break-words text-fg">
                    “{s.pattern}” → {nameOf(s.categoryId, s.businessId)}
                  </p>
                  <p className="text-[13px] text-fg-muted">
                    {s.direction === 'in' ? 'Entrate' : 'Uscite'} · {s.count} volte{s.conflicts > 0 ? ` (${s.conflicts} diversamente)` : ''} · affidabilità {formatPercent(s.confidence)}
                    {s.confidence >= 0.9 ? ' · si applicherà da sola' : ' · proporrà soltanto'}
                  </p>
                </div>
                <AcceptSuggestion pattern={s.pattern} direction={s.direction} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="own-title" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
        <h2 id="own-title" className="mb-2 text-[17px] font-semibold text-fg">
          Le tue regole · {own.length}
        </h2>
        {own.length > 0 ? (
          <RuleList rules={own} label="Le tue regole" />
        ) : (
          <p className="py-4 text-[14px] text-fg-muted">Nessuna regola tua: creane una qui sotto, oppure spunta “Ricorda” quando sistemi un movimento.</p>
        )}
        {system.length > 0 ? (
          <details className="mt-4 border-t border-line pt-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-fg-muted">Regole predefinite · {system.length}</summary>
            <div className="mt-2">
              <RuleList rules={system} label="Regole predefinite" />
            </div>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="new-rule-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
        <h2 id="new-rule-title" className="mb-4 text-[17px] font-semibold text-fg">
          Nuova regola
        </h2>
        <NewRuleForm />
      </section>
    </>
  )
}
