// Diagnosi di Finanze sul PC: `npm run diagnosi` → scrive "Finanze diagnosi.txt" nella cartella Download.
// Controlla versione del codice, build, database, importazioni, movimenti, regole e conti.
// Nessun dato personale: solo conteggi, somme per conto e stati (niente descrizioni, nomi o IBAN).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { psql } from './backup/docker.mjs'
import { containers } from './backup/lib.mjs'

const root = resolve(import.meta.dirname, '..')
const lines = []
const ok = (text) => lines.push(`✓ ${text}`)
const ko = (text) => lines.push(`✗ ${text}`)
const info = (text) => lines.push(`  ${text}`)

function newestMtime(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(path))
    else if (/\.(tsx?|css)$/.test(entry.name)) newest = Math.max(newest, statSync(path).mtimeMs)
  }
  return newest
}

async function main() {
  lines.push(`Finanze — diagnosi del ${new Date().toLocaleString('it-IT')}`, `Cartella: ${root}`, '')

  // 1. Versione del codice: le funzioni più recenti sono presenti?
  lines.push('1. Versione del codice')
  const commitBar = readFileSync(join(root, 'features/imports/components/commit-bar.tsx'), 'utf8')
  if (commitBar.includes('le regole ci riprovano')) ok('codice aggiornato (conferma import con righe da verificare)')
  else ko('codice VECCHIO: la cartella non è l’ultima versione scaricata da GitHub')
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  info(`ultima migration nella cartella: ${migrations.at(-1)}`)

  // 2. Build: l'app in funzione è stata ricompilata dopo l'aggiornamento?
  lines.push('', '2. Build dell’app')
  const buildId = join(root, '.next', 'BUILD_ID')
  if (!existsSync(buildId)) ko('nessuna build (.next/BUILD_ID mancante): avvia con "Avvia Finanze"')
  else {
    const built = statSync(buildId).mtimeMs
    const source = Math.max(newestMtime(join(root, 'app')), newestMtime(join(root, 'features')), newestMtime(join(root, 'lib')))
    if (built >= source) ok(`build del ${new Date(built).toLocaleString('it-IT')}, più recente del codice`)
    else ko(`build VECCHIA (${new Date(built).toLocaleString('it-IT')}): il codice è più nuovo. Chiudi Finanze e riapri "Avvia Finanze"`)
  }

  // 3. Database
  lines.push('', '3. Database')
  let db
  try {
    db = containers(root).db
    const applied = await psql(db, 'select max(version) from supabase_migrations.schema_migrations')
    const expected = migrations.at(-1).split('_')[0]
    if (applied === expected) ok(`migration applicate fino alla ${applied}`)
    else ko(`migration applicate fino alla ${applied}, ma la cartella arriva alla ${expected}: riapri "Avvia Finanze"`)
  } catch (error) {
    ko(`database non raggiungibile: ${error.message}. Docker Desktop è aperto?`)
    return
  }
  const users = await psql(db, 'select count(*) from auth.users')
  info(`utenti: ${users}`)

  // 4. Importazioni
  lines.push('', '4. Importazioni')
  const imports = await psql(
    db,
    `select a.name || ' | ' || i.status || ' | ' || count(*) || ' import | righe nuove ' ||
            coalesce(sum((select count(*) from public.import_rows r where r.import_id = i.id and r.status = 'new')), 0) ||
            ' | da verificare ' || coalesce(sum((select count(*) from public.import_rows r where r.import_id = i.id and r.status = 'new'
              and (r.proposed_type is null or (r.categorization_method <> 'manual' and coalesce(r.categorization_confidence, 0) < 0.6)))), 0)
     from public.imports i join public.accounts a on a.id = i.account_id group by a.name, i.status order by 1`,
  )
  for (const l of imports.split('\n').filter(Boolean)) info(l)
  const previews = Number(await psql(db, "select count(*) from public.imports where status = 'preview'"))
  if (previews > 0) ko(`${previews} importazioni ancora in ANTEPRIMA: i loro movimenti non sono nei conti. Aprile da Importa → Storico e premi "Conferma importazione"`)
  else ok('nessuna importazione in sospeso')

  // 5. Movimenti per conto
  lines.push('', '5. Movimenti per conto (numero, saldo, da sistemare, primo e ultimo giorno)')
  const accounts = await psql(
    db,
    `select a.name || ' | ' || count(t.id) || ' mov. | saldo ' || to_char(coalesce(b.balance_cents, 0) / 100.0, 'FM999G999G990D00') ||
            ' | da sistemare ' || count(t.id) filter (where not t.is_categorized) ||
            ' | ' || coalesce(min(t.booked_on)::text, '-') || ' → ' || coalesce(max(t.booked_on)::text, '-') ||
            ' | iban ' || case when a.iban is null then 'no' else 'sì' end ||
            case when a.credit_limit_cents is not null then ' | plafond ' || (a.credit_limit_cents / 100) else '' end
     from public.accounts a left join public.transactions t on t.account_id = a.id left join public.account_balances b on b.account_id = a.id
     group by a.name, a.sort_order, b.balance_cents, a.iban, a.credit_limit_cents order by a.sort_order`,
  )
  for (const l of accounts.split('\n').filter(Boolean)) info(l)

  // 6. Tipi e business
  lines.push('', '6. Movimenti per tipo e business')
  const types = await psql(db, `select type || ': ' || count(*) || ' (' || to_char(sum(amount_cents) / 100.0, 'FM999G999G990D00') || ')' from public.transactions group by type order by type`)
  for (const l of types.split('\n').filter(Boolean)) info(l)
  const biz = await psql(
    db,
    `select b.name || ': ' || count(t.id) || ' mov., entrate ' || to_char(coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0) / 100.0, 'FM999G999G990D00')
     from public.businesses b left join public.transactions t on t.business_id = b.id group by b.name, b.sort_order order by b.sort_order`,
  )
  for (const l of biz.split('\n').filter(Boolean)) info(l)

  // 7. Regole
  lines.push('', '7. Regole')
  const rules = await psql(
    db,
    `select origin || ': ' || count(*) || ' (attive ' || count(*) filter (where is_active) || ')' from public.categorization_rules group by origin order by origin`,
  )
  for (const l of rules.split('\n').filter(Boolean)) info(l)
  const mine = Number(await psql(db, "select count(*) from public.categorization_rules where name like 'Tua:%'"))
  if (mine > 0) ok(`${mine} regole dal file decisioni`)
  else ko('nessuna regola dal file decisioni: lancia npm run decisioni -- "<percorso>\\decisioni.json"')
  const giro = Number(await psql(db, "select count(*) from public.categorization_rules where name like 'Giroconto:%'"))
  info(`regole giroconto imparate: ${giro}`)
}

try {
  await main()
} catch (error) {
  ko(`errore durante la diagnosi: ${error instanceof Error ? error.message : error}`)
}
const out = process.argv[2] ?? join(homedir(), 'Downloads', 'Finanze diagnosi.txt')
writeFileSync(out, `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
console.log(`\nSalvato in ${out}: mandalo a Claude.`)
