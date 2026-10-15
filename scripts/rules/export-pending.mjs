// Elenco di cosa resta da sistemare, raggruppato, da mandare a Claude per preparare decisioni.json:
//   npm run da-sistemare            → scrive "Finanze da sistemare.txt" nella cartella Download
// Comprende: righe da verificare negli import non ancora confermati, movimenti "da sistemare",
// movimenti assegnati al business "Altro". IBAN e numeri lunghi vengono mascherati.
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { psql } from '../backup/docker.mjs'
import { containers } from '../backup/lib.mjs'

const SQL = `select coalesce(json_agg(x), '[]') from (
  select 'import' as origine, a.name as conto, r.booked_on::text as data, r.amount_cents as importo,
         coalesce(r.counterparty, '') as controparte, coalesce(r.description, '') as descrizione
  from public.import_rows r join public.imports i on i.id = r.import_id join public.accounts a on a.id = i.account_id
  where i.status = 'preview' and r.status = 'new'
    and (r.proposed_type is null or (r.categorization_method <> 'manual' and coalesce(r.categorization_confidence, 0) < 0.6))
  union all
  select 'movimento', a.name, t.booked_on::text, t.amount_cents, coalesce(t.counterparty, ''), t.description
  from public.transactions t join public.accounts a on a.id = t.account_id
  where not t.is_categorized and t.transfer_group_id is null
  union all
  select 'business Altro', a.name, t.booked_on::text, t.amount_cents, coalesce(t.counterparty, ''), t.description
  from public.transactions t join public.accounts a on a.id = t.account_id join public.businesses b on b.id = t.business_id
  where b.slug = 'altro'
) x`

/** IBAN e sequenze di cifre lunghe (riferimenti, carte) non servono per decidere. */
export function mask(text) {
  return String(text)
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, (iban) => `IBAN…${iban.slice(-4)}`)
    .replace(/\d{6,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Chiave del gruppo: conto + verso + controparte (o le prime parole della descrizione, senza numeri). */
export function groupKey(row) {
  const who = (row.controparte || row.descrizione).toLowerCase().replace(/[^a-zà-ù\s*]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ')
  return `${row.origine} | ${row.conto} | ${row.importo < 0 ? 'uscite' : 'entrate'} | ${who || '?'}`
}

export function report(rows) {
  const groups = new Map()
  for (const r of rows) {
    const key = groupKey(r)
    const g = groups.get(key) ?? { key, count: 0, total: 0, sample: r, first: r.data, last: r.data }
    g.count += 1
    g.total += Number(r.importo)
    if (r.data < g.first) g.first = r.data
    if (r.data > g.last) g.last = r.data
    groups.set(key, g)
  }
  const euro = (c) => (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
  const lines = [`Finanze — da sistemare (${rows.length} movimenti, ${groups.size} gruppi)`, '']
  ;[...groups.values()]
    .sort((a, b) => b.count - a.count || Math.abs(b.total) - Math.abs(a.total))
    .forEach((g, i) => {
      lines.push(`${i + 1}. ${g.key} — ${g.count} mov., ${euro(g.total)}, dal ${g.first} al ${g.last}`)
      lines.push(`   es.: ${mask(g.sample.descrizione).slice(0, 110)}`)
    })
  return lines.join('\n') + '\n'
}

if (process.argv[1]?.endsWith('export-pending.mjs')) {
  try {
    const { db } = containers(resolve(import.meta.dirname, '..', '..'))
    const rows = JSON.parse(await psql(db, SQL))
    const out = process.argv[2] ?? join(homedir(), 'Downloads', 'Finanze da sistemare.txt')
    writeFileSync(out, report(rows))
    console.log(`✓ ${rows.length} movimenti da sistemare: elenco in ${out}`)
    console.log('  Mandalo a Claude: prepara decisioni.json per sistemarli tutti.')
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
