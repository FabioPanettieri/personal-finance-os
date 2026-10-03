import { ZERO } from '../../money'
import { cleanDescription, detectCurrency, parseAmount, parseDate, parseDateTime, parseDecimalString } from '../../csv/values'
import type { CsvImporter, InvestmentDetails, RowOutcome, SecondaryMovement, StructuralHint } from '../types'
import { cell, detectionScore, resolveMapping, type FieldSpec } from './mapping'
import { abs, baseTransaction, invalid, skipped } from './shared'

// TODO(TradeRepublicPdfImporter): l'estratto conto reale di Trade Republic è
// un PDF. Parser non implementato per scelta: architettura e prerequisiti in
// docs/06-import-real-formats.md (estrazione posizionale in JS puro, segno dal
// saldo, riconciliazione obbligatoria). Questo importer gestisce solo il CSV.
/**
 * Trade Republic (export transazioni). Distingue:
 * - movimenti di liquidità (category CASH): versamenti, prelievi, dividendi,
 *   interessi, commissioni, imposte, pagamenti con carta;
 * - operazioni su strumenti (category TRADING): BUY/SELL e piani di accumulo.
 *   Un acquisto NON è una spesa: sposta liquidità in titoli sullo stesso conto.
 * Le colonne fee/tax generano movimenti di liquidità separati.
 *
 * Ipotesi da confermare con un export reale anonimizzato: `amount` è il
 * movimento di cassa al netto di fee e tax, riportate nelle rispettive colonne.
 */
const FIELDS: Record<string, FieldSpec> = {
  datetime: { aliases: ['datetime'], required: false },
  date: { aliases: ['date'], required: false },
  category: { aliases: ['category'], required: true },
  type: { aliases: ['type'], required: true },
  assetClass: { aliases: ['asset_class'], required: false },
  name: { aliases: ['name'], required: false },
  symbol: { aliases: ['symbol', 'isin'], required: false },
  shares: { aliases: ['shares', 'quantity'], required: false },
  price: { aliases: ['price'], required: false },
  amount: { aliases: ['amount'], required: true },
  fee: { aliases: ['fee'], required: false },
  tax: { aliases: ['tax'], required: false },
  currency: { aliases: ['currency'], required: true },
  originalAmount: { aliases: ['original_amount'], required: false },
  originalCurrency: { aliases: ['original_currency'], required: false },
  description: { aliases: ['description'], required: false },
  transactionId: { aliases: ['transaction_id'], required: true },
  counterpartyName: { aliases: ['counterparty_name'], required: false },
  counterpartyIban: { aliases: ['counterparty_iban'], required: false },
}

const DEPOSIT = new Set(['CUSTOMER_INBOUND', 'CUSTOMER_INPAYMENT', 'CUSTOMER_INBOUND_REQUEST', 'DEPOSIT'])
const WITHDRAWAL = new Set(['CUSTOMER_OUTBOUND', 'CUSTOMER_OUTBOUND_REQUEST', 'WITHDRAWAL', 'PAYOUT'])
const DIVIDEND = new Set(['DIVIDEND', 'DISTRIBUTION'])
const INTEREST = new Set(['INTEREST', 'INTEREST_PAYMENT'])
const CARD = new Set(['CARD_TRANSACTION', 'CARD_PAYMENT'])

const isSavingsPlan = (type: string) => type.includes('SAVINGS_PLAN') || type === 'SAVINGSPLAN'

