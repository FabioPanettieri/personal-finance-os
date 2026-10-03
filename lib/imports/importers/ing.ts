import { cents, type Cents } from '../../money'
import { cleanDescription, parseAmount, parseDate } from '../../csv/values'
import type { CsvImporter, RowOutcome } from '../types'
import { cell, detectionScore, resolveMapping, type FieldSpec } from './mapping'
import { baseTransaction, invalid, skipped } from './shared'

/**
 * ING Direct (Italia). Formati supportati:
 * - importo unico firmato (`Importo`), oppure colonne separate Entrate/Uscite;
 * - date DD/MM/YYYY (anche YYYY-MM-DD);
 * - importi "1.650,00" o "1650.00".
 * Il saldo eventualmente presente è conservato come informazione, mai usato
 * per calcolare i saldi dell'app (che derivano dalle transazioni).
 * La classificazione NON avviene qui: spetta al motore di regole.
 */
const FIELDS: Record<string, FieldSpec> = {
  date: { aliases: ['Data', 'Data contabile', 'Data operazione', 'Data registrazione', 'Booking date'], required: true },
  valueDate: { aliases: ['Data valuta', 'Value date'], required: false },
  description: {
    aliases: ['Descrizione', 'Descrizione operazione', 'Causale', 'Dettagli', 'Description'],
    required: true,
  },
  amount: { aliases: ['Importo', 'Importo (EUR)', 'Importo EUR', 'Amount'], required: false },
  credit: { aliases: ['Entrate', 'Accrediti', 'Avere'], required: false },
  debit: { aliases: ['Uscite', 'Addebiti', 'Dare'], required: false },
  balance: { aliases: ['Saldo', 'Saldo contabile', 'Balance'], required: false },
}

const DATE_FORMATS = ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD-MM-YYYY'] as const

export const ingImporter: CsvImporter = {
  source: 'ing',
  label: 'ING Direct',

  detect(headers) {
    // Senza colonne tipiche di Revolut/Trade Republic: ING è il formato "semplice" italiano.
    const lower = headers.map((h) => h.toLowerCase())
    if (lower.includes('transaction_id') || lower.includes('completed date') || lower.includes('product')) return 0.1
    const score = detectionScore(headers, FIELDS, ['Data valuta', 'Saldo', 'Descrizione operazione', 'Causale'])
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
        reportedBalance: balance?.ok ? balance.value : null,
        warnings,
        raw,
      }),
    }
  },
}
