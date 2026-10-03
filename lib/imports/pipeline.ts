/**
 * Pipeline di importazione (pura, nessun accesso al database):
 *
 *   File validation → Source detection → CSV parsing → Column mapping →
 *   Normalization → Duplicate detection → Classification → Transfer detection → Preview
 *
 * Le fasi che richiedono dati esistenti (fingerprint già importati,
 * controparti dei trasferimenti, regole dell'utente) li ricevono come input:
 * il servizio server li legge dal database con RLS e li passa qui.
 */
import { classify, type Classification, type Lookups } from '../categorization/engine'
import type { Rule } from '../categorization/rules'
import { CsvFileError, decodeBytes, looksBinary, type TextEncodingName } from '../csv/decode'
import { parseCsv, type CsvDelimiter } from '../csv/parse'
import type { AccountKind } from '../accounts'
import { compareIsoDates, type IsoDate } from '../dates'
import { detectDuplicates, type DuplicateStatus, type ExistingTransaction } from './duplicates'
import { assignOccurrences, fingerprintFor } from './fingerprint'
import { detectSource, IMPORTERS } from './importers'
import { detectTransfers, type Counterpart } from '../transfers/detect'
import { formatCentsPlain } from './format'
import type { BalanceMarker, ColumnMapping, ImportSource, NormalizedTransaction, RowOutcome } from './types'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.csv', '.txt']
const ALLOWED_MIME = ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv', 'text/x-csv', '']

export type UploadedFile = { name: string; size: number; type: string; bytes: Uint8Array }

/** Fase 1 — validazione del file prima di leggerne il contenuto. */
export function validateFile(file: UploadedFile): string[] {
  const errors: string[] = []
  const lowerName = file.name.toLowerCase()
  if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) errors.push('Il file deve avere estensione .csv')
  if (!ALLOWED_MIME.includes(file.type)) errors.push(`Tipo di file non ammesso (${file.type})`)
  if (file.size === 0 || file.bytes.length === 0) errors.push('Il file è vuoto')
  if (file.size > MAX_FILE_BYTES || file.bytes.length > MAX_FILE_BYTES) errors.push('Il file supera 10 MB')
  if (errors.length === 0 && looksBinary(file.bytes)) errors.push('Il file non è un CSV di testo (contenuto binario)')
  return errors
}

export type Analysis = {
  source: ImportSource
  encoding: TextEncodingName
  delimiter: CsvDelimiter
  headers: string[]
  mapping: ColumnMapping
  outcomes: RowOutcome[]
  reconciliation: Reconciliation | null
}

/** Verifica saldo iniziale + movimenti = saldo finale (solo se la banca dichiara entrambi). */
export type Reconciliation = {
  opening: BalanceMarker
  closing: BalanceMarker
  movementsCents: number
  expectedClosingCents: number
  ok: boolean
  message: string
}

export function reconcile(outcomes: readonly RowOutcome[]): Reconciliation | null {
  const markers = outcomes.flatMap((o) => (o.kind === 'skipped' && o.balance ? [o.balance] : []))
  const opening = markers.find((m) => m.kind === 'opening')
  const closing = [...markers].reverse().find((m) => m.kind === 'closing')
  if (!opening || !closing) return null
  let movementsCents = 0
  for (const o of outcomes) {
    if (o.kind !== 'ok') continue
    movementsCents += o.transaction.amount
    for (const part of o.transaction.secondary) movementsCents += part.amount
  }
  const expectedClosingCents = opening.amount + movementsCents
  const ok = expectedClosingCents === closing.amount
  const text = `saldo iniziale ${formatCentsPlain(opening.amount)} + movimenti ${formatCentsPlain(movementsCents)} = ${formatCentsPlain(expectedClosingCents)}`
  return {
    opening,
    closing,
    movementsCents,
    expectedClosingCents,
    ok,
    message: ok
      ? `Riconciliazione riuscita: ${text}, uguale al saldo finale della banca`
      : `Riconciliazione NON riuscita: ${text}, ma la banca dichiara ${formatCentsPlain(closing.amount)}. Mancano o sono di troppo dei movimenti: verifica il file`,
  }
}

