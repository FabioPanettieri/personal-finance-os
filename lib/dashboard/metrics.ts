/**
 * Metriche della dashboard: funzioni pure sopra gli aggregati SQL
 * (migration 0007) e i saldi di account_balances. Nessuna metrica è salvata:
 * tutto si ricalcola dalle transazioni, e ogni numero è riconducibile a righe
 * precise (stessi filtri della lista /transactions).
 */
import type { AccountKind } from '../accounts'
import { compareIsoDates, type IsoDate } from '../dates'
import { cents, type Cents } from '../money'
import type { DateRange } from './period'

export const BASE_CURRENCY = 'EUR'

// -----------------------------------------------------------------------------
// Patrimonio e liquidità
// -----------------------------------------------------------------------------

export type BalanceAccount = {
  id: string
  name: string
  currency: string
  balance: Cents
  kind: AccountKind
  /** Codice del tipo di conto (checking, savings, card, broker…). */
  typeCode: string
}

export type NetWorthBreakdown = {
  /** Somma di tutti i saldi = liquidità + investimenti + carte + altro. */
  netWorth: Cents
  /** Conti liquidi (esclusa la carta di credito) + liquidità sul broker. */
  liquidity: Cents
  /** Capitale netto investito in strumenti, al costo (non valore di mercato). */
  investedAtCost: Cents
  /** Saldo delle carte di credito: negativo = debito, positivo = addebiti saldati senza estratto carta. */
  cards: Cents
  /** Conti di tipo "altro". */
  other: Cents
}

/**
 * Scomposizione del patrimonio senza doppi conteggi. Il saldo di un conto
 * broker comprende liquidità + titoli al costo (le operazioni su titoli non
 * sono movimenti di cassa): la parte investita viene spostata dalla liquidità
 * agli investimenti, il totale non cambia. I trasferimenti tra conti propri
 * si compensano per costruzione (una gamba per conto).
 */
export function netWorthBreakdown(
  accounts: readonly BalanceAccount[],
  investedByAccount: ReadonlyMap<string, Cents>,
  currency = BASE_CURRENCY,
): NetWorthBreakdown {
  let liquidity = 0
  let investedAtCost = 0
  let cards = 0
  let other = 0
  for (const account of accounts) {
    if (account.currency !== currency) continue
    if (account.typeCode === 'card') cards += account.balance
    else if (account.kind === 'investment') {
      const invested = investedByAccount.get(account.id) ?? 0
      investedAtCost += invested
      liquidity += account.balance - invested
    } else if (account.kind === 'liquid') liquidity += account.balance
    else other += account.balance
  }
  return {
    netWorth: cents(liquidity + investedAtCost + cards + other),
    liquidity: cents(liquidity),
    investedAtCost: cents(investedAtCost),
    cards: cents(cards),
    other: cents(other),
  }
}

// -----------------------------------------------------------------------------
// Flussi: entrate, uscite, cash flow
// -----------------------------------------------------------------------------

export type MonthlyFlowRow = {
  month: IsoDate
  currency: string
  incomeCents: number
  expenseCents: number
  refundCents: number
  incomeCount: number
  expenseCount: number
}

export type Flows = {
  income: Cents
  /** Spese al netto dei rimborsi. */
  expenses: Cents
  /** income − expenses. */
  cashFlow: Cents
  incomeCount: number
  expenseCount: number
}

export function sumFlows(rows: readonly MonthlyFlowRow[], currency = BASE_CURRENCY): Flows {
  let income = 0
  let expenses = 0
  let incomeCount = 0
  let expenseCount = 0
  for (const row of rows) {
    if (row.currency !== currency) continue
    income += row.incomeCents
    expenses += row.expenseCents - row.refundCents
    incomeCount += row.incomeCount
    expenseCount += row.expenseCount
  }
  return { income: cents(income), expenses: cents(expenses), cashFlow: cents(income - expenses), incomeCount, expenseCount }
}

