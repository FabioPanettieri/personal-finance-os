import { isIsoDate, type IsoDate } from '@/lib/dates'
import type { PlanFrequency, Price, Trade } from '@/lib/investments/portfolio'

import { listAccounts, RepositoryError, type Account, type DbClient } from './accounts'

/**
 * Investimenti: operazioni su titoli, prezzi inseriti a mano, movimenti di
 * cassa del conto broker e piani di accumulo. Sempre con il client
 * dell'utente (RLS + AAL2). Stessa finestra del saldo: dal saldo iniziale.
 */

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

const date = (value: string): IsoDate => {
  if (!isIsoDate(value)) throw new RepositoryError(`Data non valida dal database: ${value}`)
  return value
}

export async function investmentAccounts(db: DbClient): Promise<Account[]> {
  return (await listAccounts(db)).filter((a) => a.type.kind === 'investment')
}

export type Instrument = { id: string; name: string; isin: string | null; symbol: string | null }

export type PortfolioData = {
  trades: Trade[]
  prices: Price[]
  instruments: Map<string, Instrument>
  netDepositsCents: number
  incomeCents: number
  costsCents: number
}

export async function loadPortfolioData(db: DbClient, account: Account): Promise<PortfolioData> {
  const since = account.initialBalanceOn
  let trades = db
    .from('investment_transactions')
    .select('instrument_id, trade_on, kind, quantity, amount_cents')
    .eq('account_id', account.id)
    .in('kind', ['buy', 'sell'])
  if (since) trades = trades.gte('trade_on', since)
  let cash = db.from('transactions').select('type, amount_cents').eq('account_id', account.id)
  if (since) cash = cash.gte('booked_on', since)

  const [t, v, c, i] = await Promise.all([
    trades,
    db.from('investment_valuations').select('instrument_id, unit_price, valued_on').eq('account_id', account.id).not('unit_price', 'is', null).not('instrument_id', 'is', null),
    cash,
    db.from('instruments').select('id, name, isin, symbol'),
  ])
  if (t.error) fail('Operazioni su titoli', t.error)
  if (v.error) fail('Prezzi', v.error)
  if (c.error) fail('Movimenti del broker', c.error)
  if (i.error) fail('Strumenti', i.error)

  let deposits = 0
  let income = 0
  let costs = 0
  for (const row of c.data) {
    const amount = Number(row.amount_cents)
    if (row.type === 'transfer' || row.type === 'investment') deposits += amount
    else if (row.type === 'income') income += amount
    else costs -= amount
  }
  return {
    trades: t.data
      .filter((r) => r.instrument_id && r.quantity !== null)
      .map((r) => ({ instrumentId: r.instrument_id!, tradeOn: date(r.trade_on), kind: r.kind as 'buy' | 'sell', quantity: Number(r.quantity), amountCents: Number(r.amount_cents) })),
    prices: v.data.map((r) => ({ instrumentId: r.instrument_id!, unitPrice: Number(r.unit_price), valuedOn: date(r.valued_on) })),
    instruments: new Map(i.data.map((r) => [r.id, r])),
    netDepositsCents: account.initialBalance + deposits,
    incomeCents: income,
    costsCents: costs,
  }
}

/** "95,40" o "1.234,5678" → 95.4 / 1234.5678; null se non valido (fino a 8 decimali). */
export function parseUnitPrice(input: string): number | null {
  const text = input.trim().replace(/\s/g, '').replace(/€/g, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,8})?$|^\d+(,\d{1,8})?$/.test(text)) return null
  const value = Number(text.replace(/\./g, '').replace(',', '.'))
  return value > 0 && value < 1e11 ? value : null
}

export type SaveResult = { ok: true } | { ok: false; error: string }

/** Registra il prezzo di oggi (uno per strumento e giorno: si aggiorna se esiste già). */
export async function savePrice(db: DbClient, input: { accountId: string; instrumentId: string; unitPrice: number; quantity: number; valuedOn: IsoDate }): Promise<SaveResult> {
  const { error } = await db.from('investment_valuations').upsert(
    {
      account_id: input.accountId,
      instrument_id: input.instrumentId,
      valued_on: input.valuedOn,
      unit_price: input.unitPrice,
      market_value_cents: Math.round(input.quantity * input.unitPrice * 100),
      source: 'manual',
    },
    { onConflict: 'account_id,instrument_id,valued_on' },
  )
  if (error) return { ok: false, error: error.code === '23503' ? 'Conto o strumento non trovato' : 'Prezzo non salvato, riprova.' }
  return { ok: true }
}

export type Plan = {
  id: string
  accountId: string
  instrumentId: string | null
  name: string
  amountCents: number
  frequency: PlanFrequency
  dayOfMonth: number | null
  startsOn: IsoDate
  endsOn: IsoDate | null
  isActive: boolean
}

export async function listPlans(db: DbClient, accountId: string): Promise<Plan[]> {
  const { data, error } = await db.from('investment_plans').select('*').eq('account_id', accountId).order('created_at')
  if (error) fail('Piani di accumulo', error)
  return data.map((p) => ({
    id: p.id,
    accountId: p.account_id,
    instrumentId: p.instrument_id,
    name: p.name,
    amountCents: Number(p.amount_cents),
    frequency: p.frequency as PlanFrequency,
    dayOfMonth: p.day_of_month,
    startsOn: date(p.starts_on),
    endsOn: p.ends_on ? date(p.ends_on) : null,
    isActive: p.is_active,
  }))
}

export type PlanInput = { accountId: string; instrumentId: string | null; name: string; amountCents: number; frequency: PlanFrequency; startsOn: IsoDate }

export async function createPlan(db: DbClient, input: PlanInput): Promise<SaveResult> {
  const { error } = await db.from('investment_plans').insert({
    account_id: input.accountId,
    instrument_id: input.instrumentId,
    name: input.name,
    amount_cents: input.amountCents,
    frequency: input.frequency,
    day_of_month: input.frequency === 'monthly' || input.frequency === 'quarterly' ? Number(input.startsOn.slice(8, 10)) : null,
    starts_on: input.startsOn,
  })
  if (error) return { ok: false, error: error.code === '23503' ? 'Conto o strumento non trovato' : 'Piano non salvato, riprova.' }
  return { ok: true }
}

export async function setPlanActive(db: DbClient, id: string, isActive: boolean): Promise<boolean> {
  const { data, error } = await db.from('investment_plans').update({ is_active: isActive }).eq('id', id).select('id')
  if (error) fail('Piano di accumulo', error)
  return data.length === 1
}

export async function deletePlan(db: DbClient, id: string): Promise<boolean> {
  const { data, error } = await db.from('investment_plans').delete().eq('id', id).select('id')
  if (error) fail('Piano di accumulo', error)
  return data.length === 1
}