export type AnalysisResult = { ok: true; analysis: Analysis } | { ok: false; errors: string[] }

const SOURCE_LABEL: Record<ImportSource, string> = { ing: 'ING', revolut: 'Revolut', trade_republic: 'Trade Republic' }

/** Fasi 2–5 — decodifica, riconoscimento fonte, parsing, mapping, normalizzazione. */
export function analyzeCsv(
  bytes: Uint8Array,
  selected: ImportSource,
  context: { accountCurrency: string; timeZone: string },
): AnalysisResult {
  try {
    const decoded = decodeBytes(bytes)
    const parsed = parseCsv(decoded.text)

    const detection = detectSource(parsed.headers)
    const selectedScore = detection.scores[selected]
    if (detection.best !== selected && detection.scores[detection.best] >= 0.6 && detection.scores[detection.best] > selectedScore) {
      return {
        ok: false,
        errors: [`Il file sembra un export ${SOURCE_LABEL[detection.best]}, non ${SOURCE_LABEL[selected]}. Scegli la banca corretta.`],
      }
    }

    const importer = IMPORTERS[selected]
    const mapping = importer.mapColumns(parsed.headers)
    if (!mapping.ok) {
      return { ok: false, errors: [`Colonne obbligatorie mancanti per ${importer.label}: ${mapping.missing.join(', ')}`] }
    }
    if (parsed.rows.length === 0) return { ok: false, errors: ['Il file non contiene movimenti'] }

    const outcomes = parsed.rows.map((raw, index) => importer.normalizeRow(raw, index, mapping.mapping, context))
    return {
      ok: true,
      analysis: {
        source: selected,
        encoding: decoded.encoding,
        delimiter: parsed.delimiter,
        headers: parsed.headers,
        mapping: mapping.mapping,
        outcomes,
        reconciliation: reconcile(outcomes),
      },
    }
  } catch (error) {
    if (error instanceof CsvFileError) return { ok: false, errors: [error.message] }
    throw error
  }
}

export type FingerprintedRow = RowOutcome & { fingerprint: string | null }

/** Fingerprint di ogni riga valida (serve prima di interrogare i movimenti esistenti). */
export async function fingerprintRows(analysis: Analysis, accountId: string): Promise<FingerprintedRow[]> {
  const valid = analysis.outcomes.flatMap((o) => (o.kind === 'ok' ? [o.transaction] : []))
  const occurrences = assignOccurrences(valid)
  const byRow = new Map<number, string>()
  await Promise.all(
    valid.map(async (tx, i) => byRow.set(tx.rowIndex, await fingerprintFor(tx, accountId, occurrences[i]!))),
  )
  return analysis.outcomes.map((o) => ({
    ...o,
    fingerprint: o.kind === 'ok' ? (byRow.get(o.transaction.rowIndex) ?? null) : null,
  }))
}

export type PreviewStatus = DuplicateStatus | 'invalid' | 'skipped'

export type PreviewRow = {
  rowIndex: number
  status: PreviewStatus
  needsReview: boolean
  messages: string[]
  fingerprint: string | null
  transaction: NormalizedTransaction | null
  classification: Classification | null
  duplicateOfId: string | null
  transferCandidateId: string | null
  /** Conto proprio dall'altra parte del trasferimento (controparte, IBAN o regola). */
  transferAccountId: string | null
  raw: Record<string, string>
}

export type PreviewSummary = {
  total: number
  ready: number
  toReview: number
  duplicates: number
  possibleDuplicates: number
  skipped: number
  invalid: number
  incomeCents: number
  expenseCents: number
  transferCents: number
  periodStart: IsoDate | null
  periodEnd: IsoDate | null
}

