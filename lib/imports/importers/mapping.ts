import { normalizeDescription } from '../../csv/values'
import type { ColumnMapping, MappingResult } from '../types'

export type FieldSpec = { aliases: readonly string[]; required: boolean }

const key = (header: string) => normalizeDescription(header)

/**
 * Risolve i campi logici sulle colonne reali tramite alias (italiano/inglese,
 * maiuscole e accenti ignorati). Nessuna dipendenza dall'ordine delle colonne.
 */
export function resolveMapping(headers: readonly string[], fields: Record<string, FieldSpec>): MappingResult {
  const byKey = new Map(headers.map((h) => [key(h), h]))
  const mapping: ColumnMapping = {}
  const missing: string[] = []
  for (const [field, spec] of Object.entries(fields)) {
    const found = spec.aliases.map((alias) => byKey.get(key(alias))).find(Boolean)
    if (found) mapping[field] = found
    else if (spec.required) missing.push(`${field} (${spec.aliases.slice(0, 3).join(' / ')})`)
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, mapping }
}

/** Quota di campi obbligatori presenti, più un bonus per i campi distintivi. */
export function detectionScore(
  headers: readonly string[],
  fields: Record<string, FieldSpec>,
  distinctive: readonly string[] = [],
): number {
  const keys = new Set(headers.map(key))
  const required = Object.values(fields).filter((f) => f.required)
  const found = required.filter((f) => f.aliases.some((a) => keys.has(key(a)))).length
  if (required.length === 0 || found < required.length) return (found / Math.max(1, required.length)) * 0.5
  const bonus = distinctive.filter((d) => keys.has(key(d))).length / Math.max(1, distinctive.length)
  return 0.6 + 0.4 * bonus
}

export function cell(raw: Record<string, string>, mapping: ColumnMapping, field: string): string {
  const header = mapping[field]
  return header ? (raw[header] ?? '').trim() : ''
}
