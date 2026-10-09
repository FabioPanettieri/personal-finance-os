import type { BusinessMonthRow, SplitRow } from '@/lib/dashboard/business'
import type { CategorySpendingRow } from '@/lib/dashboard/metrics'
import type { DateRange } from '@/lib/dashboard/period'
import { isIsoDate, type IsoDate } from '@/lib/dates'

import { RepositoryError, type DbClient } from './accounts'

/** Personale vs business e dettaglio di un business: aggregati SQL della migration 0010 (RLS + AAL2). */

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

const n = (value: number | string | bigint | null) => Number(value ?? 0)
const date = (value: string): IsoDate => {
  if (!isIsoDate(value)) throw new RepositoryError(`Data non valida dal database: ${value}`)
  return value
}

export async function personalBusinessSplit(db: DbClient, range: DateRange): Promise<SplitRow[]> {
  const { data, error } = await db.rpc('personal_business_split', { p_from: range.from, p_to: range.to })
  if (error) fail('Personale e business', error)
  return (data ?? []).map((r) => ({
    scope: r.scope === 'business' ? 'business' : 'personal',
    currency: r.currency,
    incomeCents: n(r.income_cents),
    expenseCents: n(r.expense_cents),
    refundCents: n(r.refund_cents),
    count: n(r.tx_count),
  }))
}

export async function businessMonthly(db: DbClient, businessId: string, range: DateRange): Promise<BusinessMonthRow[]> {
  const { data, error } = await db.rpc('business_monthly', { p_business: businessId, p_from: range.from, p_to: range.to })
  if (error) fail('Andamento del business', error)
  return (data ?? []).map((r) => ({ month: date(r.month), currency: r.currency, revenueCents: n(r.revenue_cents), expenseCents: n(r.expense_cents), count: n(r.tx_count) }))
}

export async function businessCategorySpending(db: DbClient, businessId: string, range: DateRange): Promise<CategorySpendingRow[]> {
  const { data, error } = await db.rpc('business_category_spending', { p_business: businessId, p_from: range.from, p_to: range.to })
  if (error) fail('Spese del business', error)
  return (data ?? []).map((r) => ({ categoryId: r.category_id, currency: r.currency, spentCents: n(r.expense_cents), count: n(r.tx_count) }))
}

export type BusinessInfo = { id: string; name: string; slug: string; description: string | null }

export async function getBusiness(db: DbClient, id: string): Promise<BusinessInfo | null> {
  const { data, error } = await db.from('businesses').select('id, name, slug, description').eq('id', id).maybeSingle()
  if (error) fail('Business', error)
  return data
}