/** Conto dell'utente, per riconoscere i trasferimenti tra conti propri. */
export type OwnAccount = {
  id: string
  name: string
  kind: AccountKind
  iban: string | null
  /** true se il conto è alimentato da estratti CSV (ha una banca predefinita). */
  importable: boolean
}

export type PreviewContext = {
  accountId: string
  accountKind: AccountKind
  ownAccounts?: readonly OwnAccount[]
  reconciliation?: Reconciliation | null
  rules: readonly Rule[]
  lookups: Lookups
  existingCash: readonly ExistingTransaction[]
  existingTradeFingerprints: ReadonlySet<string>
  counterparts: readonly Counterpart[]
}

/** Fasi 6–9 — duplicati, classificazione, trasferimenti, anteprima. */
export function buildPreview(rows: readonly FingerprintedRow[], context: PreviewContext): PreviewRow[] {
  const valid = rows.filter((r): r is FingerprintedRow & { kind: 'ok' } => r.kind === 'ok')
  const verdicts = detectDuplicates(
    valid.map((r) => ({
      fingerprint: r.fingerprint!,
      bookedOn: r.transaction.bookedOn,
      amount: r.transaction.amount,
      movement: r.transaction.movement,
    })),
    context.existingCash,
    context.existingTradeFingerprints,
  )

  const ownAccounts = context.ownAccounts ?? []
  const byIban = new Map(ownAccounts.filter((a) => a.iban && a.id !== context.accountId).map((a) => [a.iban!, a]))
  const classified = valid.map((r) => {
    const base = classify({ ...r.transaction, accountId: context.accountId }, context.rules, context.lookups)
    // IBAN della controparte = un altro conto dell'utente: trasferimento certo.
    const own = r.transaction.counterpartyIban ? byIban.get(r.transaction.counterpartyIban) : undefined
    if (!own || r.transaction.movement !== 'cash') return base
    const type = own.kind === 'investment' && context.accountKind !== 'investment' && r.transaction.amount < 0 ? 'investment' : 'transfer'
    const categoryPath = type === 'investment' ? 'Investimenti > Versamenti' : 'Trasferimenti > Giroconto'
    return {
      ...base,
      type,
      nature: type,
      categoryId: context.lookups.categoryIdByPath.get(categoryPath) ?? null,
      businessId: null,
      incomeSourceId: null,
      transferAccountId: own.id,
      confidence: Math.max(base.confidence, 0.95),
      method: 'rule',
      reasons: [...base.reasons, `IBAN della controparte = tuo conto ${own.name}`],
      needsReview: false,
    } satisfies Classification
  })

  const transfers = detectTransfers(
    valid.map((r, i) => ({
      bookedOn: r.transaction.bookedOn,
      amount: r.transaction.amount,
      type: classified[i]!.type,
      confidence: classified[i]!.confidence,
      movement: r.transaction.movement,
      eligible: verdicts[i]!.status === 'new',
      targetAccountId: classified[i]!.transferAccountId,
    })),
    context.accountKind,
    context.counterparts,
  )

  const previewByRow = new Map<number, PreviewRow>()
  valid.forEach((r, i) => {
    const verdict = verdicts[i]!
    let classification = classified[i]!
    let transferCandidateId: string | null = null
    const messages = [...r.transaction.warnings]
    const transfer = transfers[i]
    if (transfer && 'counterpart' in transfer) {
      transferCandidateId = transfer.counterpart.id
      const categoryPath = transfer.type === 'investment' ? 'Investimenti > Versamenti' : 'Trasferimenti > Giroconto'
      classification = {
        ...classification,
        type: transfer.type,
        nature: transfer.type,
        categoryId: context.lookups.categoryIdByPath.get(categoryPath) ?? null,
        businessId: null,
        incomeSourceId: null,
        transferAccountId: transfer.counterpart.accountId,
        confidence: Math.max(classification.confidence, transfer.confidence),
        method: 'rule',
        reasons: [...classification.reasons, `Trasferimento: ${transfer.reason}`],
        needsReview: false,
      }
    } else if (transfer && 'ambiguous' in transfer) {
      messages.push('Più movimenti compatibili su altri conti: collegamento del trasferimento da verificare')
    }
    const target = classification.transferAccountId ? ownAccounts.find((a) => a.id === classification.transferAccountId) : undefined
    if (target && !transferCandidateId && !target.importable && verdict.status === 'new') {
      messages.push(`Alla conferma verrà registrata la contropartita sul conto ${target.name}`)
    }
    if (verdict.reason) messages.push(verdict.reason)
    if (r.transaction.secondary.length > 0) {
      for (const part of r.transaction.secondary) {
        messages.push(`${part.part === 'fee' ? 'Commissione' : 'Imposte'} registrata a parte: ${formatCentsPlain(Math.abs(part.amount))} ${r.transaction.currency}`)
      }
    }
    previewByRow.set(r.transaction.rowIndex, {
      rowIndex: r.transaction.rowIndex,
      status: verdict.status,
      needsReview: verdict.status === 'possible_duplicate' || (verdict.status === 'new' && classification.needsReview),
      messages,
      fingerprint: r.fingerprint,
      transaction: r.transaction,
      classification,
      duplicateOfId: verdict.duplicateOfId,
      transferCandidateId,
      transferAccountId: classification.transferAccountId,
      raw: r.transaction.raw,
    })
  })

  const reconciliation = context.reconciliation
  return rows.map((r) => {
    if (r.kind === 'ok') return previewByRow.get(r.transaction.rowIndex)!
    const messages = r.kind === 'invalid' ? r.errors : [r.reason]
    const closing = reconciliation?.closing
    if (r.kind === 'skipped' && closing && r.balance?.kind === 'closing' && r.balance.date === closing.date && r.balance.amount === closing.amount) {
      messages.push(reconciliation.message)
    }
    return {
      rowIndex: r.rowIndex,
      status: r.kind,
      needsReview: false,
      messages,
      fingerprint: null,
      transaction: null,
      classification: null,
      duplicateOfId: null,
      transferCandidateId: null,
      transferAccountId: null,
      raw: r.raw,
    }
  })
}

