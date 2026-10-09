import { DEFAULT_TIME_ZONE, isIsoDate, isoDateInTimeZone, type IsoDate } from '@/lib/dates'
import type {
  BusinessRow,
  CategoryNode,
  CategorySpendingRow,
  IncomeSourceRow,
  MonthlyFlowRow,
  NetWorthPoint,
} from '@/lib/dashboard/metrics'
import type { DateRange } from '@/lib/dashboard/period'
import { centsFromDb, type Cents } from '@/lib/money'
import type { ImportSource } from '@/lib/imports/types'

import { RepositoryError, type DbClient } from './accounts'

/**
 * Letture della dashboard. Ogni query passa dal client dell'utente: RLS +
 * AAL2 sempre attive, anche per le funzioni di aggregazione (SECURITY
 * INVOKER, migration 0007). Nessun SELECT * sulle transazioni: solo
 * aggregati, conteggi e righe limitate.
 */

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

const date = (value: string): IsoDate => {
  if (!isIsoDate(value)) throw new RepositoryError(`Data non valida dal database: ${value}`)
  return value
}

const n = (value: number | string | null | undefined): number => Number(value ?? 0)

export async function monthlyFlows(db: DbClient, range: DateRange): Promise<MonthlyFlowRow[]> {
  const { data, error } = await db.rpc('dashboard_monthly_flows', { p_from: range.from, p_to: range.to })
  if (error) fail('Flussi mensili', error)
  return (data ?? []).map((r) => ({
    month: date(r.month),
    currency: r.currency,
    incomeCents: n(r.income_cents),
    expenseCents: n(r.expense_cents),
    refundCents: n(r.refund_cents),
    incomeCount: n(r.income_count),
    expenseCount: n(r.expense_count),
  }))
}

export async function categorySpending(db: DbClient, range: DateRange): Promise<CategorySpendingRow[]> {
  const { data, error } = await db.rpc('dashboard_category_spending', { p_from: range.from, p_to: range.to })
  if (error) fail('Spese per categoria', error)
  return (data ?? []).map((r) => ({ categoryId: r.category_id, currency: r.currency, spentCents: n(r.spent_cents), count: n(r.tx_count) }))
}

export async function incomeSources(db: DbClient, range: DateRange): Promise<IncomeSourceRow[]> {
  const { data, error } = await db.rpc('dashboard_income_by_source', { p_from: range.from, p_to: range.to })
  if (error) fail('Entrate per fonte', error)
  return (data ?? []).map((r) => ({ incomeSourceId: r.income_source_id, currency: r.currency, incomeCents: n(r.income_cents), count: n(r.tx_count) }))
}

export async function businessRows(db: DbClient, range: DateRange): Promise<BusinessRow[]> {
  const { data, error } = await db.rpc('dashboard_business_performance', { p_from: range.from, p_to: range.to })
  if (error) fail('Business', error)
  return (data ?? []).map((r) => ({
    businessId: r.business_id,
    currency: r.currency,
    revenueCents: n(r.revenue_cents),
    expenseCents: n(r.expense_cents),
    count: n(r.tx_count),
  }))
}

export async function accountChanges(db: DbClient, range: DateRange): Promise<Map<string, { change: Cents; count: number }>> {
  const { data, error } = await db.rpc('dashboard_account_changes', { p_from: range.from, p_to: range.to })
  if (error) fail('Variazioni dei conti', error)
  return new Map((data ?? []).map((r) => [r.account_id, { change: centsFromDb(r.change_cents), count: n(r.tx_count) }]))
}

export async function investedAtCost(db: DbClient): Promise<Map<string, Cents>> {
  const { data, error } = await db.rpc('dashboard_invested_at_cost')
  if (error) fail('Capitale investito', error)
  return new Map((data ?? []).map((r) => [r.account_id, centsFromDb(r.invested_cents)]))
}

export async function netWorthHistory(db: DbClient, currency: string): Promise<NetWorthPoint[]> {
  const { data, error } = await db.rpc('net_worth_history')
  if (error) fail('Storico patrimonio', error)
  return (data ?? []).filter((r) => r.currency === currency).map((r) => ({ date: date(r.day), balance: centsFromDb(r.total_cents) }))
}

