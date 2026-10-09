import { normalizeDescription } from '../csv/values'

/**
 * Giroconti riconosciuti senza che l'utente debba dirlo ogni volta:
 *
 * 1. bonifici da/verso una persona con il NOME DELL'INTESTATARIO (il nome che la
 *    banca stessa usa nei giroconti, o il nome del profilo): sono soldi tra conti
 *    propri, in qualunque ordine siano scritti nome e cognome;
 * 2. bonifici in uscita ripetuti (almeno RECURRING_MIN volte) verso lo STESSO IBAN:
 *    un conto proprio in un'altra banca, se l'utente non li ha mai corretti a mano.
 *
 * Funzioni pure: il repository legge i movimenti e crea le regole nel database.
 */
export const RECURRING_MIN = 3
export const OWN_NAME_CONFIDENCE = 0.95
export const RECURRING_IBAN_CONFIDENCE = 0.9

/** Parole di un nome di persona (2–4 parole di sole lettere), normalizzate. */
export function personWords(name: string | null | undefined): string[] | null {
  if (!name) return null
  const words = normalizeDescription(name)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
  if (words.length < 2 || words.length > 4) return null
  return words
}

/** Chiave che non dipende dall'ordine (es. "Fabio Rossi" = "ROSSI FABIO"). */
export function nameKey(name: string | null | undefined): string | null {
  const words = personWords(name)
  return words ? [...words].sort().join(' ') : null
}

function permutations(words: readonly string[]): string[][] {
  if (words.length <= 1) return [words.slice()]
  return words.flatMap((w, i) => permutations([...words.slice(0, i), ...words.slice(i + 1)]).map((rest) => [w, ...rest]))
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Espressione regolare sulla controparte (già normalizzata dal motore delle regole):
 * il nome in ogni ordine, eventualmente preceduto da "paypal" (es. "Paypal*rossi Mario").
 */
export function ownNamePattern(names: readonly string[]): string | null {
  const keys = [...new Set(names.map(nameKey).filter((k): k is string => k !== null))].sort()
  if (keys.length === 0) return null
  const variants = keys.flatMap((k) => permutations(k.split(' ')).map((p) => p.map(escapeRegex).join('\\s+')))
  return `^(?:paypal\\s+)?(?:${[...new Set(variants)].join('|')})$`
}

export type OutgoingTransfer = { iban: string | null; type: string; manual: boolean }

/**
 * IBAN verso cui partono bonifici ripetuti: candidati conto proprio.
 * Escluso se anche un solo movimento verso quell'IBAN è stato classificato a
 * mano come qualcosa di diverso da un giroconto (es. l'affitto).
 */
export function recurringIbans(rows: readonly OutgoingTransfer[], ownIbans: ReadonlySet<string>, min = RECURRING_MIN): string[] {
  const count = new Map<string, number>()
  const vetoed = new Set<string>()
  for (const r of rows) {
    if (!r.iban || ownIbans.has(r.iban)) continue
    count.set(r.iban, (count.get(r.iban) ?? 0) + 1)
    if (r.manual && r.type !== 'transfer' && r.type !== 'investment') vetoed.add(r.iban)
  }
  return [...count]
    .filter(([iban, n]) => n >= min && !vetoed.has(iban))
    .map(([iban]) => iban)
    .sort()
}

/** "IT60X0542811101000000123456" → "…3456": i nomi delle regole non mostrano l'IBAN intero. */
export function maskIban(iban: string): string {
  return `…${iban.slice(-4)}`
}
