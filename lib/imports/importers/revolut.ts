import { ZERO } from '../../money'
import { cleanDescription, detectCurrency, parseAmount, parseDateTime } from '../../csv/values'
import type { CsvImporter, RowOutcome, SecondaryMovement, StructuralHint } from '../types'
import { cell, detectionScore, resolveMapping, type FieldSpec } from './mapping'
import { abs, baseTransaction, invalid, skipped } from './shared'

/**
 * Revolut. Gestisce sia l'export completo (Type, Product, Started/Completed
 * Date, Description, Amount, Fee, Currency, State, Balance) sia varianti
 * ridotte (Date, Description, Amount), con intestazioni in inglese o italiano.
 *
 * Regole strutturali (non parole chiave):
 * - State REVERTED/DECLINED/FAILED: escluse; PENDING: escluse finché non completate
 *   (eviterebbe duplicati quando la stessa operazione torna completata);
 * - Product diverso dal conto corrente (es. Savings): escluse, sono un altro conto;
 * - valuta diversa da quella del conto: escluse (appartengono a un'altra tasca);
 * - Fee: movimento di commissione separato, così il saldo resta corretto.
 */
const FIELDS: Record<string, FieldSpec> = {
  completedDate: { aliases: ['Completed Date', 'Data di completamento', 'Data completamento'], required: false },
  startedDate: { aliases: ['Started Date', 'Data di inizio', 'Data inizio'], required: false },
  date: { aliases: ['Date', 'Data'], required: false },
  description: { aliases: ['Description', 'Descrizione'], required: true },
  amount: { aliases: ['Amount', 'Importo'], required: true },
  fee: { aliases: ['Fee', 'Costo', 'Commissione', 'Commissioni'], required: false },
  currency: { aliases: ['Currency', 'Valuta'], required: false },
  type: { aliases: ['Type', 'Tipo'], required: false },
  state: { aliases: ['State', 'Stato'], required: false },
  product: { aliases: ['Product', 'Prodotto'], required: false },
  balance: { aliases: ['Balance', 'Saldo'], required: false },
}

const EXCLUDED_STATES: Record<string, string> = {
  REVERTED: 'Operazione stornata da Revolut (REVERTED)',
  DECLINED: 'Operazione rifiutata (DECLINED)',
  FAILED: 'Operazione non riuscita (FAILED)',
  PENDING: 'Operazione in sospeso: verrà importata quando risulterà completata',
}

const CURRENT_PRODUCTS = new Set(['current', 'corrente', 'conto corrente', ''])

/** Significato strutturale dei tipi Revolut. null = da decidere con regole o revisione. */
function hintFor(type: string, amount: number): StructuralHint | null {
  switch (type) {
    case 'CARD_PAYMENT':
      return amount < 0
        ? { type: 'expense', confidence: 0.7, reason: 'Pagamento con carta' }
        : { type: 'refund', confidence: 0.7, reason: 'Accredito su pagamento con carta' }
    case 'CARD_REFUND':
    case 'REFUND':
      return amount > 0 ? { type: 'refund', confidence: 0.9, reason: 'Rimborso Revolut' } : null
    case 'TOPUP':
      return { type: 'transfer', nature: 'transfer', confidence: 0.8, reason: 'Ricarica del conto (top-up)' }
    case 'EXCHANGE':
      return {
        type: 'transfer',
        nature: 'transfer',
        confidence: 0.6,
        reason: 'Cambio valuta verso/da un’altra tasca Revolut',
      }
    case 'FEE':
      return amount < 0 ? { type: 'expense', confidence: 0.9, reason: 'Commissione Revolut' } : null
    case 'INTEREST':
      return amount > 0
        ? { type: 'income', categoryPath: 'Interessi e dividendi', confidence: 0.9, reason: 'Interessi Revolut' }
        : null
    case 'CASHBACK':
    case 'REWARD':
      return amount > 0 ? { type: 'refund', confidence: 0.6, reason: 'Cashback/premio Revolut' } : null
    default:
      // TRANSFER, ATM e tipi sconosciuti: il segno non basta a decidere.
      return null
  }
}

