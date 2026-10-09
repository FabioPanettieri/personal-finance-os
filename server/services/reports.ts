import { splitTotals, type SplitTotals } from '@/lib/dashboard/business'
import { BASE_CURRENCY, monthlyBars, spendingByCategory, sumFlows, type CategorySlice, type Flows, type MonthBar } from '@/lib/dashboard/metrics'
import { monthsInRange, type DateRange } from '@/lib/dashboard/period'
import { addDays, isIsoDate, type IsoDate } from '@/lib/dates'
import { balanceAt, yearEndHistory, type YearPoint } from '@/lib/reports/history'
import { buildInsights, type Insight } from '@/lib/reports/insights'
import { effectiveEnd, resolveReportPeriod, type ReportPeriod } from '@/lib/reports/periods'
import { RepositoryError, type DbClient } from '@/server/repositories/accounts'
import { personalBusinessSplit } from '@/server/repositories/business'
import { categorySpending, categoryTree, monthlyFlows, netWorthHistory } from '@/server/repositories/dashboard'

export type Report = {
  period: ReportPeriod
  currency: string
  flows: Flows
  previousFlows: Flows
  lastYearFlows: Flows | null
  categories: CategorySlice[]
  split: SplitTotals
  netWorth: { start: number | null; end: number | null }
  insights: Insight[]
  /** Solo per l'anno: un punto per mese, il confronto con l'anno prima e lo storico. */
  months: MonthBar[] | null
  previousYearEnd: number | null
  history: YearPoint[]
}

async function biggestExpense(db: DbClient, range: DateRange) {
  const { data, error } = await db
    .from('transactions')
    .select('description, amount_cents, booked_on')
    .eq('type', 'expense')
    .gte('booked_on', range.from)
    .lte('booked_on', range.to)
    .order('amount_cents', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new RepositoryError(`Spesa più grande: ${error.message}`, error.code)
  return data && isIsoDate(data.booked_on) ? { description: data.description, amount: Number(data.amount_cents), bookedOn: data.booked_on } : null
}

async function toReview(db: DbClient, range: DateRange): Promise<number> {
  const { count, error } = await db
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('is_categorized', false)
    .gte('booked_on', range.from)
    .lte('booked_on', range.to)
  if (error) throw new RepositoryError(`Movimenti da sistemare: ${error.message}`, error.code)
  return count ?? 0
}

/**
 * Report di una settimana, un mese o un anno. Tutti i numeri vengono dagli
 * aggregati SQL già usati dalla Home (stessa definizione di entrate e uscite:
 * trasferimenti e investimenti esclusi); le osservazioni solo da questi numeri.
 */
export async function loadReport(db: DbClient, input: { kind?: string | null; at?: string | null }, today: IsoDate, currency = BASE_CURRENCY): Promise<Report> {
  const period = resolveReportPeriod(input, today)
  const [rows, prevRows, lastYearRows, catRows, prevCatRows, tree, split, history, biggest, review] = await Promise.all([
    monthlyFlows(db, period),
    monthlyFlows(db, period.previous),
    period.lastYear ? monthlyFlows(db, period.lastYear) : Promise.resolve(null),
    categorySpending(db, period),
    categorySpending(db, period.previous),
    categoryTree(db),
    personalBusinessSplit(db, period),
    netWorthHistory(db, currency),
    biggestExpense(db, period),
    toReview(db, period),
  ])

  const flows = sumFlows(rows, currency)
  const previousFlows = sumFlows(prevRows, currency)
  const categories = spendingByCategory(catRows, tree, currency)
  const previousCategories = spendingByCategory(prevCatRows, tree, currency)
  const netWorth = { start: balanceAt(history, addDays(period.from, -1)), end: balanceAt(history, effectiveEnd(period, today)) }

  const insights = buildInsights({
    currency,
    income: flows.income,
    expenses: flows.expenses,
    count: flows.incomeCount + flows.expenseCount,
    previous: { label: period.previous.label, income: previousFlows.income, expenses: previousFlows.expenses, count: previousFlows.incomeCount + previousFlows.expenseCount },
    categories: categories.map((c) => ({ label: c.label, amount: c.amount })),
    previousCategories: previousCategories.map((c) => ({ label: c.label, amount: c.amount })),
    biggestExpense: biggest,
    netWorth,
    toReview: review,
    ongoing: period.ongoing,
  })

  return {
    period,
    currency,
    flows,
    previousFlows,
    lastYearFlows: lastYearRows ? sumFlows(lastYearRows, currency) : null,
    categories,
    split: splitTotals(split, currency),
    netWorth,
    insights,
    months: period.kind === 'year' ? monthlyBars(rows, monthsInRange(period), currency) : null,
    previousYearEnd: period.kind === 'year' ? balanceAt(history, period.previous.to) : null,
    history: period.kind === 'year' ? yearEndHistory(history, today) : [],
  }
}