function hintFor(type: string, amount: number): StructuralHint | null {
  if (type === 'BUY' || isSavingsPlan(type)) {
    return { type: 'investment', nature: 'investment', confidence: 0.99, reason: 'Acquisto di strumenti finanziari (non è una spesa)' }
  }
  if (type === 'SELL') {
    return { type: 'investment', nature: 'investment', confidence: 0.99, reason: 'Vendita di strumenti finanziari' }
  }
  if (DEPOSIT.has(type) && amount > 0) {
    return { type: 'transfer', nature: 'transfer', confidence: 0.85, reason: 'Versamento sul conto Trade Republic' }
  }
  if (WITHDRAWAL.has(type) && amount < 0) {
    return { type: 'transfer', nature: 'transfer', confidence: 0.85, reason: 'Prelievo dal conto Trade Republic' }
  }
  if (DIVIDEND.has(type) && amount > 0) {
    return { type: 'income', nature: 'investment', categoryPath: 'Interessi e dividendi', confidence: 0.95, reason: 'Dividendo' }
  }
  if (INTEREST.has(type) && amount > 0) {
    return { type: 'income', nature: 'investment', categoryPath: 'Interessi e dividendi', confidence: 0.95, reason: 'Interessi sulla liquidità' }
  }
  if (type === 'FEE') {
    return amount < 0
      ? { type: 'expense', nature: 'investment', confidence: 0.9, reason: 'Commissione Trade Republic' }
      : { type: 'refund', nature: 'investment', confidence: 0.8, reason: 'Rimborso commissione' }
  }
  if (type === 'TAX') {
    return amount < 0
      ? { type: 'expense', nature: 'investment', confidence: 0.9, reason: 'Imposta' }
      : { type: 'refund', nature: 'investment', confidence: 0.8, reason: 'Rimborso imposta' }
  }
  if (CARD.has(type)) {
    return amount < 0
      ? { type: 'expense', confidence: 0.7, reason: 'Pagamento con carta Trade Republic' }
      : { type: 'refund', confidence: 0.7, reason: 'Accredito su carta Trade Republic' }
  }
  return null
}

