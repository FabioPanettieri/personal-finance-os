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
 * - stati e tipi in inglese o italiano (COMPLETATO, Pagamento con carta, Ricarica…);
 * - data della transazione = data di completamento; la data di inizio resta nel dato grezzo;
 * - Ricarica/TOPUP non è mai un trasferimento automatico (può essere un incasso da terzi);
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

/** Stati Revolut (export inglese e italiano) → forma canonica. */
const STATES: Record<string, string> = {
  COMPLETED: 'COMPLETED',
  COMPLETATO: 'COMPLETED',
  COMPLETATA: 'COMPLETED',
  REVERTED: 'REVERTED',
  STORNATO: 'REVERTED',
  STORNATA: 'REVERTED',
  ANNULLATO: 'REVERTED',
  ANNULLATA: 'REVERTED',
  DECLINED: 'DECLINED',
  RIFIUTATO: 'DECLINED',
  RIFIUTATA: 'DECLINED',
  FAILED: 'FAILED',
  'NON RIUSCITO': 'FAILED',
  'NON RIUSCITA': 'FAILED',
  FALLITO: 'FAILED',
  PENDING: 'PENDING',
  'IN SOSPESO': 'PENDING',
  'IN ATTESA': 'PENDING',
  'IN CORSO': 'PENDING',
}

const EXCLUDED_STATES: Record<string, string> = {
  REVERTED: 'Operazione stornata da Revolut',
  DECLINED: 'Operazione rifiutata',
  FAILED: 'Operazione non riuscita',
  PENDING: 'Operazione in sospeso: verrà importata quando risulterà completata',
}

/** Prodotto del conto corrente: "Current" nell'export inglese, "Attuale" in quello italiano. */
const CURRENT_PRODUCTS = new Set(['current', 'attuale', 'corrente', 'conto corrente', ''])

/** Tipi Revolut (export inglese e italiano) → forma canonica. */
const TYPES: Record<string, string> = {
  'PAGAMENTO CON CARTA': 'CARD_PAYMENT',
  'RIMBORSO CARTA': 'CARD_REFUND',
  'RIMBORSO SU CARTA': 'CARD_REFUND',
  RIMBORSO: 'REFUND',
  RICARICA: 'TOPUP',
  'TOP-UP': 'TOPUP',
  PAGAMENTO: 'TRANSFER',
  TRASFERIMENTO: 'TRANSFER',
  BONIFICO: 'TRANSFER',
  CAMBIO: 'EXCHANGE',
  'CAMBIO VALUTA': 'EXCHANGE',
  COMMISSIONE: 'FEE',
  COMMISSIONI: 'FEE',
  INTERESSI: 'INTEREST',
  PRELIEVO: 'ATM',
  'PRELIEVO CONTANTI': 'ATM',
  PREMIO: 'REWARD',
}

export function canonicalRevolutType(raw: string): string | null {
  const upper = raw.trim().toUpperCase()
  if (!upper) return null
  return TYPES[upper] ?? upper.replace(/\s+/g, '_')
}

/** Significato strutturale dei tipi Revolut. type null = da decidere con regole o revisione. */
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
      // Una ricarica può arrivare da un tuo conto (trasferimento) o da terzi
      // (Etsy, Stripe, privati…): mai un trasferimento automatico. Decidono le
      // regole, l'abbinamento con l'altro conto o l'utente.
      return { type: null, confidence: 0, reason: 'Ricarica: da un tuo conto (trasferimento) o incasso da terzi? Da verificare' }
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
      // TRANSFER/Pagamento, ATM, CARD_CREDIT e tipi sconosciuti: il segno non basta a decidere.
      return null
  }
}

/** Controparte dalle descrizioni tipiche ("Pagamento da X", "To X", "A favore di X"). */
export function revolutCounterparty(description: string): string | null {
  const match = /^(?:pagamento da parte di|pagamento da|pagamento a favore di|pagamento a|a favore di|da parte di|trasferimento (?:da|a)|to|from|payment from|transfer (?:to|from))\s+(.+)$/i.exec(
    description.trim(),
  )
  return match ? match[1]!.trim().slice(0, 200) : null
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
    // Export completo, in inglese o in italiano: coppia data di inizio/completamento + Prodotto/Stato.
    const full =
      (lower.includes('completed date') || lower.includes('data di completamento')) &&
      (lower.includes('started date') || lower.includes('data di inizio')) &&
      (lower.includes('product') || lower.includes('prodotto') || lower.includes('state') || lower.includes('stato'))
    if (full) return Math.max(base, 0.95)
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
    const stateText = cell(raw, mapping, 'state').toUpperCase().replace(/\s+/g, ' ')
    const state = stateText ? (STATES[stateText] ?? null) : 'COMPLETED'
    if (state && EXCLUDED_STATES[state]) return skipped(rowIndex, raw, `${EXCLUDED_STATES[state]} (${stateText})`)

    const product = cell(raw, mapping, 'product')
    if (mapping.product && !CURRENT_PRODUCTS.has(product.toLowerCase())) {
      return skipped(rowIndex, raw, `Riga del prodotto "${product}", non del conto corrente: va importata nel conto corrispondente`)
    }

    const errors: string[] = []
    const warnings: string[] = []
    if (state === null) warnings.push(`Stato Revolut non riconosciuto: "${stateText}"`)

    // Data della transazione = data di completamento (contabilizzazione); la data
    // di inizio resta nella riga originale.
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

    const type = canonicalRevolutType(cell(raw, mapping, 'type'))
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
        sourceType: cell(raw, mapping, 'type') || null,
        counterparty: revolutCounterparty(description),
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
