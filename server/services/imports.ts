import { addDays, DEFAULT_TIME_ZONE, isIsoDate, type IsoDate } from '@/lib/dates'
import { AUTO_APPLY_CONFIDENCE, deriveNature, REVIEW_BELOW_CONFIDENCE, signAllows } from '@/lib/categorization/engine'
import { mirrorFingerprint, secondaryFingerprint } from '@/lib/imports/fingerprint'
import { applyRulesToPending } from '@/server/repositories/rules'
import { positiveDecimal } from '@/lib/csv/values'
import { IMPORTERS } from '@/lib/imports/importers'
import {
  analyzeCsv,
  buildPreview,
  fingerprintRows,
  summarizePreview,
  validateFile,
  type PreviewRow,
  type UploadedFile,
} from '@/lib/imports/pipeline'
import type { ImportSource, NormalizedTransaction, TransactionType } from '@/lib/imports/types'
import type { ImportRecord, ImportRowRecord, TablesInsert } from '@/types/domain'

import { getAccount, RepositoryError, type DbClient } from '../repositories/accounts'
import {
  chunks,
  failRepository as fail,
  findExistingCash,
  findExistingTradeFingerprints,
  findTransferCounterparts,
  loadClassificationData,
  loadOwnAccounts,
} from '../repositories/import-context'

/**
 * Servizio di importazione CSV (docs/00-architecture.md §7.1).
 *
 *   createImportPreview: file → Storage privato + imports/import_files/import_rows
 *                        (stato "preview"). Nessuna transazione viene scritta.
 *   updateImportRow / setImportRowIncluded: correzioni dell'utente.
 *   commitImport:        righe confermate → transactions / investment_transactions.
 *
 * Tutto passa dal client Supabase dell'utente: RLS e AAL2 sempre attive.
 * La conferma è idempotente: ogni scrittura usa il fingerprint come chiave
 * (unique account_id + fingerprint), quindi un doppio invio o un nuovo
 * tentativo dopo un errore non duplica nulla.
 */

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const BUCKET = 'imports'

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 255) || 'estratto.csv'
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

function rowInsert(importId: string, row: PreviewRow): TablesInsert<'import_rows'> {
  const tx = row.transaction
  const c = row.classification
  return {
    import_id: importId,
    row_index: row.rowIndex,
    raw: row.raw,
    booked_on: tx?.bookedOn ?? null,
    value_on: tx?.valueOn ?? null,
    description: tx?.description.slice(0, 1000) ?? null,
    amount_cents: tx?.amount ?? null,
    currency: tx?.currency ?? null,
    counterparty: tx?.counterparty?.slice(0, 200) ?? null,
    proposed_type: c?.type ?? null,
    proposed_nature: c?.nature ?? null,
    proposed_category_id: c?.categoryId ?? null,
    proposed_business_id: c?.businessId ?? null,
    proposed_income_source_id: c?.incomeSourceId ?? null,
    categorization_method: c?.method ?? 'none',
    categorization_confidence: c ? round3(c.confidence) : null,
    categorization_rule_id: c?.ruleDbId ?? null,
    transfer_candidate_id: row.transferCandidateId,
    transfer_account_id: row.transferAccountId,
    fingerprint: row.fingerprint,
    status: row.status,
    duplicate_of_transaction_id: row.duplicateOfId,
    errors: [...new Set([...(row.classification?.reasons ?? []), ...row.messages])].slice(0, 20),
  }
}

export type CreatePreviewInput = {
  userId: string
  accountId: string
  source: ImportSource
  file: UploadedFile
  timeZone?: string
}

