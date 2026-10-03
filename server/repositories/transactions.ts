import { isIsoDate, type IsoDate } from '@/lib/dates'
import { IMPORTERS } from '@/lib/imports/importers'
import type { ImportSource } from '@/lib/imports/types'
import { centsFromDb, type Cents } from '@/lib/money'
import { typesFor, type TransactionFilters } from '@/lib/transactions/filters'

import { RepositoryError, type DbClient } from './accounts'

/**
 * Movimenti: lista filtrata (a pagine), dettaglio e conferma della
 * classificazione. Sempre con il client dell'utente (RLS + AAL2).
 */

export const TRANSACTIONS_PAGE_SIZE = 50

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

const date = (value: string): IsoDate => {
  if (!isIsoDate(value)) throw new RepositoryError(`Data non valida dal database: ${value}`)
  return value
}

type TxType = 'income' | 'expense' | 'transfer' | 'investment' | 'refund'

export type TransactionListItem = {
  id: string
  bookedOn: IsoDate
  description: string
  amount: Cents
  currency: string
  type: TxType
  accountName: string
  categoryName: string | null
  businessName: string | null
  isCategorized: boolean
  isTransferLinked: boolean
}

export type TransactionPage = { items: TransactionListItem[]; total: number; page: number; pageSize: number }

/**
 * Le stesse regole degli aggregati della dashboard: finestra del saldo
 * iniziale non applicata qui (la lista mostra tutti i movimenti), filtri per
 * tipo identici (es. "spending" = spese + rimborsi).
 */
export async function listTransactions(
  db: DbClient,
  filters: TransactionFilters,
  categoryIds: string[] | null,
): Promise<TransactionPage> {
  const page = filters.page
  let query = db
    .from('transactions')
    .select(
      'id, booked_on, description, amount_cents, currency, type, is_categorized, transfer_group_id, accounts!inner(name), transaction_categories(name), businesses(name)',
      { count: 'exact' },
    )
  if (filters.from) query = query.gte('booked_on', filters.from)
  if (filters.to) query = query.lte('booked_on', filters.to)
  if (filters.accountId) query = query.eq('account_id', filters.accountId)
  if (filters.categoryId === 'none') query = query.is('category_id', null)
  else if (categoryIds) query = query.in('category_id', categoryIds.length > 0 ? categoryIds : ['00000000-0000-0000-0000-000000000000'])
  if (filters.type) query = query.in('type', typesFor(filters.type))
  if (filters.businessId) query = query.eq('business_id', filters.businessId)
  if (filters.incomeSourceId === 'none') query = query.is('income_source_id', null).eq('type', 'income')
  else if (filters.incomeSourceId) query = query.eq('income_source_id', filters.incomeSourceId)
  if (filters.review) query = query.eq('is_categorized', false)
  if (filters.query) {
    // Ricerca semplice sulla descrizione; i caratteri jolly digitati sono trattati come testo.
    const escaped = filters.query.replace(/[\\%_]/g, (c) => `\\${c}`)
    query = query.ilike('description', `%${escaped}%`)
  }
  const from = (page - 1) * TRANSACTIONS_PAGE_SIZE
  const { data, error, count } = await query
    .order('booked_on', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + TRANSACTIONS_PAGE_SIZE - 1)
  if (error) fail('Lettura movimenti', error)
  return {
    items: data.map((r) => {
      const row = r as typeof r & {
        accounts: { name: string }
        transaction_categories: { name: string } | null
        businesses: { name: string } | null
      }
      return {
        id: row.id,
        bookedOn: date(row.booked_on),
        description: row.description,
        amount: centsFromDb(row.amount_cents),
        currency: row.currency,
        type: row.type,
        accountName: row.accounts.name,
        categoryName: row.transaction_categories?.name ?? null,
        businessName: row.businesses?.name ?? null,
        isCategorized: row.is_categorized,
        isTransferLinked: row.transfer_group_id !== null,
      }
    }),
    total: count ?? 0,
    page,
    pageSize: TRANSACTIONS_PAGE_SIZE,
  }
}

export type TransactionDetail = {
  id: string
  bookedOn: IsoDate
  valueOn: IsoDate | null
  description: string
  originalDescription: string
  amount: Cents
  currency: string
  type: TxType
  nature: string
  account: { id: string; name: string }
  category: string | null
  business: string | null
  incomeSource: string | null
  counterparty: string | null
  /** IBAN della controparte mascherato (solo ultime 4 cifre visibili). */
  counterpartyIbanMasked: string | null
  isCategorized: boolean
  method: string
  confidence: number | null
  ruleName: string | null
  source: string
  importInfo: { id: string; bankProfile: string; createdAt: string } | null
  /** Altre gambe dello stesso trasferimento. */
  transferLegs: { id: string; accountName: string; amount: Cents; bookedOn: IsoDate }[]
}

