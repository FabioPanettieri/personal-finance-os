import type { IsoDate } from '@/lib/dates'
import { computePositions, monthlyEquivalent, nextExecution, summarizePortfolio, valuePositions, type PortfolioSummary, type ValuedPosition } from '@/lib/investments/portfolio'
import type { Account, DbClient } from '@/server/repositories/accounts'
import { investmentAccounts, listPlans, loadPortfolioData, type Instrument, type Plan } from '@/server/repositories/investments'

export type PositionView = ValuedPosition & { instrument: Instrument | null }
export type PlanView = Plan & { next: IsoDate | null; monthly: number; instrumentName: string | null }

export type BrokerView = {
  account: Account
  summary: PortfolioSummary
  positions: PositionView[]
  closed: PositionView[]
  plans: PlanView[]
  monthlyPlanned: number
  instruments: Instrument[]
}

/** Un riepilogo per ogni conto di investimento (oggi: Trade Republic). */
export async function loadInvestments(db: DbClient, today: IsoDate): Promise<BrokerView[]> {
  const accounts = await investmentAccounts(db)
  return Promise.all(
    accounts.map(async (account) => {
      const [data, plans] = await Promise.all([loadPortfolioData(db, account), listPlans(db, account.id)])
      const valued = valuePositions(computePositions(data.trades), data.prices).map((p) => ({ ...p, instrument: data.instruments.get(p.instrumentId) ?? null }))
      const summary = summarizePortfolio({
        balanceCents: account.balance,
        netDepositsCents: data.netDepositsCents,
        incomeCents: data.incomeCents,
        costsCents: data.costsCents,
        trades: data.trades,
        positions: valued,
      })
      const planViews = plans.map((p) => ({
        ...p,
        next: p.isActive ? nextExecution(p, today) : null,
        monthly: monthlyEquivalent(p.amountCents, p.frequency),
        instrumentName: p.instrumentId ? (data.instruments.get(p.instrumentId)?.name ?? null) : null,
      }))
      const held = new Set(valued.map((p) => p.instrumentId))
      return {
        account,
        summary,
        positions: valued.filter((p) => p.quantity > 0).sort((a, b) => (b.marketValueCents ?? b.costCents) - (a.marketValueCents ?? a.costCents)),
        closed: valued.filter((p) => p.quantity === 0),
        plans: planViews,
        monthlyPlanned: planViews.filter((p) => p.isActive && p.next).reduce((s, p) => s + p.monthly, 0),
        instruments: [...data.instruments.values()].filter((i) => held.has(i.id)).sort((a, b) => a.name.localeCompare(b.name, 'it')),
      }
    }),
  )
}
