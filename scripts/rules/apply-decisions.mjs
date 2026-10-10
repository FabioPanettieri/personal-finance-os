// Applica le TUE decisioni di classificazione al database locale, senza farle a mano una per una:
//   npm run decisioni -- C:\percorso\decisioni.json
// Il file (fuori dal repository: contiene nomi di negozi e persone) elenca regole come
//   { "regole": [ { "testo": "mangopay", "dove": "controparte", "verso": "entrate",
//                   "tipo": "income", "categoria": "Vendite", "business": "voxel-studio",
//                   "fonte": "VOXEL Studio" } ],
//     "plafond": [ { "conto": "Carta di credito", "importo": 2000 } ] }
// Ogni regola diventa una regola "tua" in /rules (affidabilità 95%, si applica da sola).
// Poi in Finanze: Movimenti → Regole → "Applica ai movimenti da sistemare".
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { containers } from '../backup/lib.mjs'
import { psql } from '../backup/docker.mjs'

const TYPES = { income: 'income', entrata: 'income', expense: 'expense', spesa: 'expense', transfer: 'transfer', giroconto: 'transfer', investment: 'investment', investimento: 'investment', refund: 'refund', rimborso: 'refund' }
const FIELDS = { descrizione: 'description', description: 'description', controparte: 'counterparty', counterparty: 'counterparty' }
const DIRECTIONS = { entrate: 'in', in: 'in', uscite: 'out', out: 'out', tutti: 'any', any: 'any' }

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`)

export function ruleSql(rule, index) {
  const where = `regola ${index + 1}`
  const text = String(rule.testo ?? '').trim().toLowerCase()
  if (text.length < 3) throw new Error(`${where}: "testo" deve avere almeno 3 caratteri`)
  const type = TYPES[String(rule.tipo ?? '').toLowerCase()]
  if (!type) throw new Error(`${where}: "tipo" deve essere entrata, spesa, giroconto, investimento o rimborso`)
  const field = FIELDS[String(rule.dove ?? 'descrizione').toLowerCase()]
  if (!field) throw new Error(`${where}: "dove" deve essere descrizione o controparte`)
  const direction = DIRECTIONS[String(rule.verso ?? (type === 'income' || type === 'refund' ? 'entrate' : type === 'expense' ? 'uscite' : 'tutti')).toLowerCase()]
  if (!direction) throw new Error(`${where}: "verso" deve essere entrate, uscite o tutti`)
  const nature = type === 'transfer' ? 'transfer' : type === 'investment' ? 'investment' : rule.business ? 'business' : 'personal'
  // Categoria "Padre > Figlia" oppure solo "Padre".
  const [parent, child] = String(rule.categoria ?? '').split('>').map((s) => s.trim())
  const category = parent
    ? child
      ? `(select c.id from public.transaction_categories c join public.transaction_categories p on p.id = c.parent_id where c.user_id = u.id and p.name = ${q(parent)} and c.name = ${q(child)})`
      : `(select c.id from public.transaction_categories c where c.user_id = u.id and c.parent_id is null and c.name = ${q(parent)})`
    : 'null'
  const business = rule.business ? `(select b.id from public.businesses b where b.user_id = u.id and (b.slug = ${q(rule.business)} or b.name = ${q(rule.business)}))` : 'null'
  const source = type === 'income' && rule.fonte ? `(select s.id from public.income_sources s where s.user_id = u.id and s.name = ${q(rule.fonte)})` : 'null'
  const name = `Tua: “${text}”${direction === 'any' ? '' : direction === 'in' ? ' (entrate)' : ' (uscite)'} → ${rule.categoria ?? type}`.slice(0, 80)
  return `
do $$
declare v_cat uuid; v_bus uuid; v_src uuid; u record;
begin
  select id into u from auth.users where id = (select user_id from public.accounts group by user_id order by count(*) desc limit 1);
  select ${category}, ${business}, ${source} into v_cat, v_bus, v_src;
  if ${q(parent ?? '')} <> '' and v_cat is null then raise exception '${where}: categoria % non trovata', ${q(rule.categoria ?? '')}; end if;
  if ${q(rule.business ?? '')} <> '' and v_bus is null then raise exception '${where}: business % non trovato', ${q(rule.business ?? '')}; end if;
  delete from public.categorization_rules where user_id = u.id and name = ${q(name)};
  insert into public.categorization_rules (user_id, name, origin, priority, match_field, match_type, pattern, direction,
    set_type, set_nature, set_category_id, set_business_id, set_income_source_id, confidence)
  values (u.id, ${q(name)}, 'user', 10, '${field}', 'contains', ${q(text)}, '${direction}',
    '${type}', '${nature}', v_cat, v_bus, v_src, 0.95);
end $$;`
}

export function limitSql(entry, index) {
  const amount = Number(entry.importo)
  if (!entry.conto || !Number.isFinite(amount) || amount <= 0) throw new Error(`plafond ${index + 1}: servono "conto" e "importo" > 0`)
  return `update public.accounts set credit_limit_cents = ${Math.round(amount * 100)} where name = ${q(entry.conto)};`
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('apply-decisions.mjs')) {
  const file = process.argv[2]
  if (!file || !existsSync(file)) {
    console.error('Uso: npm run decisioni -- <file decisioni.json>')
    process.exit(1)
  }
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    const users = await psql(containers(resolve(import.meta.dirname, '..', '..')).db, 'select count(distinct user_id) from public.accounts')
    if (users !== '1') throw new Error(`nel database ci sono ${users} utenti con conti: lo script funziona solo con un utente`)
    const statements = [...(data.regole ?? []).map(ruleSql), ...(data.plafond ?? []).map(limitSql)]
    const { db } = containers(resolve(import.meta.dirname, '..', '..'))
    await psql(db, `begin; ${statements.join('\n')} commit;`)
    console.log(`✓ ${data.regole?.length ?? 0} regole salvate${data.plafond?.length ? `, plafond aggiornato` : ''}.`)
    console.log('  Ora in Finanze: Movimenti → Regole → "Applica ai movimenti da sistemare".')
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
