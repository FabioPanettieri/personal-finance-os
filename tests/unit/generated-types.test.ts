import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * I tipi generati (types/database.ts) devono riflettere le migration: se si
 * aggiunge una tabella o un enum senza rigenerare i tipi, questo test fallisce.
 * Rigenerare con `npm run db:types` (richiede `npm run db:start`).
 */
const root = join(__dirname, '..', '..')
const sql = readdirSync(join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8'))
  .join('\n')
const types = readFileSync(join(root, 'types/database.ts'), 'utf8')

function section(name: string, next: string): string {
  const start = types.indexOf(`    ${name}: {`)
  const end = types.indexOf(`    ${next}: {`, start)
  return types.slice(start, end)
}

const keys = (block: string, pattern: RegExp) => [...block.matchAll(pattern)].map((m) => m[1]).sort()

describe('types/database.ts allineato alle migration', () => {
  it('stesse tabelle', () => {
    const fromSql = [...sql.matchAll(/^create table public\.([a-z_]+)/gm)].map((m) => m[1]).sort()
    expect(keys(section('Tables', 'Views'), /^ {6}([a-z_]+): \{$/gm)).toEqual(fromSql)
  })

  it('stesse viste', () => {
    const fromSql = [...sql.matchAll(/^create view public\.([a-z_]+)/gm)].map((m) => m[1]).sort()
    expect(keys(section('Views', 'Functions'), /^ {6}([a-z_]+): \{$/gm)).toEqual(fromSql)
  })

  it('stessi enum con gli stessi valori', () => {
    const enumsBlock = section('Enums', 'CompositeTypes')
    for (const [, name, values] of sql.matchAll(/^create type public\.([a-z_]+) as enum \(([^)]+)\)/gm)) {
      const expected = [...values!.matchAll(/'([a-z_]+)'/g)].map((m) => `'${m[1]}'`).join(' | ')
      expect(enumsBlock, `enum ${name}`).toContain(`${name}: ${expected}`)
    }
  })
})
