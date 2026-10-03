import Papa from 'papaparse'

import { CsvFileError } from './decode'

export type CsvDelimiter = ',' | ';' | '\t' | '|'

const CANDIDATES: CsvDelimiter[] = [',', ';', '\t', '|']

export type ParsedCsv = {
  delimiter: CsvDelimiter
  headers: string[]
  /** Righe dati come record intestazione → valore, nell'ordine del file. */
  rows: Record<string, string>[]
}

export const MAX_ROWS = 50_000
export const MAX_CELL_LENGTH = 2_000

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let quoted = false
  for (const char of line) {
    if (char === '"') quoted = !quoted
    else if (!quoted && char === delimiter) count++
  }
  return count
}

/**
 * Delimitatore: quello che compare con lo stesso numero (> 0) di occorrenze
 * nel maggior numero delle prime righe, a partire dall'intestazione.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(0, 10)
  if (lines.length === 0) throw new CsvFileError('Il file è vuoto')
  let best: { delimiter: CsvDelimiter; score: number } = { delimiter: ',', score: -1 }
  for (const delimiter of CANDIDATES) {
    const headerCount = countOutsideQuotes(lines[0]!, delimiter)
    if (headerCount === 0) continue
    const consistent = lines.filter((line) => countOutsideQuotes(line, delimiter) === headerCount).length
    const score = consistent * 100 + headerCount
    if (score > best.score) best = { delimiter, score }
  }
  if (best.score < 0) throw new CsvFileError('Impossibile riconoscere il separatore delle colonne')
  return best.delimiter
}

/** Testo di una cella: niente caratteri di controllo, spazi esterni rimossi, lunghezza limitata. */
export function sanitizeCell(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_CELL_LENGTH)
}

export function parseCsv(text: string, delimiter: CsvDelimiter = detectDelimiter(text)): ParsedCsv {
  const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: 'greedy' })
  const fatal = result.errors.find((e) => e.type === 'Quotes')
  if (fatal) throw new CsvFileError(`CSV non valido alla riga ${(fatal.row ?? 0) + 1}: virgolette non chiuse`)

  const [headerRow, ...dataRows] = result.data
  if (!headerRow) throw new CsvFileError('Il file è vuoto')
  const headers = headerRow.map(sanitizeCell)
  if (headers.every((h) => h === '')) throw new CsvFileError('Intestazione mancante')
  const seen = new Set<string>()
  for (const header of headers) {
    if (header && seen.has(header)) throw new CsvFileError(`Colonna duplicata nell'intestazione: "${header}"`)
    seen.add(header)
  }
  if (dataRows.length > MAX_ROWS) throw new CsvFileError(`Troppe righe (${dataRows.length}, massimo ${MAX_ROWS})`)

  const rows = dataRows.map((cells) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      if (header) record[header] = sanitizeCell(cells[index])
    })
    return record
  })
  return { delimiter, headers, rows }
}
