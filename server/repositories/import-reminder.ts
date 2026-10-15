import { isIsoDate, isoDateInTimeZone, type IsoDate } from '@/lib/dates'
import type { ReminderAccount } from '@/lib/imports/reminder'

import { RepositoryError, type DbClient } from './accounts'

/** Conti alimentati dai CSV con l'ultimo import confermato e l'ultimo movimento. */
export async function reminderAccounts(db: DbClient, timeZone: string): Promise<ReminderAccount[]> {
  const [accounts, imports, balances] = await Promise.all([
    db.from('accounts').select('id, name, institution').eq('is_active', true).not('default_bank_profile', 'is', null).order('sort_order'),
    db.from('imports').select('account_id, committed_at').eq('status', 'committed').order('committed_at', { ascending: false }).limit(500),
    db.from('account_balances').select('account_id, last_transaction_on'),
  ])
  for (const r of [accounts, imports, balances]) if (r.error) throw new RepositoryError(`Promemoria import: ${r.error.message}`, r.error.code)
  const lastImport = new Map<string, IsoDate>()
  for (const i of imports.data!) {
    if (i.committed_at && !lastImport.has(i.account_id)) lastImport.set(i.account_id, isoDateInTimeZone(new Date(i.committed_at), timeZone))
  }
  const lastMovement = new Map(balances.data!.map((b) => [b.account_id, b.last_transaction_on]))
  return accounts.data!.map((a) => {
    const last = lastMovement.get(a.id)
    return {
      id: a.id,
      name: a.name,
      institution: a.institution,
      lastImportOn: lastImport.get(a.id) ?? null,
      lastMovementOn: last && isIsoDate(last) ? last : null,
    }
  })
}
