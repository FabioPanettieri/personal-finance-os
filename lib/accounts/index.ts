/**
 * Logica pura degli account (docs/00-architecture.md §3).
 *
 * Il saldo ufficiale arriva dalla vista `account_balances`; qui si scompone
 * la variazione del saldo per tipo di movimento e si costruisce la serie
 * storica. Le funzioni sono riconciliabili: la somma delle componenti è
 * sempre uguale alla variazione del saldo.
 */

import { addCents, cents, sumCents, ZERO, type Cents } from '../money'
import { compareIsoDates, type IsoDate } from '../dates'

export type TransactionType = 'income' | 'expense' | 'transfer' | 'investment' | 'refund'

export type AccountMovement = {
  bookedOn: IsoDate
  amount: Cents
  type: TransactionType
}

export type AccountKind = 'liquid' | 'investment' | 'other'

export type AccountFlows = {
  /** Entrate (type income). */
  income: Cents
  /** Rimborsi ricevuti (riducono le spese). */
  refunds: Cents
  /** Spese lorde, in valore assoluto. */
  expenses: Cents
  /** Spese al netto dei rimborsi: la cifra "Uscite" mostrata all'utente. */
  netExpenses: Cents
  /** Trasferimenti tra conti propri: non sono né entrate né spese. */
  transfersIn: Cents
  transfersOut: Cents
  /** Denaro verso/da investimenti (type investment), in valore assoluto. */
  investedOut: Cents
  investedIn: Cents
  /** Somma algebrica di tutti i movimenti considerati. */
  netChange: Cents
  movementCount: number
  firstOn: IsoDate | null
  lastOn: IsoDate | null
}

/** Movimenti che concorrono al saldo, con la stessa regola della vista SQL. */
export function movementsInBalanceWindow(movements: readonly AccountMovement[], initialBalanceOn: IsoDate | null) {
  if (!initialBalanceOn) return [...movements]
  return movements.filter((m) => compareIsoDates(m.bookedOn, initialBalanceOn) >= 0)
}

export function summarizeFlows(movements: readonly AccountMovement[]): AccountFlows {
  let income = 0
  let refunds = 0
  let expenses = 0
  let transfersIn = 0
  let transfersOut = 0
  let investedIn = 0
  let investedOut = 0
  let firstOn: IsoDate | null = null
  let lastOn: IsoDate | null = null

  for (const m of movements) {
    switch (m.type) {
      case 'income':
        income += m.amount
        break
      case 'refund':
        refunds += m.amount
        break
      case 'expense':
        expenses += -m.amount
        break
      case 'transfer':
        if (m.amount >= 0) transfersIn += m.amount
        else transfersOut += -m.amount
        break
      case 'investment':
        if (m.amount >= 0) investedIn += m.amount
        else investedOut += -m.amount
        break
    }
    if (!firstOn || compareIsoDates(m.bookedOn, firstOn) < 0) firstOn = m.bookedOn
    if (!lastOn || compareIsoDates(m.bookedOn, lastOn) > 0) lastOn = m.bookedOn
  }

  return {
    income: cents(income),
    refunds: cents(refunds),
    expenses: cents(expenses),
    netExpenses: cents(expenses - refunds),
    transfersIn: cents(transfersIn),
    transfersOut: cents(transfersOut),
    investedIn: cents(investedIn),
    investedOut: cents(investedOut),
    netChange: sumCents(movements.map((m) => m.amount)),
    movementCount: movements.length,
    firstOn,
    lastOn,
  }
}

export type BalancePoint = { date: IsoDate; balance: Cents }

/**
 * Saldo a fine giornata per ogni giorno con movimenti. Se il saldo iniziale
 * ha una data precedente al primo movimento, la serie parte da lì.
 * Nessun punto inventato: giorni senza movimenti non compaiono.
 */
export function balanceSeries(
  movements: readonly AccountMovement[],
  initialBalance: Cents,
  initialBalanceOn: IsoDate | null,
): BalancePoint[] {
  const windowed = movementsInBalanceWindow(movements, initialBalanceOn).sort((a, b) =>
    compareIsoDates(a.bookedOn, b.bookedOn),
  )
  const points: BalancePoint[] = []
  if (initialBalanceOn && (windowed.length === 0 || compareIsoDates(initialBalanceOn, windowed[0]!.bookedOn) < 0)) {
    points.push({ date: initialBalanceOn, balance: initialBalance })
  }

  let running = initialBalance
  for (const m of windowed) {
    running = addCents(running, m.amount)
    const last = points.at(-1)
    if (last && last.date === m.bookedOn) last.balance = running
    else points.push({ date: m.bookedOn, balance: running })
  }
  return points
}

export function accountKind(type: { is_liquid: boolean; is_investment: boolean }): AccountKind {
  if (type.is_investment) return 'investment'
  return type.is_liquid ? 'liquid' : 'other'
}

export type CurrencyTotals = {
  currency: string
  total: Cents
  liquid: Cents
  investment: Cents
  other: Cents
  accountCount: number
}

/**
 * Totali per valuta (importi in valute diverse non si sommano mai). Include
 * anche i conti disattivati: un conto archiviato con saldo ≠ 0 è comunque
 * denaro dell'utente. I trasferimenti interni si compensano per costruzione,
 * perché ogni gamba è sul saldo del rispettivo conto.
 */
export function totalsByCurrency(
  accounts: readonly { currency: string; balance: Cents; kind: AccountKind }[],
): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>()
  for (const account of accounts) {
    const entry = byCurrency.get(account.currency) ?? {
      currency: account.currency,
      total: ZERO,
      liquid: ZERO,
      investment: ZERO,
      other: ZERO,
      accountCount: 0,
    }
    entry.total = addCents(entry.total, account.balance)
    entry[account.kind] = addCents(entry[account.kind], account.balance)
    entry.accountCount += 1
    byCurrency.set(account.currency, entry)
  }
  // EUR (valuta base) per prima, poi alfabetico.
  return [...byCurrency.values()].sort((a, b) =>
    a.currency === 'EUR' ? -1 : b.currency === 'EUR' ? 1 : a.currency.localeCompare(b.currency),
  )
}
