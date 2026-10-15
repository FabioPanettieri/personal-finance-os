import { addDays, type IsoDate } from '../dates'

/**
 * Promemoria settimanale degli estratti: per ogni conto che si aggiorna con i CSV
 * (ING, Revolut, Trade Republic) ricorda di caricare il nuovo estratto se l'ultimo
 * import confermato ha 7 giorni o più (o non c'è). Suggerisce il periodo da scaricare:
 * dal giorno dopo l'ultimo movimento già presente fino a oggi, così non manca nulla.
 */
export const REMINDER_DAYS = 7

export type ReminderAccount = {
  id: string
  name: string
  institution: string | null
  /** Data (locale) dell'ultimo import confermato su questo conto. */
  lastImportOn: IsoDate | null
  /** Ultimo movimento presente nel conto. */
  lastMovementOn: IsoDate | null
}

export type ImportReminder = ReminderAccount & { daysSinceImport: number | null; suggestedFrom: IsoDate | null; suggestedTo: IsoDate }

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function importReminders(accounts: readonly ReminderAccount[], today: IsoDate): ImportReminder[] {
  return accounts
    .map((a) => ({
      ...a,
      daysSinceImport: a.lastImportOn ? daysBetween(a.lastImportOn, today) : null,
      suggestedFrom: a.lastMovementOn ? addDays(a.lastMovementOn, 1) : null,
      suggestedTo: today,
    }))
    .filter((r) => r.daysSinceImport === null || r.daysSinceImport >= REMINDER_DAYS)
}