export async function createImportPreview(db: DbClient, input: CreatePreviewInput): Promise<ServiceResult<{ importId: string }>> {
  // 1. Validazione del file
  const fileErrors = validateFile(input.file)
  if (fileErrors.length > 0) return { ok: false, errors: fileErrors }

  const account = await getAccount(db, input.accountId)
  if (!account) return { ok: false, errors: ['Conto non trovato'] }
  if (!account.isActive) return { ok: false, errors: ['Il conto è disattivato: riattivalo per importare'] }

  // 2–5. Riconoscimento fonte, parsing, mapping, normalizzazione
  const analysis = analyzeCsv(input.file.bytes, input.source, {
    accountCurrency: account.currency,
    timeZone: input.timeZone ?? DEFAULT_TIME_ZONE,
  })
  if (!analysis.ok) return { ok: false, errors: analysis.errors }

  // 6–9. Duplicati, classificazione, trasferimenti → anteprima
  const fingerprinted = await fingerprintRows(analysis.analysis, account.id)
  const valid = fingerprinted.filter((r) => r.kind === 'ok')
  const dates = valid.map((r) => (r.kind === 'ok' ? r.transaction.bookedOn : null)).filter((d): d is IsoDate => d !== null).sort()
  const period = dates.length > 0 ? { from: dates[0]!, to: dates.at(-1)! } : null
  const cashFps = valid.filter((r) => r.kind === 'ok' && r.transaction.movement === 'cash').map((r) => r.fingerprint!)
  const tradeFps = valid.filter((r) => r.kind === 'ok' && r.transaction.movement === 'trade').map((r) => r.fingerprint!)

  const [classification, existingCash, existingTrade, counterparts, ownAccounts] = await Promise.all([
    loadClassificationData(db),
    findExistingCash(db, account.id, cashFps, period && { from: addDays(period.from, -2), to: addDays(period.to, 2) }),
    findExistingTradeFingerprints(db, account.id, tradeFps),
    period ? findTransferCounterparts(db, account.id, { from: addDays(period.from, -3), to: addDays(period.to, 3) }) : Promise.resolve([]),
    loadOwnAccounts(db),
  ])

  const preview = buildPreview(fingerprinted, {
    accountId: account.id,
    accountKind: account.type.kind,
    ownAccounts,
    reconciliation: analysis.analysis.reconciliation,
    rules: classification.rules,
    lookups: classification.lookups,
    existingCash,
    existingTradeFingerprints: existingTrade,
    counterparts,
  })
  const summary = summarizePreview(preview)

  // File originale nello Storage privato, mai modificato (nessuna policy di update).
  const importId = crypto.randomUUID()
  const sha256 = await sha256Hex(input.file.bytes)
  const storagePath = `${input.userId}/${importId}/${sha256}.csv`
  const upload = await db.storage.from(BUCKET).upload(storagePath, input.file.bytes, {
    contentType: 'text/csv',
    upsert: false,
  })
  if (upload.error) throw new RepositoryError(`Salvataggio del file originale: ${upload.error.message}`)

  const created = await db.from('imports').insert({
    id: importId,
    account_id: account.id,
    bank_profile: input.source,
    status: 'preview',
    rows_total: summary.total,
    rows_new: summary.ready,
    rows_duplicate: summary.duplicates,
    rows_possible_duplicate: summary.possibleDuplicates,
    rows_invalid: summary.invalid,
    error_message: analysis.analysis.reconciliation && !analysis.analysis.reconciliation.ok ? analysis.analysis.reconciliation.message.slice(0, 1000) : null,
    income_cents: Math.max(0, summary.incomeCents),
    expense_cents: Math.max(0, summary.expenseCents),
    transfer_cents: Math.max(0, summary.transferCents),
    period_start: summary.periodStart,
    period_end: summary.periodEnd,
  })
  if (created.error) fail('Creazione importazione', created.error)

  const file = await db.from('import_files').insert({
    import_id: importId,
    storage_path: storagePath,
    original_filename: sanitizeFilename(input.file.name),
    size_bytes: input.file.bytes.length,
    sha256,
    detected_encoding: analysis.analysis.encoding,
    detected_delimiter: analysis.analysis.delimiter,
    header: analysis.analysis.headers,
  })
  if (file.error) fail('Registrazione file', file.error)

  for (const part of chunks(preview, 500)) {
    const { error } = await db.from('import_rows').insert(part.map((row) => rowInsert(importId, row)))
    if (error) fail('Salvataggio anteprima', error)
  }

  return { ok: true, value: { importId } }
}

/** Una riga richiede una decisione: nessun tipo, o proposta automatica a bassa confidenza. */
export function rowNeedsReview(row: Pick<ImportRowRecord, 'proposed_type' | 'categorization_method' | 'categorization_confidence' | 'status'>): boolean {
  if (row.status === 'possible_duplicate') return true
  if (row.status !== 'new') return false
  if (!row.proposed_type) return true
  return row.categorization_method !== 'manual' && Number(row.categorization_confidence ?? 0) < REVIEW_BELOW_CONFIDENCE
}

export type RowPatch = {
  type: TransactionType
  categoryId: string | null
  businessId: string | null
  incomeSourceId: string | null
  /** Conto proprio dall'altra parte del trasferimento (solo transfer/investment). */
  transferAccountId?: string | null
}

