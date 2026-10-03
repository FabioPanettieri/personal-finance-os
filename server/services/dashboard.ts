import type { IsoDate } from '@/lib/dates'
import {
  BASE_CURRENCY,
  businessPerformance,
  comparisonRatio,
  incomeBySource,
  monthlyBars,
  netWorthBreakdown,
  spendingByCategory,
  sumFlows,
  type BusinessPerformance,
  type CategorySlice,
  type Flows,
  type IncomeSourceSlice,
  type MonthBar,
  type NetWorthBreakdown,
  type NetWorthPoint,
} from '@/lib/dashboard/metrics'
import { monthsInRange, resolvePeriod, type Period, type PeriodInput } from '@/lib/dashboard/period'
import type { Cents } from '@/lib/money'

import { listAccounts, type Account, type DbClient } from '../repositories/accounts'
import {
  accountChanges,
  businessList,
  businessRows,
  categorySpending,
  categoryTree,
  firstTransactionDate,
  importHealth,
  incomeSourceList,
  incomeSources,
  investedAtCost,
  monthlyFlows,
  netWorthHistory,
  recentTransactions,
  reviewCounts,
  type ImportHealth,
  type RecentTransaction,
  type ReviewCounts,
} from '../repositories/dashboard'

/**
 * Composizione della dashboard: legge gli aggregati in parallelo e li
 * trasforma con le funzioni pure di lib/dashboard. Nessuna metrica salvata.
 */

export type DashboardAccount = Account & { periodChange: Cents | null; periodCount: number; investedAtCost: Cents | null }

export type Dashboard = {
  period: Period
  currency: string
  /** Altre valute presenti: non si sommano mai all'euro. */
  otherCurrencies: string[]
  firstDataDate: IsoDate | null
  hasData: boolean
  breakdown: NetWorthBreakdown
  flows: Flows
  previousFlows: Flows | null
  comparison: { income: number | null; expenses: number | null; cashFlow: number | null }
  bars: MonthBar[]
  categories: CategorySlice[]
  incomeSources: IncomeSourceSlice[]
  businesses: BusinessPerformance[]
  accounts: DashboardAccount[]
  history: NetWorthPoint[]
  recent: RecentTransaction[]
  review: ReviewCounts
  imports: ImportHealth[]
}

export async function loadDashboard(db: DbClient, input: PeriodInput, today: IsoDate, timeZone?: string): Promise<Dashboard> {
  const firstDataDate = await firstTransactionDate(db)
  const period = resolvePeriod(input, today, firstDataDate)
  const currency = BASE_CURRENCY

  const [accounts, invested, flows, previous, categories, tree, income, sources, business, businesses, changes, history, recent, review, imports] =
    await Promise.all([
      listAccounts(db),
      investedAtCost(db),
      monthlyFlows(db, period),
      period.previous ? monthlyFlows(db, period.previous) : Promise.resolve(null),
      categorySpending(db, period),
      categoryTree(db),
      incomeSources(db, period),
      incomeSourceList(db),
      businessRows(db, period),
      businessList(db),
      accountChanges(db, period),
      netWorthHistory(db, currency),
      recentTransactions(db, 10),
      reviewCounts(db),
      importHealth(db, timeZone),
    ])

  const current = sumFlows(flows, currency)
  const previousFlows = previous ? sumFlows(previous, currency) : null
  const ratio = (a: number, b: number | undefined) => (b === undefined ? null : comparisonRatio(a, b, period.previous, firstDataDate))

  return {
    period,
    currency,
    otherCurrencies: [...new Set(accounts.map((a) => a.currency).filter((c) => c !== currency))].sort(),
    firstDataDate,
    hasData: firstDataDate !== null || accounts.some((a) => a.balance !== 0),
    breakdown: netWorthBreakdown(
      accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, balance: a.balance, kind: a.type.kind, typeCode: a.type.code })),
      invested,
      currency,
    ),
    flows: current,
    previousFlows,
    comparison: {
      income: ratio(current.income, previousFlows?.income),
      expenses: ratio(current.expenses, previousFlows?.expenses),
      cashFlow: ratio(current.cashFlow, previousFlows?.cashFlow),
    },
    bars: monthlyBars(flows, monthsInRange(period), currency),
    categories: spendingByCategory(categories, tree, currency),
    incomeSources: incomeBySource(income, sources, currency),
    businesses: businessPerformance(business, businesses, currency),
    accounts: accounts.map((a) => ({
      ...a,
      periodChange: changes.get(a.id)?.change ?? null,
      periodCount: changes.get(a.id)?.count ?? 0,
      investedAtCost: a.type.kind === 'investment' ? (invested.get(a.id) ?? null) : null,
    })),
    history,
    recent,
    review,
    imports,
  }
}