export function summarizePreview(rows: readonly PreviewRow[]): PreviewSummary {
  const summary: PreviewSummary = {
    total: rows.length,
    ready: 0,
    toReview: 0,
    duplicates: 0,
    possibleDuplicates: 0,
    skipped: 0,
    invalid: 0,
    incomeCents: 0,
    expenseCents: 0,
    transferCents: 0,
    periodStart: null,
    periodEnd: null,
  }
  for (const row of rows) {
    if (row.status === 'duplicate') summary.duplicates++
    else if (row.status === 'skipped') summary.skipped++
    else if (row.status === 'invalid') summary.invalid++
    else if (row.status === 'possible_duplicate') {
      summary.possibleDuplicates++
      summary.toReview++
    } else if (row.needsReview) summary.toReview++
    else summary.ready++

    const tx = row.transaction
    if (tx) {
      if (!summary.periodStart || compareIsoDates(tx.bookedOn, summary.periodStart) < 0) summary.periodStart = tx.bookedOn
      if (!summary.periodEnd || compareIsoDates(tx.bookedOn, summary.periodEnd) > 0) summary.periodEnd = tx.bookedOn
    }
    if (row.status !== 'new' || !tx || !row.classification?.type) continue
    const type = row.classification.type
    if (type === 'income') summary.incomeCents += tx.amount
    else if (type === 'expense') summary.expenseCents += -tx.amount
    else if (type === 'refund') summary.expenseCents -= tx.amount
    else if (type === 'transfer' || (type === 'investment' && tx.movement === 'cash')) summary.transferCents += Math.abs(tx.amount)
    for (const part of tx.secondary) summary.expenseCents += -part.amount
  }
  return summary
}