/** "IT00R0000000000000000000003" → "IT00 •••• 0003". */
export function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, '')
  return compact.length <= 8 ? '••••' : `${compact.slice(0, 4)} •••• ${compact.slice(-4)}`
}

export async function getTransaction(db: DbClient, id: string): Promise<TransactionDetail | null> {
  const { data, error } = await db
    .from('transactions')
    .select(
      '*, accounts!inner(id, name), transaction_categories(name, parent_id), businesses(name), income_sources(name), categorization_rules(name), imports(id, bank_profile, created_at)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) fail('Lettura movimento', error)
  if (!data) return null
  const row = data as typeof data & {
    accounts: { id: string; name: string }
    transaction_categories: { name: string; parent_id: string | null } | null
    businesses: { name: string } | null
    income_sources: { name: string } | null
    categorization_rules: { name: string } | null
    imports: { id: string; bank_profile: string; created_at: string } | null
  }

  let category = row.transaction_categories?.name ?? null
  if (row.transaction_categories?.parent_id) {
    const { data: parent } = await db.from('transaction_categories').select('name').eq('id', row.transaction_categories.parent_id).maybeSingle()
    if (parent) category = `${parent.name} › ${category}`
  }

  const legs: TransactionDetail['transferLegs'] = []
  if (row.transfer_group_id) {
    const { data: others, error: legsError } = await db
      .from('transactions')
      .select('id, amount_cents, booked_on, accounts!inner(name)')
      .eq('transfer_group_id', row.transfer_group_id)
      .neq('id', row.id)
    if (legsError) fail('Lettura trasferimento', legsError)
    for (const o of others) {
      const leg = o as typeof o & { accounts: { name: string } }
      legs.push({ id: leg.id, accountName: leg.accounts.name, amount: centsFromDb(leg.amount_cents), bookedOn: date(leg.booked_on) })
    }
  }

  return {
    id: row.id,
    bookedOn: date(row.booked_on),
    valueOn: row.value_on && isIsoDate(row.value_on) ? row.value_on : null,
    description: row.description,
    originalDescription: row.original_description,
    amount: centsFromDb(row.amount_cents),
    currency: row.currency,
    type: row.type,
    nature: row.nature,
    account: row.accounts,
    category,
    business: row.businesses?.name ?? null,
    incomeSource: row.income_sources?.name ?? null,
    counterparty: row.counterparty,
    counterpartyIbanMasked: await counterpartyIban(db, row.id),
    isCategorized: row.is_categorized,
    method: row.categorization_method,
    confidence: row.categorization_confidence === null ? null : Number(row.categorization_confidence),
    ruleName: row.categorization_rules?.name ?? null,
    source: row.source,
    importInfo: row.imports ? { id: row.imports.id, bankProfile: row.imports.bank_profile, createdAt: row.imports.created_at } : null,
    transferLegs: legs,
  }
}

/**
 * L'IBAN della controparte non è salvato nelle transazioni: si ricava dalla
 * riga originale dell'estratto (import_rows.raw) con lo stesso importer, e si
 * mostra mascherato.
 */
async function counterpartyIban(db: DbClient, transactionId: string): Promise<string | null> {
  const { data } = await db
    .from('import_rows')
    .select('raw, row_index, imports!inner(bank_profile, import_files(header))')
    .eq('transaction_id', transactionId)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const imp = data.imports as unknown as { bank_profile: string; import_files: { header: string[] | null }[] }
  const importer = IMPORTERS[imp.bank_profile as ImportSource]
  if (!importer) return null
  const mapping = importer.mapColumns(imp.import_files[0]?.header ?? [])
  if (!mapping.ok) return null
  const outcome = importer.normalizeRow(data.raw as Record<string, string>, data.row_index, mapping.mapping, {
    accountCurrency: 'EUR',
    timeZone: 'Europe/Rome',
  })
  const iban = outcome.kind === 'ok' ? outcome.transaction.counterpartyIban : null
  return iban ? maskIban(iban) : null
}

/** Conferma la classificazione proposta (resta modificabile in seguito). */
export async function confirmTransaction(db: DbClient, id: string): Promise<boolean> {
  const { data, error } = await db
    .from('transactions')
    .update({ is_categorized: true, categorization_method: 'manual', categorization_confidence: 1 })
    .eq('id', id)
    .eq('is_categorized', false)
    .select('id')
  if (error) fail('Conferma movimento', error)
  return data.length === 1
}
