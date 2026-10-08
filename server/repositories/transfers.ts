import { isIsoDate, type IsoDate } from '@/lib/dates'
import { centsFromDb, type Cents } from '@/lib/money'
import { candidateWindow, rankCandidates } from '@/lib/transfers/candidates'

import { RepositoryError, type DbClient } from './accounts'

/**
 * Trasferimenti tra conti propri: candidati per l'abbinamento, collegamento e
 * scollegamento (funzioni SQL atomiche della migration 0008), conteggio dei
 * trasferimenti ancora senza l'altra metà. Sempre con il client dell'utente.
 */

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

const date = (value: string): IsoDate => {
  if (!isIsoDate(value)) throw new RepositoryError(`Data non valida dal database: ${value}`)
  return value
}

export type TransferCandidate = {
  id: string
  accountName: string
  accountInstitution: string | null
  bookedOn: IsoDate
  description: string
  amount: Cents
  type: string
}

/** Possibili altre metà di un movimento (massimo 5, le più probabili prima). */
export async function transferCandidates(db: DbClient, id: string): Promise<TransferCandidate[]> {
  const { data: tx, error } = await db
    .from('transactions')
    .select('id, account_id, booked_on, amount_cents, currency, type, transfer_group_id')
    .eq('id', id)
    .maybeSingle()
  if (error) fail('Lettura movimento', error)
  if (!tx || tx.transfer_group_id) return []
  const bookedOn = date(tx.booked_on)
  const window = candidateWindow(bookedOn)
  const { data, error: e } = await db
    .from('transactions')
    .select('id, account_id, booked_on, description, amount_cents, currency, type, transfer_group_id, accounts!inner(name, institution)')
    .eq('amount_cents', -Number(tx.amount_cents))
    .eq('currency', tx.currency)
    .neq('account_id', tx.account_id)
    .is('transfer_group_id', null)
    .gte('booked_on', window.from)
    .lte('booked_on', window.to)
    .limit(50)
  if (e) fail('Ricerca altra metà', e)
  const rows = data.map((r) => {
    const row = r as typeof r & { accounts: { name: string; institution: string | null } }
    return {
      id: row.id,
      accountId: row.account_id,
      bookedOn: date(row.booked_on),
      amount: Number(row.amount_cents),
      currency: row.currency,
      type: row.type,
      transferGroupId: row.transfer_group_id,
      description: row.description,
      accountName: row.accounts.name,
      accountInstitution: row.accounts.institution,
    }
  })
  const self = { id: tx.id, accountId: tx.account_id, bookedOn, amount: Number(tx.amount_cents), currency: tx.currency, type: tx.type, transferGroupId: null }
  return rankCandidates(self, rows)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      accountName: r.accountName,
      accountInstitution: r.accountInstitution,
      bookedOn: r.bookedOn,
      description: r.description,
      amount: centsFromDb(r.amount),
      type: r.type,
    }))
}

export type TransferResult = { ok: true } | { ok: false; error: string }

/** Messaggi delle funzioni SQL (già in italiano); gli altri errori restano generici. */
function friendly(error: { message: string; code?: string }): string {
  return error.code === '23514' || error.code === 'P0002' ? error.message : 'Operazione non riuscita, riprova.'
}

export async function linkTransfer(db: DbClient, firstId: string, secondId: string): Promise<TransferResult> {
  const { error } = await db.rpc('link_transfer', { p_first: firstId, p_second: secondId })
  return error ? { ok: false, error: friendly(error) } : { ok: true }
}

export async function unlinkTransfer(db: DbClient, groupId: string): Promise<TransferResult> {
  const { error } = await db.rpc('unlink_transfer', { p_group: groupId })
  return error ? { ok: false, error: friendly(error) } : { ok: true }
}

/** Trasferimenti e versamenti ancora senza l'altra metà. */
export async function unmatchedTransferCount(db: DbClient): Promise<number> {
  const { count, error } = await db
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['transfer', 'investment'])
    .is('transfer_group_id', null)
  if (error) fail('Conteggio trasferimenti da abbinare', error)
  return count ?? 0
}
