import { cents, type Cents } from '../../money'
import { cleanDescription, parseAmount, parseDate } from '../../csv/values'
import type { CsvImporter, RowOutcome } from '../types'
import { cell, detectionScore, resolveMapping, type FieldSpec } from './mapping'
import { baseTransaction, invalid, normalizeIban, skipped } from './shared'

/**
 * ING Direct (Italia). Formati supportati:
 * - importo unico firmato (`Importo`), oppure colonne separate Entrate/Uscite;
 * - date DD/MM/YYYY (anche YYYY-MM-DD);
 * - importi "1.650,00" o "1650.00" (anche con segno esplicito "+1.672,00");
 * - export reale: `;`, CRLF, NUL di riempimento in coda (gestiti dal decoder),
 *   colonne DATA CONTABILE/DATA VALUTA/USCITE/ENTRATE/CAUSALE/DESCRIZIONE OPERAZIONE.
 * Le righe "Saldo iniziale"/"Saldo finale" sono informative: mai transazioni,
 * servono solo a riconciliare il file (saldo iniziale + movimenti = finale).
 * La CAUSALE della banca diventa sourceType: le regole del database possono
 * usarla (es. "Addebito Carta Di Credito" → Carta di credito).
 * Controparte e IBAN della controparte sono estratti dalla descrizione.
 * Il saldo eventualmente presente è conservato come informazione, mai usato
 * per calcolare i saldi dell'app (che derivano dalle transazioni).
 * La classificazione NON avviene qui: spetta al motore di regole.
 */
const FIELDS: Record<string, FieldSpec> = {
  date: { aliases: ['Data', 'Data contabile', 'Data operazione', 'Data registrazione', 'Booking date'], required: true },
  valueDate: { aliases: ['Data valuta', 'Value date'], required: false },
  description: {
    aliases: ['Descrizione', 'Descrizione operazione', 'Dettagli', 'Description', 'Causale'],
    required: true,
  },
  causale: { aliases: ['Causale', 'Tipo operazione'], required: false },
  amount: { aliases: ['Importo', 'Importo (EUR)', 'Importo EUR', 'Amount'], required: false },
  credit: { aliases: ['Entrate', 'Accrediti', 'Avere'], required: false },
  debit: { aliases: ['Uscite', 'Addebiti', 'Dare'], required: false },
  balance: { aliases: ['Saldo', 'Saldo contabile', 'Balance'], required: false },
}

const DATE_FORMATS = ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD-MM-YYYY'] as const

const BALANCE_MARKER = /^saldo\s+(iniziale|finale|contabile\s+(?:iniziale|finale))\b/i

const IBAN = '([A-Z]{2}[0-9]{2}[A-Z0-9]{11,30})'

/** Controparte e IBAN dalle descrizioni ING (bonifici in uscita, giroconti, accrediti). */
export function ingCounterparty(description: string): { name: string | null; iban: string | null } {
  const text = description.replace(/\s+/g, ' ').trim()
  const iban =
    new RegExp(`(?:IBAN beneficiario|Codifica Ordinante|IBAN ordinante)\\s+${IBAN}`, 'i').exec(text)?.[1] ?? null
  const name =
    /A favore di (.+?)\s+(?:IBAN beneficiario|BIC|Note:|$)/i.exec(text)?.[1] ??
    /Anagrafica Ordinante (.+?)(?:\s+Note:|\s+Codifica|$)/i.exec(text)?.[1] ??
    null
  return { name: name ? name.trim().slice(0, 200) : null, iban: normalizeIban(iban) }
}