export type MonthBar = { month: IsoDate; income: Cents; expenses: Cents; net: Cents }

/** Una barra per ogni mese del periodo, anche senza movimenti (zero reale, non dato mancante). */
export function monthlyBars(rows: readonly MonthlyFlowRow[], months: readonly IsoDate[], currency = BASE_CURRENCY): MonthBar[] {
  return months.map((month) => {
    const f = sumFlows(
      rows.filter((r) => r.month === month),
      currency,
    )
    return { month, income: f.income, expenses: f.expenses, net: f.cashFlow }
  })
}

// -----------------------------------------------------------------------------
// Confronto con il periodo precedente
// -----------------------------------------------------------------------------

/**
 * Variazione relativa, solo quando è significativa: il periodo precedente
 * deve essere interamente coperto da dati (primo movimento ≤ inizio del
 * periodo precedente) e il valore di riferimento diverso da zero. Altrimenti
 * null: nessuna percentuale fuorviante.
 */
export function comparisonRatio(
  current: number,
  previous: number,
  previousRange: DateRange | null,
  firstDataDate: IsoDate | null,
): number | null {
  if (!previousRange || !firstDataDate) return null
  if (compareIsoDates(firstDataDate, previousRange.from) > 0) return null
  if (previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

// -----------------------------------------------------------------------------
// Spese per categoria
// -----------------------------------------------------------------------------

export type CategoryNode = { id: string; name: string; parentId: string | null; color: string | null }

export type CategorySpendingRow = { categoryId: string | null; currency: string; spentCents: number; count: number }

export type CategorySlice = {
  /** Macro-categoria (null = senza categoria). */
  categoryId: string | null
  label: string
  color: string | null
  amount: Cents
  /** Quota sul totale delle spese nette positive (0–1). */
  share: number
  count: number
  /** Tutte le categorie comprese (macro + sottocategorie), per il filtro. */
  categoryIds: string[]
}

/** Raggruppa per macro-categoria (le sottocategorie confluiscono nel padre). */
export function spendingByCategory(
  rows: readonly CategorySpendingRow[],
  categories: readonly CategoryNode[],
  currency = BASE_CURRENCY,
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const rootOf = (id: string): CategoryNode | undefined => {
    let node = byId.get(id)
    for (let guard = 0; node?.parentId && guard < 10; guard++) node = byId.get(node.parentId) ?? node
    return node
  }
  const slices = new Map<string, CategorySlice>()
  for (const row of rows) {
    if (row.currency !== currency) continue
    const root = row.categoryId ? rootOf(row.categoryId) : undefined
    const key = root?.id ?? 'none'
    const slice = slices.get(key) ?? {
      categoryId: root?.id ?? null,
      label: root?.name ?? 'Senza categoria',
      color: root?.color ?? null,
      amount: cents(0),
      share: 0,
      count: 0,
      categoryIds: root ? [root.id, ...categories.filter((c) => c.parentId === root.id).map((c) => c.id)] : [],
    }
    slice.amount = cents(slice.amount + row.spentCents)
    slice.count += row.count
    slices.set(key, slice)
  }
  const list = [...slices.values()].filter((s) => s.amount !== 0 || s.count > 0)
  const total = list.reduce((sum, s) => sum + Math.max(0, s.amount), 0)
  for (const s of list) s.share = total > 0 ? Math.max(0, s.amount) / total : 0
  return list.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
}

// -----------------------------------------------------------------------------
// Fonti di reddito
// -----------------------------------------------------------------------------

export type IncomeSourceRow = { incomeSourceId: string | null; currency: string; incomeCents: number; count: number }
export type IncomeSourceSlice = { incomeSourceId: string | null; label: string; amount: Cents; share: number; count: number }

export function incomeBySource(
  rows: readonly IncomeSourceRow[],
  sources: readonly { id: string; name: string }[],
  currency = BASE_CURRENCY,
): IncomeSourceSlice[] {
  const names = new Map(sources.map((s) => [s.id, s.name]))
  const list = rows
    .filter((r) => r.currency === currency)
    .map((r) => ({
      incomeSourceId: r.incomeSourceId,
      label: r.incomeSourceId ? (names.get(r.incomeSourceId) ?? 'Fonte rimossa') : 'Senza fonte',
      amount: cents(r.incomeCents),
      share: 0,
      count: r.count,
    }))
  const total = list.reduce((sum, s) => sum + Math.max(0, s.amount), 0)
  for (const s of list) s.share = total > 0 ? Math.max(0, s.amount) / total : 0
  return list.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
}

// -----------------------------------------------------------------------------
// Business
// -----------------------------------------------------------------------------

export type BusinessRow = { businessId: string; currency: string; revenueCents: number; expenseCents: number; count: number }

export type BusinessPerformance = {
  businessId: string
  name: string
  revenue: Cents
  expenses: Cents
  profit: Cents
  /** profit / revenue; null se i ricavi sono zero (mai divisione per zero). */
  margin: number | null
  count: number
  /** Colore dell'attività (identità), se impostato. */
  color: string | null
}

export function businessMargin(revenue: number, profit: number): number | null {
  return revenue === 0 ? null : profit / revenue
}

/** Una riga per ogni business attivo, anche senza movimenti nel periodo. */
export function businessPerformance(
  rows: readonly BusinessRow[],
  businesses: readonly { id: string; name: string; color?: string | null }[],
  currency = BASE_CURRENCY,
): BusinessPerformance[] {
  return businesses.map((b) => {
    const mine = rows.filter((r) => r.businessId === b.id && r.currency === currency)
    const revenue = mine.reduce((s, r) => s + r.revenueCents, 0)
    const expenses = mine.reduce((s, r) => s + r.expenseCents, 0)
    const profit = revenue - expenses
    return {
      businessId: b.id,
      name: b.name,
      revenue: cents(revenue),
      expenses: cents(expenses),
      profit: cents(profit),
      margin: businessMargin(revenue, profit),
      count: mine.reduce((s, r) => s + r.count, 0),
      color: b.color ?? null,
    }
  })
}

// -----------------------------------------------------------------------------
// Storico del patrimonio
// -----------------------------------------------------------------------------

export type NetWorthPoint = { date: IsoDate; balance: Cents }

export const NET_WORTH_RANGES = ['30d', '90d', '6m', '1y', 'all'] as const
export type NetWorthRange = (typeof NET_WORTH_RANGES)[number]

/**
 * Punti del grafico per un intervallo che termina oggi. Il valore all'inizio
 * dell'intervallo è l'ultimo noto prima di esso (il saldo non cambia senza
 * movimenti); nessun punto prima del primo dato. L'ultimo valore si estende
 * fino a oggi.
 */
export function netWorthSeries(history: readonly NetWorthPoint[], from: IsoDate | null, today: IsoDate): NetWorthPoint[] {
  const sorted = [...history].sort((a, b) => compareIsoDates(a.date, b.date))
  if (sorted.length === 0) return []
  const firstDate = sorted[0]!.date
  const start = from && compareIsoDates(from, firstDate) > 0 ? from : firstDate
  const before = sorted.filter((p) => compareIsoDates(p.date, start) < 0).at(-1)
  const inside = sorted.filter((p) => compareIsoDates(p.date, start) >= 0 && compareIsoDates(p.date, today) <= 0)
  const points: NetWorthPoint[] = []
  if (before && (inside.length === 0 || inside[0]!.date !== start)) points.push({ date: start, balance: before.balance })
  points.push(...inside)
  const last = points.at(-1)
  if (last && compareIsoDates(last.date, today) < 0) points.push({ date: today, balance: last.balance })
  return points
}
