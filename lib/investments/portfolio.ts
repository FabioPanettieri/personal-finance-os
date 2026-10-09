/**
 * Portafoglio del broker (Sprint 8). Principio: versamento ≠ rendimento.
 *
 *   liquidità  = saldo del conto − (acquisti − vendite)   [gli acquisti non sono movimenti di cassa]
 *   valore     = liquidità + titoli a valore di mercato (al costo se manca un prezzo)
 *   rendimento = valore − versato netto
 *
 * Un nuovo versamento aumenta saldo e versato della stessa cifra: il
 * rendimento non cambia. Posizioni a costo medio ponderato. Importi in centesimi.
 */
import { addDays, compareIsoDates, type IsoDate } from '../dates'

export type Trade = {
  instrumentId: string
  tradeOn: IsoDate
  kind: 'buy' | 'sell'
  quantity: number
  /** Effetto sulla liquidità: acquisto < 0, vendita > 0. */
  amountCents: number
}

export type Position = {
  instrumentId: string
  quantity: number
  /** Costo residuo (medio ponderato) delle quote ancora in portafoglio. */
  costCents: number
  /** Guadagno/perdita realizzato con le vendite. */
  realizedCents: number
  trades: number
}

const QTY_EPSILON = 1e-9

/** Posizioni per strumento, in ordine cronologico, a costo medio ponderato. */
export function computePositions(trades: readonly Trade[]): Position[] {
  const byInstrument = new Map<string, Position>()
  const ordered = [...trades].sort((a, b) => compareIsoDates(a.tradeOn, b.tradeOn) || (a.kind === b.kind ? 0 : a.kind === 'buy' ? -1 : 1))
  for (const t of ordered) {
    const p = byInstrument.get(t.instrumentId) ?? { instrumentId: t.instrumentId, quantity: 0, costCents: 0, realizedCents: 0, trades: 0 }
    p.trades += 1
    if (t.kind === 'buy') {
      p.quantity += t.quantity
      p.costCents += -t.amountCents
    } else {
      const sold = Math.min(t.quantity, p.quantity)
      const costOut = p.quantity > 0 ? Math.round((p.costCents * sold) / p.quantity) : 0
      p.quantity -= sold
      p.costCents -= costOut
      p.realizedCents += t.amountCents - costOut
      if (p.quantity < QTY_EPSILON) {
        p.quantity = 0
        p.costCents = 0
      }
    }
    byInstrument.set(t.instrumentId, p)
  }
  return [...byInstrument.values()]
}

export type Price = { instrumentId: string; unitPrice: number; valuedOn: IsoDate }

export type ValuedPosition = Position & {
  price: Price | null
  /** Quantità × ultimo prezzo; null se manca il prezzo. */
  marketValueCents: number | null
  /** Valore di mercato − costo; null se manca il prezzo. */
  unrealizedCents: number | null
}

export function valuePositions(positions: readonly Position[], prices: readonly Price[]): ValuedPosition[] {
  const latest = new Map<string, Price>()
  for (const p of prices) {
    const current = latest.get(p.instrumentId)
    if (!current || compareIsoDates(p.valuedOn, current.valuedOn) > 0) latest.set(p.instrumentId, p)
  }
  return positions.map((p) => {
    const price = latest.get(p.instrumentId) ?? null
    const marketValueCents = price ? Math.round(p.quantity * price.unitPrice * 100) : null
    return { ...p, price, marketValueCents, unrealizedCents: marketValueCents === null ? null : marketValueCents - p.costCents }
  })
}

export type PortfolioInput = {
  /** Saldo del conto broker (account_balances): liquidità + titoli al costo. */
  balanceCents: number
  /** Saldo iniziale + versamenti − prelievi (movimenti di tipo transfer/investment). */
  netDepositsCents: number
  /** Dividendi e interessi incassati. */
  incomeCents: number
  /** Commissioni e imposte pagate (positivo). */
  costsCents: number
  trades: readonly Trade[]
  positions: readonly ValuedPosition[]
}

