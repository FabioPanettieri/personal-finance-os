import { ingCounterparty } from '@/lib/imports/importers/ing'
import {
  maskIban,
  OWN_NAME_CONFIDENCE,
  ownNamePattern,
  personWords,
  RECURRING_IBAN_CONFIDENCE,
  recurringIbans,
} from '@/lib/transfers/own-transfers'

import { RepositoryError, type DbClient } from './accounts'

/**
 * Regole "giroconto" imparate dai movimenti (lib/transfers/own-transfers.ts):
 * nome dell'intestatario e IBAN ricorrenti. Sono regole normali nel database
 * (origine "learned"): visibili in /rules, disattivabili, riapplicate da
 * "Applica ai movimenti da sistemare" e a ogni import.
 */
export const OWN_NAME_RULE = 'Giroconto: bonifici a tuo nome'
const IBAN_RULE_PREFIX = 'Giroconto: bonifici ripetuti verso IBAN '
const SCAN_LIMIT = 3000

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

export type LearnReport = { ownName: boolean; ibans: number }

export async function learnOwnTransferRules(db: DbClient): Promise<LearnReport> {
  const [profile, giro, outgoing, accounts, category, rules] = await Promise.all([
    db.from('profiles').select('display_name').maybeSingle(),
    // Giroconti dichiarati dalla banca: la controparte è l'intestatario.
    db
      .from('transactions')
      .select('counterparty')
      .eq('type', 'transfer')
      .not('counterparty', 'is', null)
      .or('description.ilike.%giroconto%,original_description.ilike.%giroconto%')
      .limit(SCAN_LIMIT),
    // Bonifici in uscita ING: l'IBAN del beneficiario è nella descrizione originale.
    db
      .from('transactions')
      .select('original_description, type, categorization_method, accounts!inner(default_bank_profile)')
      .lt('amount_cents', 0)
      .eq('accounts.default_bank_profile', 'ing')
      .ilike('original_description', '%IBAN beneficiario%')
      .limit(SCAN_LIMIT),
    db.from('accounts').select('iban'),
    db.from('transaction_categories').select('id, name, parent_id, kind').eq('kind', 'transfer'),
    db.from('categorization_rules').select('id, name, pattern').eq('origin', 'learned').like('name', 'Giroconto: %'),
  ])
  for (const [label, r] of [
    ['Profilo', profile],
    ['Giroconti', giro],
    ['Bonifici', outgoing],
    ['Conti', accounts],
    ['Categorie', category],
    ['Regole', rules],
  ] as const) {
    if (r.error) fail(label, r.error)
  }

  const giroconto = category.data!.find((c) => c.name === 'Giroconto' && c.parent_id) ?? category.data![0]
  const existing = new Map(rules.data!.map((r) => [r.name, r]))
  const report: LearnReport = { ownName: false, ibans: 0 }

  // 1. Nome dell'intestatario (in qualunque ordine, anche "Paypal*cognome nome").
  const names = [profile.data?.display_name, ...giro.data!.map((r) => r.counterparty)].filter(
    (n): n is string => personWords(n) !== null,
  )
  const pattern = ownNamePattern(names)
  if (pattern) {
    const rule = existing.get(OWN_NAME_RULE)
    if (!rule) {
      const { error } = await db.from('categorization_rules').insert({
        name: OWN_NAME_RULE,
        origin: 'learned',
        priority: 15,
        match_field: 'counterparty',
        match_type: 'regex',
        pattern,
        direction: 'any',
        set_type: 'transfer',
        set_nature: 'transfer',
        set_category_id: giroconto?.id ?? null,
        confidence: OWN_NAME_CONFIDENCE,
      })
      if (error) fail('Regola giroconto (nome)', error)
    } else if (rule.pattern !== pattern) {
      const { error } = await db.from('categorization_rules').update({ pattern }).eq('id', rule.id)
      if (error) fail('Regola giroconto (nome)', error)
    }
    report.ownName = true
  }

  // 2. IBAN ricorrenti (≥ 3 bonifici, mai corretti a mano come spesa o entrata).
  const ownIbans = new Set(accounts.data!.map((a) => a.iban).filter((i): i is string => !!i))
  const ibans = recurringIbans(
    outgoing.data!.map((r) => ({
      iban: ingCounterparty(r.original_description).iban,
      type: r.type,
      manual: r.categorization_method === 'manual',
    })),
    ownIbans,
  )
  for (const iban of ibans) {
    const name = `${IBAN_RULE_PREFIX}${maskIban(iban)}`
    if (existing.has(name)) continue
    const { error } = await db.from('categorization_rules').insert({
      name,
      origin: 'learned',
      priority: 16,
      match_field: 'counterparty_iban',
      match_type: 'equals',
      pattern: iban,
      direction: 'out',
      set_type: 'transfer',
      set_nature: 'transfer',
      set_category_id: giroconto?.id ?? null,
      confidence: RECURRING_IBAN_CONFIDENCE,
    })
    if (error) fail('Regola giroconto (IBAN)', error)
    report.ibans += 1
  }
  return report
}