export const ingImporter: CsvImporter = {
  source: 'ing',
  label: 'ING Direct',

  detect(headers) {
    // Senza colonne tipiche di Revolut/Trade Republic: ING è il formato "semplice" italiano.
    const lower = headers.map((h) => h.toLowerCase())
    if (lower.includes('transaction_id') || lower.includes('completed date') || lower.includes('product')) return 0.1
    const score = detectionScore(headers, FIELDS, ['Data valuta', 'Saldo', 'Descrizione operazione', 'Causale', 'Data contabile'])
    const hasAmount = ['importo', 'importo (eur)', 'entrate', 'uscite', 'accrediti', 'addebiti'].some((h) => lower.includes(h))
    return hasAmount ? score : score * 0.5
  },

  mapColumns(headers) {
    const result = resolveMapping(headers, FIELDS)
    if (!result.ok) return result
    if (!result.mapping.amount && !(result.mapping.credit || result.mapping.debit)) {
      return { ok: false, missing: ['amount (Importo / Entrate + Uscite)'] }
    }
    return result
  },

  normalizeRow(raw, rowIndex, mapping, context): RowOutcome {
    const errors: string[] = []
    const warnings: string[] = []

    const date = parseDate(cell(raw, mapping, 'date'), DATE_FORMATS)
    const causale = mapping.causale && mapping.causale !== mapping.description ? cell(raw, mapping, 'causale') : ''
    const marker = BALANCE_MARKER.exec(cell(raw, mapping, 'description'))
    if (marker && !causale) {
      const kind = marker[1]!.toLowerCase().endsWith('iniziale') ? 'opening' : 'closing'
      const amountText = cell(raw, mapping, 'amount') || cell(raw, mapping, 'credit') || cell(raw, mapping, 'debit')
      const amount = amountText ? parseAmount(amountText, ',') : null
      const label = kind === 'opening' ? 'Saldo iniziale' : 'Saldo finale'
      const reason = `${label} dichiarato dalla banca: riga informativa, non è un movimento`
      return date.ok && amount?.ok
        ? skipped(rowIndex, raw, reason, { kind, date: date.value, amount: amount.value })
        : skipped(rowIndex, raw, reason)
    }

    if (!date.ok) errors.push(date.error)
    const valueDateText = cell(raw, mapping, 'valueDate')
    const valueDate = valueDateText ? parseDate(valueDateText, DATE_FORMATS) : null
    if (valueDate && !valueDate.ok) warnings.push(`Data valuta ignorata: ${valueDate.error}`)

    const originalDescription = cell(raw, mapping, 'description')
    if (!originalDescription) errors.push('Descrizione mancante')

    let amount: Cents | null = null
    if (mapping.amount) {
      const parsed = parseAmount(cell(raw, mapping, 'amount'), ',')
      if (parsed.ok) {
        amount = parsed.value
        if (parsed.warning) warnings.push(parsed.warning)
      } else errors.push(parsed.error)
    } else {
      const creditText = cell(raw, mapping, 'credit')
      const debitText = cell(raw, mapping, 'debit')
      const credit = creditText ? parseAmount(creditText, ',') : null
      const debit = debitText ? parseAmount(debitText, ',') : null
      if (credit && !credit.ok) errors.push(credit.error)
      if (debit && !debit.ok) errors.push(debit.error)
      const creditValue = credit?.ok ? Math.abs(credit.value) : 0
      const debitValue = debit?.ok ? Math.abs(debit.value) : 0
      if (!credit && !debit) errors.push('Importo mancante (Entrate/Uscite vuote)')
      else amount = cents(creditValue - debitValue)
    }

    const balanceText = cell(raw, mapping, 'balance')
    const balance = balanceText ? parseAmount(balanceText, ',') : null

    if (errors.length > 0 || !date.ok || amount === null) return invalid(rowIndex, raw, errors)
    if (amount === 0) return skipped(rowIndex, raw, 'Importo zero: nessun movimento da registrare')

    const party = ingCounterparty(originalDescription)
    return {
      kind: 'ok',
      transaction: baseTransaction({
        source: 'ing',
        rowIndex,
        bookedOn: date.value,
        valueOn: valueDate?.ok ? valueDate.value : null,
        description: cleanDescription(originalDescription),
        originalDescription,
        amount,
        currency: context.accountCurrency,
        sourceType: causale || null,
        counterparty: party.name,
        counterpartyIban: party.iban,
        reportedBalance: balance?.ok ? balance.value : null,
        warnings,
        raw,
      }),
    }
  },
}