export type PortfolioSummary = {
  netDeposits: number
  liquidity: number
  securitiesCost: number
  securitiesValue: number
  value: number
  /** Rendimento totale = valore − versato netto. */
  gain: number
  /** gain / versato netto; null se il versato non è positivo. */
  gainRatio: number | null
  realized: number
  unrealized: number
  income: number
  costs: number
  /** Posizioni aperte senza un prezzo (valutate al costo). */
  unpriced: number
}

export function summarizePortfolio(input: PortfolioInput): PortfolioSummary {
  const tradeFlow = input.trades.reduce((s, t) => s + t.amountCents, 0)
  const liquidity = input.balanceCents + tradeFlow
  const open = input.positions.filter((p) => p.quantity > 0)
  const securitiesCost = open.reduce((s, p) => s + p.costCents, 0)
  const securitiesValue = open.reduce((s, p) => s + (p.marketValueCents ?? p.costCents), 0)
  const value = liquidity + securitiesValue
  const gain = value - input.netDepositsCents
  return {
    netDeposits: input.netDepositsCents,
    liquidity,
    securitiesCost,
    securitiesValue,
    value,
    gain,
    gainRatio: input.netDepositsCents > 0 ? gain / input.netDepositsCents : null,
    realized: input.positions.reduce((s, p) => s + p.realizedCents, 0),
    unrealized: open.reduce((s, p) => s + (p.unrealizedCents ?? 0), 0),
    income: input.incomeCents,
    costs: input.costsCents,
    unpriced: open.filter((p) => p.price === null).length,
  }
}

// -----------------------------------------------------------------------------
// Piani di accumulo (PAC)
// -----------------------------------------------------------------------------

export type PlanFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly'

export const FREQUENCY_LABELS: Record<PlanFrequency, string> = {
  weekly: 'Ogni settimana',
  biweekly: 'Ogni due settimane',
  monthly: 'Ogni mese',
  quarterly: 'Ogni tre mesi',
}

/** Quota mensile equivalente di un piano (per il totale "investi ogni mese"). */
export function monthlyEquivalent(amountCents: number, frequency: PlanFrequency): number {
  switch (frequency) {
    case 'weekly':
      return Math.round((amountCents * 52) / 12)
    case 'biweekly':
      return Math.round((amountCents * 26) / 12)
    case 'quarterly':
      return Math.round(amountCents / 3)
    default:
      return amountCents
  }
}

function monthDate(year: number, month0: number, day: number): IsoDate {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const d = new Date(Date.UTC(year, month0, Math.min(day, last)))
  return d.toISOString().slice(0, 10) as IsoDate
}

/** Prossima esecuzione a partire da oggi (incluso); null se il piano è finito. */
export function nextExecution(
  plan: { frequency: PlanFrequency; startsOn: IsoDate; endsOn: IsoDate | null; dayOfMonth: number | null },
  today: IsoDate,
): IsoDate | null {
  let next: IsoDate
  if (plan.frequency === 'weekly' || plan.frequency === 'biweekly') {
    const step = plan.frequency === 'weekly' ? 7 : 14
    next = plan.startsOn
    while (compareIsoDates(next, today) < 0) next = addDays(next, step)
  } else {
    const step = plan.frequency === 'monthly' ? 1 : 3
    const day = plan.dayOfMonth ?? Number(plan.startsOn.slice(8, 10))
    let year = Number(plan.startsOn.slice(0, 4))
    let month0 = Number(plan.startsOn.slice(5, 7)) - 1
    next = monthDate(year, month0, day)
    while (compareIsoDates(next, today) < 0 || compareIsoDates(next, plan.startsOn) < 0) {
      month0 += step
      year += Math.floor(month0 / 12)
      month0 %= 12
      next = monthDate(year, month0, day)
    }
  }
  return plan.endsOn && compareIsoDates(next, plan.endsOn) > 0 ? null : next
}
