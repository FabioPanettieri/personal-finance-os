import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Rule } from '@/lib/categorization/rules'
import type { ImportSource } from '@/lib/imports/types'

/**
 * Regole iniziali lette direttamente dal seed SQL (migration 0006 + le tre di
 * 0004): i test usano le stesse regole che il database crea per ogni utente,
 * senza una seconda copia nel codice.
 */
const MIGRATION = join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261003000006_import_hardening.sql')

export const CARD_ACCOUNT_ID = 'acc-card'

type SqlValue = string | number | boolean | null

function parseTuple(line: string): SqlValue[] {
  const values: SqlValue[] = []
  let i = line.indexOf('(') + 1
  while (i < line.length) {
    while (line[i] === ' ' || line[i] === ',') i++
    if (line[i] === ')') break
    if (line[i] === "'") {
      let text = ''
      i++
      for (;;) {
        if (line[i] === "'" && line[i + 1] === "'") {
          text += "'"
          i += 2
        } else if (line[i] === "'") {
          i++
          break
        } else text += line[i++]
      }
      values.push(text)
    } else {
      const match = /^[^,)]+/.exec(line.slice(i))![0]
      i += match.length
      const token = match.trim()
      values.push(token === 'null' ? null : token === 'true' ? true : token === 'false' ? false : Number(token))
    }
  }
  return values
}

function seedRules(): Rule[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const block = sql.slice(sql.indexOf('from (values'), sql.indexOf(') as r(name'))
  const lines = block.split('\n').filter((l) => l.trim().startsWith("('"))
  return lines.map((line, index) => {
    const [name, priority, matchField, matchType, pattern, direction, sources, setType, setNature, category, business, incomeSource, toCard, review, confidence] =
      parseTuple(line)
    return {
      id: `seed:${index}`,
      dbId: `seed:${index}`,
      name: name as string,
      priority: priority as number,
      matchField: matchField as Rule['matchField'],
      matchType: matchType as Rule['matchType'],
      pattern: pattern as string,
      accountId: null,
      direction: direction as Rule['direction'],
      amountMinCents: null,
      amountMaxCents: null,
      sources: sources ? ((sources as string).replace(/[{}]/g, '').split(',') as ImportSource[]) : null,
      setType: setType as Rule['setType'],
      setNature: setNature as Rule['setNature'],
      setCategoryPath: (category as string | null) ?? undefined,
      setBusinessSlug: (business as string | null) ?? undefined,
      setIncomeSourceName: (incomeSource as string | null) ?? undefined,
      setTransferAccountId: toCard ? CARD_ACCOUNT_ID : null,
      review: review as string | null,
      confidence: confidence as number,
    }
  })
}

const bootstrap = (id: string, name: string, priority: number, pattern: string, setType: Rule['setType'], categoryPath: string, confidence: number): Rule => ({
  id,
  dbId: id,
  name,
  priority,
  matchField: 'description',
  matchType: 'contains',
  pattern,
  accountId: null,
  direction: 'out',
  amountMinCents: null,
  amountMaxCents: null,
  setType,
  setNature: setType === 'investment' ? 'investment' : 'personal',
  setCategoryPath: categoryPath,
  confidence,
})

export const SEED_RULES: readonly Rule[] = [
  bootstrap('boot:spotify', 'Spotify → Abbonamenti', 100, 'spotify', 'expense', 'Abbonamenti', 0.95),
  bootstrap('boot:netflix', 'Netflix → Abbonamenti', 100, 'netflix', 'expense', 'Abbonamenti', 0.95),
  bootstrap('boot:tr', 'Trade Republic → Investimento', 50, 'trade republic', 'investment', 'Investimenti > Versamenti', 0.9),
  ...seedRules(),
]