/** Data del primo movimento (per non confrontare con periodi senza dati). */
export async function firstTransactionDate(db: DbClient): Promise<IsoDate | null> {
  const { data, error } = await db.from('transactions').select('booked_on').order('booked_on').limit(1).maybeSingle()
  if (error) fail('Primo movimento', error)
  return data ? date(data.booked_on) : null
}

export async function categoryTree(db: DbClient): Promise<CategoryNode[]> {
  const { data, error } = await db.from('transaction_categories').select('id, name, parent_id, color')
  if (error) fail('Categorie', error)
  return data.map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id, color: c.color }))
}

export async function businessList(db: DbClient): Promise<{ id: string; name: string; color: string | null }[]> {
  const { data, error } = await db.from('businesses').select('id, name, color').eq('is_active', true).order('sort_order')
  if (error) fail('Business', error)
  return data
}

export async function incomeSourceList(db: DbClient): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from('income_sources').select('id, name').order('sort_order')
  if (error) fail('Fonti di reddito', error)
  return data
}

export type ReviewCounts = {
  /** Movimenti importati con classificazione proposta ma non confermata. */
  transactions: number
  /** Righe di importazioni in anteprima che richiedono una decisione. */
  importRows: number
}

export async function reviewCounts(db: DbClient): Promise<ReviewCounts> {
  const [tx, rows] = await Promise.all([
    db.from('transactions').select('id', { count: 'exact', head: true }).eq('is_categorized', false),
    db
      .from('import_rows')
      .select('id, imports!inner(status)', { count: 'exact', head: true })
      .eq('imports.status', 'preview')
      .or(
        'status.eq.possible_duplicate,and(status.eq.new,proposed_type.is.null),and(status.eq.new,categorization_method.neq.manual,categorization_confidence.lt.0.6)',
      ),
  ])
  if (tx.error) fail('Movimenti da verificare', tx.error)
  if (rows.error) fail('Righe da verificare', rows.error)
  return { transactions: tx.count ?? 0, importRows: rows.count ?? 0 }
}

export type RecentTransaction = {
  id: string
  bookedOn: IsoDate
  description: string
  amount: Cents
  currency: string
  type: 'income' | 'expense' | 'transfer' | 'investment' | 'refund'
  accountName: string
  accountInstitution: string | null
  categoryName: string | null
  businessName: string | null
  isCategorized: boolean
}

export async function recentTransactions(db: DbClient, limit = 10): Promise<RecentTransaction[]> {
  const { data, error } = await db
    .from('transactions')
    .select('id, booked_on, description, amount_cents, currency, type, is_categorized, accounts!inner(name, institution), transaction_categories(name), businesses(name)')
    .order('booked_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail('Ultimi movimenti', error)
  return data.map((r) => {
    const row = r as typeof r & {
      accounts: { name: string; institution: string | null }
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
      accountInstitution: row.accounts.institution,
      categoryName: row.transaction_categories?.name ?? null,
      businessName: row.businesses?.name ?? null,
      isCategorized: row.is_categorized,
    }
  })
}

export type ImportHealth = { source: ImportSource; accountName: string; committedOn: IsoDate; rowsImported: number }

/** Ultima importazione confermata per fonte. Nessuna data inventata: assente se mai importato. */
export async function importHealth(db: DbClient, timeZone = DEFAULT_TIME_ZONE): Promise<ImportHealth[]> {
  const { data, error } = await db
    .from('imports')
    .select('bank_profile, committed_at, rows_imported, accounts!inner(name)')
    .eq('status', 'committed')
    .order('committed_at', { ascending: false })
    .limit(100)
  if (error) fail('Ultime importazioni', error)
  const latest = new Map<string, ImportHealth>()
  for (const r of data) {
    const row = r as typeof r & { accounts: { name: string } }
    if (latest.has(row.bank_profile) || !row.committed_at || row.bank_profile === 'generic') continue
    latest.set(row.bank_profile, {
      source: row.bank_profile,
      accountName: row.accounts.name,
      committedOn: isoDateInTimeZone(new Date(row.committed_at), timeZone),
      rowsImported: row.rows_imported,
    })
  }
  return [...latest.values()]
}

