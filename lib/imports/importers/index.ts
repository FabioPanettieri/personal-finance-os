import type { CsvImporter, ImportSource } from '../types'
import { ingImporter } from './ing'
import { revolutImporter } from './revolut'
import { tradeRepublicImporter } from './trade-republic'

export const IMPORTERS: Record<ImportSource, CsvImporter> = {
  ing: ingImporter,
  revolut: revolutImporter,
  trade_republic: tradeRepublicImporter,
}

export type SourceDetection = { best: ImportSource; scores: Record<ImportSource, number> }

/** Riconosce la fonte dall'intestazione confrontando i punteggi di tutti gli importer. */
export function detectSource(headers: readonly string[]): SourceDetection {
  const scores = Object.fromEntries(
    Object.values(IMPORTERS).map((importer) => [importer.source, importer.detect(headers)]),
  ) as Record<ImportSource, number>
  const best = (Object.keys(scores) as ImportSource[]).reduce((a, b) => (scores[b] > scores[a] ? b : a))
  return { best, scores }
}