/** Correzione manuale di una riga in anteprima. */
export async function updateImportRow(db: DbClient, rowId: string, patch: RowPatch): Promise<ServiceResult<null>> {
  const { data: row, error } = await db.from('import_rows').select('*, imports!inner(status, account_id)').eq('id', rowId).maybeSingle()
  if (error) fail('Lettura riga', error)
  if (!row) return { ok: false, errors: ['Riga non trovata'] }
  if ((row.imports as unknown as { status: string }).status !== 'preview') return { ok: false, errors: ['L’importazione non è più modificabile'] }
  if (!['new', 'possible_duplicate', 'skipped'].includes(row.status) || row.amount_cents === null) {
    return { ok: false, errors: ['Questa riga non può essere importata'] }
  }
  if (!signAllows(patch.type, row.amount_cents)) {
    return {
      ok: false,
      errors: [patch.type === 'expense' ? 'Una spesa deve avere importo negativo' : 'Entrate e rimborsi devono avere importo positivo'],
    }
  }

  const imp = row.imports as unknown as { status: string; account_id: string }
  const isTransfer = patch.type === 'transfer' || patch.type === 'investment'
  const transferAccountId = isTransfer ? (patch.transferAccountId ?? null) : null
  if (transferAccountId === imp.account_id) return { ok: false, errors: ['Il conto di destinazione deve essere diverso dal conto importato'] }
  if (transferAccountId) {
    const { data: target } = await db.from('accounts').select('id').eq('id', transferAccountId).maybeSingle()
    if (!target) return { ok: false, errors: ['Conto di destinazione non trovato'] }
  }
  // La controparte proposta resta valida solo se sta sul conto scelto.
  let transferCandidateId = isTransfer ? row.transfer_candidate_id : null
  if (transferCandidateId && transferAccountId) {
    const { data: candidate } = await db.from('transactions').select('account_id').eq('id', transferCandidateId).maybeSingle()
    if (candidate?.account_id !== transferAccountId) transferCandidateId = null
  }

  let businessId = patch.businessId
  const incomeSourceId = patch.type === 'income' ? patch.incomeSourceId : null
  if (incomeSourceId && !businessId) {
    const { data: source } = await db.from('income_sources').select('business_id').eq('id', incomeSourceId).maybeSingle()
    businessId = source?.business_id ?? null
  }
  const { error: updateError } = await db
    .from('import_rows')
    .update({
      proposed_type: patch.type,
      proposed_nature: deriveNature(patch.type, businessId, row.proposed_nature === 'investment' ? 'investment' : null),
      proposed_category_id: patch.categoryId,
      proposed_business_id: patch.type === 'transfer' ? null : businessId,
      proposed_income_source_id: incomeSourceId,
      categorization_method: 'manual',
      categorization_confidence: 1,
      categorization_rule_id: null,
      transfer_account_id: transferAccountId,
      transfer_candidate_id: transferCandidateId,
    })
    .eq('id', rowId)
  if (updateError) fail('Aggiornamento riga', updateError)
  return { ok: true, value: null }
}

/** Includi/escludi una riga. Le righe escluse dall'importer (con motivo) restano escluse. */
export async function setImportRowIncluded(db: DbClient, rowId: string, include: boolean): Promise<ServiceResult<null>> {
  const { data: row, error } = await db.from('import_rows').select('id, status, errors, fingerprint, imports!inner(status)').eq('id', rowId).maybeSingle()
  if (error) fail('Lettura riga', error)
  if (!row) return { ok: false, errors: ['Riga non trovata'] }
  if ((row.imports as unknown as { status: string }).status !== 'preview') return { ok: false, errors: ['L’importazione non è più modificabile'] }

  let status: ImportRowRecord['status']
  if (include) {
    if (row.status === 'skipped' && row.fingerprint) status = 'new'
    else if (row.status === 'possible_duplicate') status = 'new'
    else return { ok: false, errors: ['Questa riga non può essere inclusa'] }
  } else {
    if (row.status !== 'new' && row.status !== 'possible_duplicate') return { ok: false, errors: ['Riga già esclusa'] }
    status = 'skipped'
  }
  const { error: updateError } = await db.from('import_rows').update({ status }).eq('id', rowId)
  if (updateError) fail('Aggiornamento riga', updateError)
  return { ok: true, value: null }
}

