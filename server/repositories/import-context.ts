import type { Lookups } from '@/lib/categorization/engine'
import { DEFAULT_RULES, type Rule } from '@/lib/categorization/rules'
import { isIsoDate, type IsoDate } from '@/lib/dates'
import type { ExistingTransaction } from '@/lib/imports/duplicates'
import type { Counterpart } from '@/lib/transfers/detect'

import { listAccounts, RepositoryError, type DbClient } from './accounts'

/**
 * Dati esistenti che la pipeline di importazione deve conoscere. Tutte le
 * letture usano il client dell'utente: RLS + AAL2 sempre attive.
 */

const PAGE = 1000
const IN_CHUNK = 100

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

export type CategoryOption = { id: string; label: string; kind: string; parentId: string | null }
export type NamedOption = { id: string; label: string }

export type ClassificationData = {
  rules: Rule[]
  lookups: Lookups
  categories: CategoryOption[]
  businesses: NamedOption[]
  incomeSources: (NamedOption & { businessId: string | null })[]
}

export async function loadClassificationData(db: DbClient): Promise<ClassificationData> {
  const [rules, categories, businesses, sources] = await Promise.all([
    db.from('categorization_rules').select('*').eq('is_active', true),
    db.from('transaction_categories').select('id, name, parent_id, kind, sort_order').eq('is_active', true).order('sort_order').order('name'),
    db.from('businesses').select('id, name, slug').eq('is_active', true).order('sort_order'),
    db.from('income_sources').select('id, name, business_id').eq('is_active', true).order('sort_order'),
  ])
  if (rules.error) fail('Lettura regole', rules.error)
  if (categories.error) fail('Lettura categorie', categories.error)
  if (businesses.error) fail('Lettura business', businesses.error)
  if (sources.error) fail('Lettura fonti di reddito', sources.error)

  const nameById = new Map(categories.data.map((c) => [c.id, c.name]))
  const categoryOptions: CategoryOption[] = categories.data.map((c) => ({
    id: c.id,
    label: c.parent_id ? `${nameById.get(c.parent_id)} > ${c.name}` : c.name,
    kind: c.kind,
    parentId: c.parent_id,
  }))

  const dbRules: Rule[] = rules.data.map((r) => ({
    id: r.id,
    dbId: r.id,
    name: r.name,
    priority: r.priority,
    matchField: r.match_field === 'counterparty' ? 'counterparty' : 'description',
    matchType: r.match_type,
    pattern: r.pattern,
    accountId: r.account_id,
    direction: r.direction === 'in' || r.direction === 'out' ? r.direction : 'any',
    amountMinCents: r.amount_min_cents,
    amountMaxCents: r.amount_max_cents,
    setType: r.set_type,
    setNature: r.set_nature,
    setCategoryId: r.set_category_id,
    setBusinessId: r.set_business_id,
    setIncomeSourceId: r.set_income_source_id,
    confidence: Number(r.confidence),
  }))

  return {
    rules: [...dbRules, ...DEFAULT_RULES],
    lookups: {
      categoryIdByPath: new Map(categoryOptions.map((c) => [c.label, c.id])),
      businessIdBySlug: new Map(businesses.data.map((b) => [b.slug, b.id])),
      incomeSourceIdByName: new Map(sources.data.map((s) => [s.name, s.id])),
      businessIdByIncomeSourceId: new Map(sources.data.filter((s) => s.business_id).map((s) => [s.id, s.business_id!])),
    },
    categories: categoryOptions,
    businesses: businesses.data.map((b) => ({ id: b.id, label: b.name })),
    incomeSources: sources.data.map((s) => ({ id: s.id, label: s.name, businessId: s.business_id })),
  }
}

const asDate = (value: string): IsoDate => {
  if (!isIsoDate(value)) throw new RepositoryError(`Data non valida dal database: ${value}`)
  return value
}

/** Movimenti del conto con gli stessi fingerprint o nella finestra di date (per i possibili duplicati). */
export async function findExistingCash(
  db: DbClient,
  accountId: string,
  fingerprints: readonly string[],
  window: { from: IsoDate; to: IsoDate } | null,
): Promise<ExistingTransaction[]> {
  const found = new Map<string, ExistingTransaction>()
  const add = (rows: { id: string; fingerprint: string; booked_on: string; amount_cents: number }[]) => {
    for (const r of rows) found.set(r.id, { id: r.id, fingerprint: r.fingerprint, bookedOn: asDate(r.booked_on), amount: r.amount_cents })
  }
  for (const part of chunks(fingerprints, IN_CHUNK)) {
    const { data, error } = await db.from('transactions').select('id, fingerprint, booked_on, amount_cents').eq('account_id', accountId).in('fingerprint', part)
    if (error) fail('Ricerca duplicati', error)
    add(data)
  }
  if (window) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from('transactions')
        .select('id, fingerprint, booked_on, amount_cents')
        .eq('account_id', accountId)
        .gte('booked_on', window.from)
        .lte('booked_on', window.to)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) fail('Ricerca possibili duplicati', error)
      add(data)
      if (data.length < PAGE) break
    }
  }
  return [...found.values()]
}

export async function findExistingTradeFingerprints(db: DbClient, accountId: string, fingerprints: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (const part of chunks(fingerprints, IN_CHUNK)) {
    const { data, error } = await db.from('investment_transactions').select('fingerprint').eq('account_id', accountId).in('fingerprint', part)
    if (error) fail('Ricerca operazioni già importate', error)
    for (const r of data) found.add(r.fingerprint)
  }
  return found
}

/** Possibili gambe opposte di un trasferimento sugli altri conti dell'utente. */
export async function findTransferCounterparts(
  db: DbClient,
  accountId: string,
  window: { from: IsoDate; to: IsoDate },
): Promise<Counterpart[]> {
  const accounts = await listAccounts(db)
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const result: Counterpart[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('transactions')
      .select('id, account_id, booked_on, amount_cents, type')
      .neq('account_id', accountId)
      .is('transfer_group_id', null)
      .in('type', ['transfer', 'investment'])
      .gte('booked_on', window.from)
      .lte('booked_on', window.to)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) fail('Ricerca trasferimenti', error)
    for (const r of data) {
      const account = byId.get(r.account_id)
      if (!account) continue
      result.push({
        id: r.id,
        accountId: r.account_id,
        accountName: account.name,
        accountKind: account.type.kind,
        bookedOn: asDate(r.booked_on),
        amount: r.amount_cents,
        type: r.type,
      })
    }
    if (data.length < PAGE) break
  }
  return result
}

export { chunks, fail as failRepository }
