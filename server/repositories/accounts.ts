import type { SupabaseClient } from '@supabase/supabase-js'

import { accountKind, type AccountKind, type AccountMovement } from '@/lib/accounts'
import { isIsoDate, toIsoDate, type IsoDate } from '@/lib/dates'
import { centsFromDb, type Cents } from '@/lib/money'
import type { Database } from '@/types/database'

/**
 * Accesso ai dati degli account. Ogni funzione riceve il client Supabase
 * dell'utente: le query girano sempre sotto RLS, mai con service role.
 * (Il client è un parametro per poter testare questo stesso codice contro
 * il database locale reale.)
 */

export type DbClient = SupabaseClient<Database>

export class RepositoryError extends Error {
  override name = 'RepositoryError'
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

export type AccountType = {
  code: string
  label: string
  kind: AccountKind
}

export type Account = {
  id: string
  name: string
  institution: string | null
  /** IBAN del conto (facoltativo): riconosce i trasferimenti tra conti propri. */
  iban: string | null
  type: AccountType
  currency: string
  color: string | null
  isActive: boolean
  sortOrder: number
  initialBalance: Cents
  initialBalanceOn: IsoDate | null
  /** Da vista account_balances: saldo iniziale + movimenti dalla data del saldo iniziale. */
  balance: Cents
  transactionCount: number
  lastTransactionOn: IsoDate | null
}

const ACCOUNT_COLUMNS =
  'id, name, institution, iban, currency, color, is_active, sort_order, initial_balance_cents, initial_balance_on, account_types!inner(code, label, is_liquid, is_investment)'

type AccountRow = {
  id: string
  name: string
  institution: string | null
  iban: string | null
  currency: string
  color: string | null
  is_active: boolean
  sort_order: number
  initial_balance_cents: number
  initial_balance_on: string | null
  account_types: { code: string; label: string; is_liquid: boolean; is_investment: boolean }
}

type BalanceRow = Database['public']['Views']['account_balances']['Row']

function optionalDate(value: string | null): IsoDate | null {
  return value && isIsoDate(value) ? value : null
}

function toAccount(row: AccountRow, balance: BalanceRow | undefined): Account {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    iban: row.iban,
    type: { code: row.account_types.code, label: row.account_types.label, kind: accountKind(row.account_types) },
    currency: row.currency,
    color: row.color,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    initialBalance: centsFromDb(row.initial_balance_cents),
    initialBalanceOn: optionalDate(row.initial_balance_on),
    // Un conto è sempre presente nella vista (left join); in sua assenza il saldo è quello iniziale.
    balance: balance?.balance_cents != null ? centsFromDb(balance.balance_cents) : centsFromDb(row.initial_balance_cents),
    transactionCount: balance?.transaction_count ?? 0,
    lastTransactionOn: optionalDate(balance?.last_transaction_on ?? null),
  }
}

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

export async function listAccounts(db: DbClient): Promise<Account[]> {
  const [accounts, balances] = await Promise.all([
    db.from('accounts').select(ACCOUNT_COLUMNS).order('sort_order').order('name').returns<AccountRow[]>(),
    db.from('account_balances').select('*'),
  ])
  if (accounts.error) fail('Lettura conti', accounts.error)
  if (balances.error) fail('Lettura saldi', balances.error)

  const byId = new Map(balances.data.map((b) => [b.account_id, b]))
  return accounts.data.map((row) => toAccount(row, byId.get(row.id)))
}

export async function getAccount(db: DbClient, id: string): Promise<Account | null> {
  const [account, balance] = await Promise.all([
    db.from('accounts').select(ACCOUNT_COLUMNS).eq('id', id).returns<AccountRow[]>().maybeSingle(),
    db.from('account_balances').select('*').eq('account_id', id).maybeSingle(),
  ])
  if (account.error) fail('Lettura conto', account.error)
  if (balance.error) fail('Lettura saldo', balance.error)
  return account.data ? toAccount(account.data, balance.data ?? undefined) : null
}

/** Dimensione pagina allineata al max_rows predefinito di PostgREST (1000). */
export const MOVEMENTS_PAGE_SIZE = 1000

/**
 * Tutti i movimenti di un conto, a pagine: PostgREST tronca silenziosamente
 * oltre max_rows, quindi una singola query darebbe totali sbagliati.
 */
export async function listAccountMovements(
  db: DbClient,
  accountId: string,
  pageSize = MOVEMENTS_PAGE_SIZE,
): Promise<AccountMovement[]> {
  const movements: AccountMovement[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('transactions')
      .select('id, booked_on, amount_cents, type')
      .eq('account_id', accountId)
      .order('booked_on')
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) fail('Lettura movimenti', error)
    for (const row of data) {
      movements.push({ bookedOn: toIsoDate(row.booked_on), amount: centsFromDb(row.amount_cents), type: row.type })
    }
    if (data.length < pageSize) return movements
  }
}

export type AccountUpdate = {
  name: string
  institution: string | null
  iban?: string | null
  color: string | null
  initialBalance: Cents
  initialBalanceOn: IsoDate | null
}

export type UpdateResult = { ok: true } | { ok: false; reason: 'not_found' | 'duplicate_name' | 'duplicate_iban' }

/** Aggiorna solo i campi modificabili; RLS garantisce che il conto sia dell'utente. */
export async function updateAccount(db: DbClient, id: string, update: AccountUpdate): Promise<UpdateResult> {
  const { data, error } = await db
    .from('accounts')
    .update({
      name: update.name,
      institution: update.institution,
      ...(update.iban !== undefined ? { iban: update.iban } : {}),
      color: update.color,
      initial_balance_cents: update.initialBalance,
      initial_balance_on: update.initialBalanceOn,
    })
    .eq('id', id)
    .select('id')
  if (error) {
    if (error.code === '23505') return { ok: false, reason: error.message.includes('iban') ? 'duplicate_iban' : 'duplicate_name' }
    fail('Aggiornamento conto', error)
  }
  // 0 righe = conto inesistente o di un altro utente (RLS): stessa risposta, nessuna informazione trapela.
  return data.length === 1 ? { ok: true } : { ok: false, reason: 'not_found' }
}

export async function setAccountActive(db: DbClient, id: string, isActive: boolean): Promise<UpdateResult> {
  const { data, error } = await db.from('accounts').update({ is_active: isActive }).eq('id', id).select('id')
  if (error) fail('Aggiornamento stato conto', error)
  return data.length === 1 ? { ok: true } : { ok: false, reason: 'not_found' }
}