export const tradeRepublicImporter: CsvImporter = {
  source: 'trade_republic',
  label: 'Trade Republic',

  detect(headers) {
    return detectionScore(headers, FIELDS, ['asset_class', 'shares', 'symbol', 'transaction_id', 'account_type'])
  },

  mapColumns(headers) {
    const result = resolveMapping(headers, FIELDS)
    if (!result.ok) return result
    if (!result.mapping.date && !result.mapping.datetime) return { ok: false, missing: ['date (date / datetime)'] }
    return result
  },

  normalizeRow(raw, rowIndex, mapping, context): RowOutcome {
    const errors: string[] = []
    const warnings: string[] = []

    const type = cell(raw, mapping, 'type').toUpperCase()
    const category = cell(raw, mapping, 'category').toUpperCase()
    if (!type) errors.push('Tipo operazione mancante')

    // Data: colonna `date` (già giorno locale); altrimenti istante UTC convertito in Europe/Rome.
    const dateText = cell(raw, mapping, 'date')
    const datetimeText = cell(raw, mapping, 'datetime')
    let bookedOn = null
    let occurredAt: string | null = null
    if (datetimeText) {
      const dt = parseDateTime(datetimeText, context.timeZone)
      if (dt.ok) occurredAt = dt.value.instant
      else warnings.push(`datetime ignorato: ${dt.error}`)
      if (!dateText && dt.ok) bookedOn = dt.value.date
    }
    if (dateText) {
      const d = parseDate(dateText, ['YYYY-MM-DD'])
      if (d.ok) bookedOn = d.value
      else errors.push(d.error)
    }
    if (!bookedOn && errors.length === 0) errors.push('Data mancante')

    const amount = parseAmount(cell(raw, mapping, 'amount'), '.')
    if (!amount.ok) errors.push(amount.error)
    else if (amount.warning) warnings.push(amount.warning)

    const parseCost = (field: 'fee' | 'tax') => {
      const text = cell(raw, mapping, field)
      if (!text) return ZERO
      const parsed = parseAmount(text, '.')
      if (!parsed.ok) {
        errors.push(parsed.error)
        return ZERO
      }
      return abs(parsed.value)
    }
    const fee = parseCost('fee')
    const tax = parseCost('tax')

    const currency = detectCurrency(cell(raw, mapping, 'currency'), context.accountCurrency)
    if (!currency.ok) errors.push(currency.error)

    const transactionId = cell(raw, mapping, 'transactionId')
    if (!transactionId) warnings.push('transaction_id assente: deduplicazione tramite fingerprint')

    if (errors.length > 0 || !bookedOn || !amount.ok || !currency.ok) return invalid(rowIndex, raw, errors)

    if (currency.value !== context.accountCurrency) {
      return skipped(rowIndex, raw, `Valuta ${currency.value} diversa da quella del conto (${context.accountCurrency})`)
    }
    if (amount.value === 0 && fee === 0 && tax === 0) {
      return skipped(rowIndex, raw, 'Importo zero: nessun movimento di liquidità')
    }

    const isTrade = category === 'TRADING' || type === 'BUY' || type === 'SELL' || isSavingsPlan(type)
    const name = cell(raw, mapping, 'name') || null
    const symbol = cell(raw, mapping, 'symbol').toUpperCase() || null
    const originalDescription = cell(raw, mapping, 'description') || [type, name].filter(Boolean).join(' ')
    const description = cleanDescription(name && isTrade ? `${originalDescription} · ${name}` : originalDescription)

    let investment: InvestmentDetails | null = null
    if (isTrade || DIVIDEND.has(type)) {
      const shares = parseDecimalString(cell(raw, mapping, 'shares'))
      const price = parseDecimalString(cell(raw, mapping, 'price'))
      if (shares && !shares.ok) return invalid(rowIndex, raw, [shares.error])
      if (price && !price.ok) return invalid(rowIndex, raw, [price.error])
      const kind = DIVIDEND.has(type) ? 'dividend' : type === 'SELL' ? 'sell' : 'buy'
      if ((kind === 'buy' || kind === 'sell') && (!symbol || !shares)) {
        return invalid(rowIndex, raw, ['Operazione su titoli senza ISIN o quantità'])
      }
      if (kind === 'buy' && amount.value > 0) return invalid(rowIndex, raw, ['Acquisto con importo positivo'])
      if (kind === 'sell' && amount.value < 0) return invalid(rowIndex, raw, ['Vendita con importo negativo'])
      investment = {
        kind,
        isin: symbol && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(symbol) ? symbol : null,
        name,
        assetClass: cell(raw, mapping, 'assetClass') || null,
        quantity: shares?.ok ? shares.value : null,
        price: price?.ok ? price.value : null,
        savingsPlan: isSavingsPlan(type) || /piano di accumulo|savings plan|\bpac\b/i.test(originalDescription),
      }
      if (symbol && !investment.isin) warnings.push(`Simbolo "${symbol}" non è un ISIN valido`)
    }

    const secondary: SecondaryMovement[] = []
    if (fee > 0) secondary.push({ part: 'fee', amount: -fee as typeof fee, description: `Commissione Trade Republic · ${description}` })
    if (tax > 0) secondary.push({ part: 'tax', amount: -tax as typeof tax, description: `Imposte Trade Republic · ${description}` })

    const originalAmountText = cell(raw, mapping, 'originalAmount')
    const originalAmount = originalAmountText ? parseAmount(originalAmountText, '.') : null
    const originalCurrency = cell(raw, mapping, 'originalCurrency').toUpperCase() || null

    return {
      kind: 'ok',
      transaction: baseTransaction({
        source: 'trade_republic',
        rowIndex,
        bookedOn,
        occurredAt,
        description,
        originalDescription,
        amount: amount.value,
        currency: currency.value,
        originalAmount: originalAmount?.ok && originalCurrency ? originalAmount.value : null,
        originalCurrency: originalAmount?.ok && originalCurrency ? originalCurrency : null,
        externalId: transactionId || null,
        sourceType: type,
        counterparty: cell(raw, mapping, 'counterpartyName') || null,
        counterpartyIban: cell(raw, mapping, 'counterpartyIban') || null,
        fee,
        tax,
        movement: isTrade ? 'trade' : 'cash',
        investment,
        secondary,
        hint: hintFor(type, amount.value),
        warnings,
        raw,
      }),
    }
  },
}
