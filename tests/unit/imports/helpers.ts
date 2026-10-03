import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Lookups } from '@/lib/categorization/engine'
import { DEFAULT_RULES } from '@/lib/categorization/rules'
import { analyzeCsv, buildPreview, fingerprintRows, type PreviewContext } from '@/lib/imports/pipeline'
import type { ImportSource, NormalizedTransaction } from '@/lib/imports/types'

export const CONTEXT = { accountCurrency: 'EUR', timeZone: 'Europe/Rome' }

export function fixture(path: string): Uint8Array {
  return new Uint8Array(readFileSync(join(__dirname, '..', '..', 'fixtures', 'csv', path)))
}

export function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** Lookup con id leggibili (cat:Percorso, biz:slug, src:Nome) per asserzioni chiare. */
const CATEGORY_PATHS = [
  'Stipendio', 'YouTube', 'Vendite', 'Interessi e dividendi', 'Abbonamenti', 'Salute', 'Altro',
  'Casa > Mutuo', 'Casa > Bollette', 'Alimentazione > Spesa', 'Alimentazione > Ristorante', 'Alimentazione > Bar',
  'Alimentazione > Delivery', 'Trasporti > Carburante', 'Trasporti > Trasporto pubblico', 'Trasporti > Parcheggio',
  'Shopping > Acquisti online', 'Tecnologia > Servizi digitali', 'Trasferimenti > Giroconto',
  'Investimenti > Versamenti', 'Investimenti > PAC',
]
export const LOOKUPS: Lookups = {
  categoryIdByPath: new Map(CATEGORY_PATHS.map((p) => [p, `cat:${p}`])),
  businessIdBySlug: new Map([
    ['voxel-studio', 'biz:voxel-studio'],
    ['il-progettista-meccanico', 'biz:il-progettista-meccanico'],
  ]),
  incomeSourceIdByName: new Map([
    ['Stipendio', 'src:Stipendio'],
    ['VOXEL Studio', 'src:VOXEL Studio'],
    ['YouTube — Il Progettista Meccanico', 'src:YouTube'],
    ['Altri guadagni', 'src:Altri guadagni'],
  ]),
  businessIdByIncomeSourceId: new Map([
    ['src:VOXEL Studio', 'biz:voxel-studio'],
    ['src:YouTube', 'biz:il-progettista-meccanico'],
  ]),
}

export function normalized(source: ImportSource, file: Uint8Array): NormalizedTransaction[] {
  const result = analyzeCsv(file, source, CONTEXT)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.analysis.outcomes.flatMap((o) => (o.kind === 'ok' ? [o.transaction] : []))
}

export async function preview(
  source: ImportSource,
  file: Uint8Array,
  overrides: Partial<PreviewContext> = {},
  accountId = 'acc-1',
) {
  const result = analyzeCsv(file, source, CONTEXT)
  if (!result.ok) throw new Error(result.errors.join('; '))
  const rows = await fingerprintRows(result.analysis, accountId)
  return buildPreview(rows, {
    accountId,
    accountKind: source === 'trade_republic' ? 'investment' : 'liquid',
    rules: DEFAULT_RULES,
    lookups: LOOKUPS,
    existingCash: [],
    existingTradeFingerprints: new Set(),
    counterparts: [],
    ...overrides,
  })
}
