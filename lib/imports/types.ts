/**
 * Modello normalizzato comune a tutti gli importer (docs/00-architecture.md §7.1).
 * Ogni fonte (ING, Revolut, Trade Republic…) produce questa stessa struttura;
 * il resto della pipeline non conosce più il formato originale.
 */
import type { Cents } from '../money'
import type { IsoDate } from '../dates'

export type ImportSource = 'ing' | 'revolut' | 'trade_republic'

export type TransactionType = 'income' | 'expense' | 'transfer' | 'investment' | 'refund'
export type TransactionNature = 'personal' | 'business' | 'investment' | 'transfer'

/** Classificazione suggerita dalla struttura del file (es. tipo Revolut TOPUP). */
export type StructuralHint = {
  type: TransactionType | null
  nature?: TransactionNature
  /** Categoria per percorso "Macro > Sotto", risolta per utente. */
  categoryPath?: string
  confidence: number
  reason: string
}

export type InvestmentDetails = {
  kind: 'buy' | 'sell' | 'dividend' | 'interest'
  isin: string | null
  name: string | null
  assetClass: string | null
  /** numeric come stringa: mai float. */
  quantity: string | null
  price: string | null
  /** Esecuzione di un piano di accumulo (PAC). */
  savingsPlan: boolean
}

/** Movimento di liquidità aggiuntivo generato dalla stessa riga (commissione, imposta). */
export type SecondaryMovement = {
  part: 'fee' | 'tax'
  amount: Cents
  description: string
}

export type NormalizedTransaction = {
  source: ImportSource
  /** Indice della riga dati nel file (0 = prima riga dopo l'intestazione). */
  rowIndex: number
  bookedOn: IsoDate
  valueOn: IsoDate | null
  /** Istante originale se la fonte lo fornisce (ISO 8601, UTC). */
  occurredAt: string | null
  description: string
  /** Testo esatto della banca, mai modificato. */
  originalDescription: string
  /** Importo firmato sul conto, centesimi. */
  amount: Cents
  currency: string
  originalAmount: Cents | null
  originalCurrency: string | null
  /** Identificativo stabile fornito dalla fonte (es. transaction_id di Trade Republic). */
  externalId: string | null
  /** Tipo grezzo della fonte (es. CARD_PAYMENT, CUSTOMER_INBOUND). */
  sourceType: string | null
  counterparty: string | null
  counterpartyIban: string | null
  /** Commissioni e imposte della riga, in valore assoluto. */
  fee: Cents
  tax: Cents
  /** cash = movimento di liquidità; trade = operazione su strumenti (non è una spesa). */
  movement: 'cash' | 'trade'
  investment: InvestmentDetails | null
  secondary: SecondaryMovement[]
  hint: StructuralHint | null
  /** Saldo riportato dalla banca: solo informativo, mai usato per i saldi dell'app. */
  reportedBalance: Cents | null
  warnings: string[]
  /** Riga originale, intestazione → valore. */
  raw: Record<string, string>
}

export type RowOutcome =
  | { kind: 'ok'; transaction: NormalizedTransaction }
  | { kind: 'skipped'; rowIndex: number; reason: string; raw: Record<string, string> }
  | { kind: 'invalid'; rowIndex: number; errors: string[]; raw: Record<string, string> }

export type ColumnMapping = Record<string, string>

export type MappingResult = { ok: true; mapping: ColumnMapping } | { ok: false; missing: string[] }

export type ImporterContext = {
  /** Valuta del conto di destinazione: righe in altre valute non vi appartengono. */
  accountCurrency: string
  timeZone: string
}

/** Interfaccia comune degli importer specifici per fonte. */
export interface CsvImporter {
  readonly source: ImportSource
  readonly label: string
  /** Punteggio 0–1: quanto l'intestazione assomiglia al formato di questa fonte. */
  detect(headers: readonly string[]): number
  /** Associa i campi logici alle colonne del file. */
  mapColumns(headers: readonly string[]): MappingResult
  /** Trasforma una riga originale nel modello normalizzato. Funzione pura. */
  normalizeRow(raw: Record<string, string>, rowIndex: number, mapping: ColumnMapping, context: ImporterContext): RowOutcome
}
