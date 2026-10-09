/**
 * Personale vs business (Sprint 7). Regola unica nel database (migration 0010):
 * un movimento è business se e solo se ha un business; ogni entrata/spesa
 * cade in uno solo dei due gruppi, quindi personale + business = totale.
 */
import type { IsoDate } from '../dates'
import { cents, type Cents } from '../money'

import { BASE_CURRENCY } from './metrics'

export type SplitRow = { scope: 'personal' | 'business'; currency: string; incomeCents: number; expenseCents: number; refundCents: number; count: number }

export type ScopeTotals = { income: Cents; /** Spese al netto dei rimborsi. */ expenses: Cents; net: Cents; count: number }

export type SplitTotals = { personal: ScopeTotals; business: ScopeTotals; total: ScopeTotals }

function totals(rows: readonly SplitRow[]): ScopeTotals {
  const income = rows.reduce((s, r) => s + r.incomeCents, 0)
  const expenses = rows.reduce((s, r) => s + r.expenseCents - r.refundCents, 0)
  return { income: cents(income), expenses: cents(expenses), net: cents(income - expenses), count: rows.reduce((s, r) => s + r.count, 0) }
}

export function splitTotals(rows: readonly SplitRow[], currency = BASE_CURRENCY): SplitTotals {
  const own = rows.filter((r) => r.currency === currency)
  return {
    personal: totals(own.filter((r) => r.scope === 'personal')),
    business: totals(own.filter((r) => r.scope === 'business')),
    total: totals(own),
  }
}

export type BusinessMonthRow = { month: IsoDate; currency: string; revenueCents: number; expenseCents: number; count: number }

export type BusinessMonth = { month: IsoDate; revenue: Cents; expenses: Cents; profit: Cents; count: number }

/** Un punto per ogni mese richiesto, anche senza movimenti (zero reale). */
export function businessMonths(rows: readonly BusinessMonthRow[], months: readonly IsoDate[], currency = BASE_CURRENCY): BusinessMonth[] {
  return months.map((month) => {
    const own = rows.filter((r) => r.month === month && r.currency === currency)
    const revenue = own.reduce((s, r) => s + r.revenueCents, 0)
    const expenses = own.reduce((s, r) => s + r.expenseCents, 0)
    return { month, revenue: cents(revenue), expenses: cents(expenses), profit: cents(revenue - expenses), count: own.reduce((s, r) => s + r.count, 0) }
  })
}