async function loadAllRows(db: DbClient, importId: string): Promise<ImportRowRecord[]> {
  const rows: ImportRowRecord[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('import_rows').select('*').eq('import_id', importId).order('row_index').range(from, from + 999)
    if (error) fail('Lettura righe', error)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

type CommitSummary = { imported: number; transactions: number; investmentTransactions: number }

/**
 * Conferma: scrive solo le righe "new" (pronte o corrette dall'utente).
 * Le righe ancora da verificare bloccano la conferma: niente classificazioni inventate.
 */
export async function commitImport(db: DbClient, importId: string, timeZone = DEFAULT_TIME_ZONE): Promise<ServiceResult<CommitSummary>> {
  const { data: imp, error } = await db.from('imports').select('*, import_files(header)').eq('id', importId).maybeSingle()
  if (error) fail('Lettura importazione', error)
  if (!imp) return { ok: false, errors: ['Importazione non trovata'] }
  if (imp.status === 'committed') return { ok: false, errors: ['Importazione già confermata'] }
  if (imp.status !== 'preview') return { ok: false, errors: ['Importazione non confermabile'] }

  const account = await getAccount(db, imp.account_id)
  if (!account) return { ok: false, errors: ['Conto non trovato'] }

  const source = imp.bank_profile as ImportSource
  const importer = IMPORTERS[source]
  const files = imp.import_files as unknown as { header: string[] | null }[]
  const headers = files[0]?.header ?? []
  const mapping = importer.mapColumns(headers)
  if (!mapping.ok) return { ok: false, errors: ['Mappatura delle colonne non più valida'] }

  const rows = await loadAllRows(db, importId)
  const included = rows.filter((r) => r.status === 'new')
  const pending = included.filter((r) => rowNeedsReview(r))
  if (pending.length > 0) {
    return { ok: false, errors: [`${pending.length} righe da verificare: classificale o escludile prima di confermare`] }
  }
  if (included.length === 0) return { ok: false, errors: ['Nessuna riga da importare'] }

  // Ricostruzione deterministica dalla riga originale (raw) + correzioni dell'utente.
  const context = { accountCurrency: account.currency, timeZone }
  type Planned = { row: ImportRowRecord; tx: NormalizedTransaction }
  const planned: Planned[] = []
  for (const row of included) {
    const outcome = importer.normalizeRow(row.raw as Record<string, string>, row.row_index, mapping.mapping, context)
    if (outcome.kind !== 'ok') return { ok: false, errors: [`Riga ${row.row_index + 1} non più valida`] }
    planned.push({ row, tx: outcome.transaction })
  }

  // Già presenti (doppio invio o tentativo precedente interrotto): si collegano, non si duplicano.
  const cashFps = planned.filter((p) => p.tx.movement === 'cash').map((p) => p.row.fingerprint!)
  const existing = new Map<string, string>()
  for (const part of chunks(cashFps, 100)) {
    const { data, error: e } = await db.from('transactions').select('id, fingerprint').eq('account_id', account.id).in('fingerprint', part)
    if (e) fail('Verifica duplicati', e)
    for (const t of data) existing.set(t.fingerprint, t.id)
  }

  // Strumenti finanziari (per ISIN).
  const instrumentIds = new Map<string, string>()
  const isins = [...new Set(planned.map((p) => p.tx.investment?.isin).filter((x): x is string => Boolean(x)))]
  if (isins.length > 0) {
    const named = new Map(planned.filter((p) => p.tx.investment?.isin).map((p) => [p.tx.investment!.isin!, p.tx.investment!]))
    const { data, error: e } = await db
      .from('instruments')
      .upsert(
        isins.map((isin) => ({
          isin,
          name: (named.get(isin)?.name ?? isin).slice(0, 120),
          asset_class: assetClass(named.get(isin)?.assetClass ?? null),
          currency: account.currency,
        })),
        { onConflict: 'user_id,isin' },
      )
      .select('id, isin')
    if (e) fail('Registrazione strumenti', e)
    for (const i of data) if (i.isin) instrumentIds.set(i.isin, i.id)
  }

  // Gruppi di trasferimento per le coppie confermate (controparte ancora libera).
  const groupByRow = new Map<string, string>()
  const linkable = planned.filter(
    (p) =>
      p.row.transfer_candidate_id &&
      (p.row.proposed_type === 'transfer' || p.row.proposed_type === 'investment') &&
      !existing.has(p.row.fingerprint!),
  )
  for (const p of linkable) {
    const { data: counterpart } = await db.from('transactions').select('id, type, transfer_group_id').eq('id', p.row.transfer_candidate_id!).maybeSingle()
    if (!counterpart || counterpart.transfer_group_id) continue
    const kind = p.row.proposed_type === 'investment' || counterpart.type === 'investment' ? 'investment' : 'internal'
    const { data: group, error: e } = await db
      .from('transfer_groups')
      .insert({
        kind,
        detected_by: p.row.categorization_method === 'manual' ? 'manual' : 'auto',
        confidence: Number(p.row.categorization_confidence ?? 0),
      })
      .select('id')
      .single()
    if (e) fail('Creazione trasferimento', e)
    groupByRow.set(p.row.id, group.id)
  }

  // Trasferimenti verso conti propri non alimentati da estratti (conto deposito,
  // carta di credito): la contropartita si registra qui, nello stesso gruppo,
  // così il denaro non "sparisce" e il patrimonio resta corretto.
  const ownAccounts = await loadOwnAccounts(db)
  const ownById = new Map(ownAccounts.map((a) => [a.id, a]))
  const linkableIds = new Set(linkable.map((p) => p.row.id))
  const mirrored = planned.filter((p) => {
    const target = p.row.transfer_account_id ? ownById.get(p.row.transfer_account_id) : undefined
    return (
      target &&
      !target.importable &&
      target.id !== account.id &&
      p.tx.movement === 'cash' &&
      (p.row.proposed_type === 'transfer' || p.row.proposed_type === 'investment') &&
      !linkableIds.has(p.row.id) &&
      !existing.has(p.row.fingerprint!)
    )
  })
  for (const p of mirrored) {
    const { data: group, error: e } = await db
      .from('transfer_groups')
      .insert({
        kind: p.row.proposed_type === 'investment' ? 'investment' : 'internal',
        detected_by: p.row.categorization_method === 'manual' ? 'manual' : 'auto',
        confidence: Number(p.row.categorization_confidence ?? 0),
      })
      .select('id')
      .single()
    if (e) fail('Creazione trasferimento', e)
    groupByRow.set(p.row.id, group.id)
  }

  // Movimenti di liquidità: riga principale (se cash) + commissioni/imposte.
  const cashInserts: TablesInsert<'transactions'>[] = []
  for (const { row, tx } of planned) {
    if (tx.movement === 'cash' && !existing.has(row.fingerprint!)) {
      const confidence = Number(row.categorization_confidence ?? 0)
      const type = row.proposed_type!
      cashInserts.push({
        account_id: account.id,
        booked_on: tx.bookedOn,
        value_on: tx.valueOn,
        description: tx.description.slice(0, 500) || tx.originalDescription.slice(0, 500),
        original_description: tx.originalDescription.slice(0, 1000),
        amount_cents: tx.amount,
        currency: tx.currency,
        original_amount_cents: tx.originalAmount,
        original_currency: tx.originalAmount !== null ? tx.originalCurrency : null,
        type,
        nature: row.proposed_nature ?? deriveNature(type, row.proposed_business_id),
        category_id: row.proposed_category_id,
        income_source_id: type === 'income' ? row.proposed_income_source_id : null,
        business_id: type === 'transfer' ? null : row.proposed_business_id,
        counterparty: tx.counterparty?.slice(0, 200) ?? null,
        transfer_group_id: groupByRow.get(row.id) ?? null,
        is_categorized: row.categorization_method === 'manual' || confidence >= AUTO_APPLY_CONFIDENCE,
        categorization_method: row.categorization_method === 'none' ? 'rule' : row.categorization_method,
        categorization_confidence: row.categorization_method === 'manual' ? 1 : confidence,
        categorization_rule_id: row.categorization_rule_id,
        source: 'csv_import',
        import_id: importId,
        fingerprint: row.fingerprint!,
      })
    }
    for (const part of tx.secondary) {
      cashInserts.push({
        account_id: account.id,
        booked_on: tx.bookedOn,
        description: part.description.slice(0, 500),
        original_description: `${tx.originalDescription} [${part.part === 'fee' ? 'commissione' : 'imposte'}]`.slice(0, 1000),
        amount_cents: part.amount,
        currency: tx.currency,
        type: 'expense',
        nature: source === 'trade_republic' ? 'investment' : 'personal',
        is_categorized: true,
        categorization_method: 'rule',
        categorization_confidence: 0.9,
        source: 'csv_import',
        import_id: importId,
        fingerprint: await secondaryFingerprint(row.fingerprint!, part.part),
      })
    }
  }

  for (const { row, tx } of mirrored) {
    const target = ownById.get(row.transfer_account_id!)!
    const type = row.proposed_type!
    cashInserts.push({
      account_id: target.id,
      booked_on: tx.bookedOn,
      value_on: tx.valueOn,
      description: `${tx.amount < 0 ? 'Da' : 'Verso'} ${account.name} · ${tx.description}`.slice(0, 500),
      original_description: tx.originalDescription.slice(0, 1000),
      amount_cents: -tx.amount,
      currency: tx.currency,
      type,
      nature: type === 'investment' ? 'investment' : 'transfer',
      category_id: row.proposed_category_id,
      transfer_group_id: groupByRow.get(row.id) ?? null,
      is_categorized: true,
      categorization_method: row.categorization_method === 'manual' ? 'manual' : 'rule',
      categorization_confidence: row.categorization_method === 'manual' ? 1 : Number(row.categorization_confidence ?? 0),
      source: 'csv_import',
      import_id: importId,
      fingerprint: await mirrorFingerprint(row.fingerprint!),
    })
  }

  const insertedByFp = new Map<string, string>(existing)
  for (const part of chunks(cashInserts, 500)) {
    const { data, error: e } = await db
      .from('transactions')
      .upsert(part, { onConflict: 'account_id,fingerprint', ignoreDuplicates: true })
      .select('id, fingerprint')
    if (e) fail('Scrittura transazioni', e)
    for (const t of data) insertedByFp.set(t.fingerprint, t.id)
  }

  // Operazioni su strumenti (BUY/SELL) e dividendi collegati al movimento di cassa.
  const tradeInserts: TablesInsert<'investment_transactions'>[] = []
  for (const { row, tx } of planned) {
    const inv = tx.investment
    if (!inv) continue
    tradeInserts.push({
      account_id: account.id,
      instrument_id: inv.isin ? (instrumentIds.get(inv.isin) ?? null) : null,
      trade_on: tx.bookedOn,
      kind: inv.kind,
      // numeric come stringa decimale: PostgREST la passa a Postgres senza conversione in float.
      quantity: positiveDecimal(inv.quantity) as unknown as number | null,
      price: inv.price as unknown as number | null,
      price_currency: inv.price !== null ? tx.currency : null,
      amount_cents: tx.amount,
      fees_cents: tx.fee,
      taxes_cents: tx.tax,
      cash_transaction_id: tx.movement === 'cash' ? (insertedByFp.get(row.fingerprint!) ?? null) : null,
      description: tx.description.slice(0, 500),
      original_description: tx.originalDescription.slice(0, 1000),
      source: 'csv_import',
      import_id: importId,
      fingerprint: row.fingerprint!,
    })
  }
  let investmentTransactions = 0
  for (const part of chunks(tradeInserts, 500)) {
    const { data, error: e } = await db
      .from('investment_transactions')
      .upsert(part, { onConflict: 'account_id,fingerprint', ignoreDuplicates: true })
      .select('id')
    if (e) fail('Scrittura operazioni di investimento', e)
    investmentTransactions += data.length
  }

  // Collega la controparte al gruppo di trasferimento.
  for (const p of linkable) {
    const groupId = groupByRow.get(p.row.id)
    if (!groupId) continue
    const { error: e } = await db
      .from('transactions')
      .update({ transfer_group_id: groupId })
      .eq('id', p.row.transfer_candidate_id!)
      .is('transfer_group_id', null)
    if (e) fail('Collegamento trasferimento', e)
  }

  // Stato delle righe e dell'importazione.
  const committedRows = included.map((row) => ({
    ...row,
    status: 'imported' as const,
    transaction_id: row.fingerprint ? (insertedByFp.get(row.fingerprint) ?? null) : null,
  }))
  for (const part of chunks(committedRows, 500)) {
    const { error: e } = await db.from('import_rows').upsert(part, { onConflict: 'id' })
    if (e) fail('Aggiornamento righe', e)
  }

  const typeTotals = { income: 0, expense: 0, transfer: 0 }
  for (const { row, tx } of planned) {
    if (tx.movement === 'cash') {
      if (row.proposed_type === 'income') typeTotals.income += tx.amount
      else if (row.proposed_type === 'expense') typeTotals.expense += -tx.amount
      else if (row.proposed_type === 'refund') typeTotals.expense -= tx.amount
      else typeTotals.transfer += Math.abs(tx.amount)
    }
    for (const part of tx.secondary) typeTotals.expense += -part.amount
  }

  const { error: finalError } = await db
    .from('imports')
    .update({
      status: 'committed',
      committed_at: new Date().toISOString(),
      rows_imported: included.length,
      rows_new: included.length,
      rows_duplicate: rows.filter((r) => r.status === 'duplicate').length,
      rows_possible_duplicate: rows.filter((r) => r.status === 'possible_duplicate').length,
      income_cents: Math.max(0, typeTotals.income),
      expense_cents: Math.max(0, typeTotals.expense),
      transfer_cents: Math.max(0, typeTotals.transfer),
    })
    .eq('id', importId)
    .eq('status', 'preview')
  if (finalError) fail('Chiusura importazione', finalError)

  // Giroconti imparati (nome dell'intestatario, IBAN ricorrenti) e regole sui movimenti
  // ancora da sistemare, anche di import precedenti. Un errore qui non annulla l'import.
  try {
    await applyRulesToPending(db)
  } catch (e) {
    console.error('[imports] riapplicazione regole non riuscita', { message: e instanceof Error ? e.message : 'errore' })
  }

  return {
    ok: true,
    value: { imported: included.length, transactions: cashInserts.length, investmentTransactions },
  }
}

function assetClass(value: string | null): string {
  const normalized = (value ?? '').toLowerCase()
  if (normalized === 'fund' || normalized === 'etf') return normalized === 'fund' ? 'fund' : 'etf'
  if (['stock', 'bond', 'crypto', 'cash'].includes(normalized)) return normalized
  return 'other'
}

export async function cancelImport(db: DbClient, importId: string): Promise<ServiceResult<null>> {
  const { data, error } = await db.from('imports').update({ status: 'cancelled' }).eq('id', importId).eq('status', 'preview').select('id')
  if (error) fail('Annullamento', error)
  return data.length === 1 ? { ok: true, value: null } : { ok: false, errors: ['Importazione non annullabile'] }
}

export type ImportListItem = ImportRecord & { accountName: string; fileName: string | null }

export async function listImports(db: DbClient): Promise<ImportListItem[]> {
  const { data, error } = await db
    .from('imports')
    .select('*, accounts!inner(name), import_files(original_filename)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) fail('Lettura importazioni', error)
  return data.map((row) => {
    const { accounts, import_files, ...rest } = row as typeof row & {
      accounts: { name: string }
      import_files: { original_filename: string }[]
    }
    return { ...(rest as ImportRecord), accountName: accounts.name, fileName: import_files[0]?.original_filename ?? null }
  })
}

export type ImportDetail = {
  record: ImportRecord
  accountName: string
  accountCurrency: string
  file: { name: string; sizeBytes: number; encoding: string | null; delimiter: string | null; storagePath: string } | null
  rows: (ImportRowRecord & { needsReview: boolean })[]
}

export async function getImportDetail(db: DbClient, importId: string): Promise<ImportDetail | null> {
  const { data, error } = await db
    .from('imports')
    .select('*, accounts!inner(name, currency), import_files(original_filename, size_bytes, detected_encoding, detected_delimiter, storage_path)')
    .eq('id', importId)
    .maybeSingle()
  if (error) fail('Lettura importazione', error)
  if (!data) return null
  const { accounts, import_files, ...record } = data as typeof data & {
    accounts: { name: string; currency: string }
    import_files: { original_filename: string; size_bytes: number; detected_encoding: string | null; detected_delimiter: string | null; storage_path: string }[]
  }
  const file = import_files[0]
  const rows = await loadAllRows(db, importId)
  return {
    record: record as ImportRecord,
    accountName: accounts.name,
    accountCurrency: accounts.currency,
    file: file
      ? { name: file.original_filename, sizeBytes: file.size_bytes, encoding: file.detected_encoding, delimiter: file.detected_delimiter, storagePath: file.storage_path }
      : null,
    rows: rows.map((r) => ({ ...r, needsReview: rowNeedsReview(r) })),
  }
}

export function isDate(value: string | null): value is IsoDate {
  return value !== null && isIsoDate(value)
}