export const revolutImporter: CsvImporter = {
  source: 'revolut',
  label: 'Revolut',

  detect(headers) {
    const lower = headers.map((h) => h.toLowerCase())
    if (lower.includes('transaction_id')) return 0.1
    const hasDate = ['completed date', 'started date', 'date', 'data di completamento', 'data di inizio'].some((h) =>
      lower.includes(h),
    )
    const base = detectionScore(headers, FIELDS, ['Completed Date', 'Started Date', 'Product', 'State', 'Fee', 'Type'])
    // Le intestazioni inglesi "Date/Description/Amount" senza Saldo/Data valuta indicano Revolut.
    const english = ['description', 'amount'].every((h) => lower.includes(h))
    return hasDate ? (english ? Math.max(base, 0.7) : base * 0.8) : base * 0.3
  },

  mapColumns(headers) {
    const result = resolveMapping(headers, FIELDS)
    if (!result.ok) return result
    if (!result.mapping.completedDate && !result.mapping.startedDate && !result.mapping.date) {
      return { ok: false, missing: ['date (Completed Date / Started Date / Date)'] }
    }
    return result
  },

  normalizeRow(raw, rowIndex, mapping, context): RowOutcome {
    const state = cell(raw, mapping, 'state').toUpperCase()
    if (state && EXCLUDED_STATES[state]) return skipped(rowIndex, raw, EXCLUDED_STATES[state])

    const product = cell(raw, mapping, 'product')
    if (mapping.product && !CURRENT_PRODUCTS.has(product.toLowerCase())) {
      return skipped(rowIndex, raw, `Riga del prodotto "${product}", non del conto corrente: va importata nel conto corrispondente`)
    }

    const errors: string[] = []
    const warnings: string[] = []

    const dateText = cell(raw, mapping, 'completedDate') || cell(raw, mapping, 'startedDate') || cell(raw, mapping, 'date')
    const date = parseDateTime(dateText, context.timeZone)
    if (!date.ok) errors.push(date.error)

    const originalDescription = cell(raw, mapping, 'description')
    if (!originalDescription) errors.push('Descrizione mancante')

    const amount = parseAmount(cell(raw, mapping, 'amount'), '.')
    if (!amount.ok) errors.push(amount.error)
    else if (amount.warning) warnings.push(amount.warning)

    const feeText = cell(raw, mapping, 'fee')
    const fee = feeText ? parseAmount(feeText, '.') : null
    if (fee && !fee.ok) errors.push(fee.error)

    const currency = detectCurrency(cell(raw, mapping, 'currency'), context.accountCurrency)
    if (!currency.ok) errors.push(currency.error)

    const balanceText = cell(raw, mapping, 'balance')
    const balance = balanceText ? parseAmount(balanceText, '.') : null

    if (errors.length > 0 || !date.ok || !amount.ok || !currency.ok) return invalid(rowIndex, raw, errors)

    if (currency.value !== context.accountCurrency) {
      return skipped(
        rowIndex,
        raw,
        `Valuta ${currency.value} diversa da quella del conto (${context.accountCurrency}): appartiene a un’altra tasca Revolut`,
      )
    }

    const feeValue = fee?.ok ? abs(fee.value) : ZERO
    const description = cleanDescription(originalDescription)
    if (amount.value === 0 && feeValue === 0) return skipped(rowIndex, raw, 'Importo zero: nessun movimento da registrare')

    const secondary: SecondaryMovement[] =
      feeValue > 0 ? [{ part: 'fee', amount: -feeValue as typeof feeValue, description: `Commissione Revolut · ${description}` }] : []
    if (amount.value === 0) {
      return skipped(rowIndex, raw, 'Riga con sola commissione e importo zero: non supportata, verificare manualmente')
    }

    const type = cell(raw, mapping, 'type').toUpperCase() || null
    if (date.value.instant === null && mapping.completedDate && !cell(raw, mapping, 'completedDate')) {
      warnings.push('Data di completamento assente: usata la data di inizio')
    }

    return {
      kind: 'ok',
      transaction: baseTransaction({
        source: 'revolut',
        rowIndex,
        bookedOn: date.value.date,
        occurredAt: date.value.instant,
        description,
        originalDescription,
        amount: amount.value,
        currency: currency.value,
        sourceType: type,
        fee: feeValue,
        secondary,
        hint: type ? hintFor(type, amount.value) : null,
        reportedBalance: balance?.ok ? balance.value : null,
        warnings,
        raw,
      }),
    }
  },
}
