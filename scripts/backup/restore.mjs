// Ripristino di un backup: `npm run restore` (elenca), `npm run restore -- <nome>` oppure `-- --latest`.
// Sostituisce TUTTI i dati attuali con quelli del backup, dopo aver salvato un backup di sicurezza.
// Tutto in una transazione: se qualcosa va storto il database resta com'era.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { gunzipSync } from 'node:zlib'

import { dockerExec, listTables, schemaVersion } from './docker.mjs'
import { backupDir, containers, decrypt, listBackups, RESTORE_EPILOGUE, restorePrelude, SCHEMAS } from './lib.mjs'

const root = resolve(import.meta.dirname, '..', '..')
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

const args = process.argv.slice(2)
const yes = args.includes('--yes')
const dir = backupDir()
const backups = listBackups(dir)

try {
  const wanted = args.find((a) => !a.startsWith('--'))
  const chosen = args.includes('--latest') ? backups[0] : backups.find((b) => b.name === wanted)
  if (!chosen) {
    if (wanted) console.error(`✗ Backup "${wanted}" non trovato in ${dir}.`)
    console.log(backups.length > 0 ? `Backup disponibili in ${dir}:` : `Nessun backup in ${dir}.`)
    for (const b of backups.slice(0, 15)) console.log(`  ${b.name}`)
    if (backups.length > 0) console.log('\nPer ripristinare: npm run restore -- <nome>   (oppure -- --latest)')
    process.exit(wanted ? 1 : 0)
  }

  const info = JSON.parse(readFileSync(join(chosen.path, 'info.json'), 'utf8'))
  const { db, storage } = containers(root)
  const current = await schemaVersion(db)
  if (info.schemaVersion && current && info.schemaVersion > current) {
    throw new Error('Il backup viene da una versione più recente dell\'app: aggiorna prima l\'app (Avvia Finanze), poi riprova.')
  }

  const password = process.env.BACKUP_PASSWORD || ''
  const read = (file) => {
    const raw = readFileSync(join(chosen.path, info.encrypted ? `${file}.enc` : file))
    return info.encrypted ? decrypt(raw, password) : raw
  }
  // Decifra e verifica tutto PRIMA di toccare il database.
  const dump = gunzipSync(read('database.sql.gz'))
  const files = read('file.tar.gz')

  if (!yes) {
    console.log(`\nStai per sostituire TUTTI i dati attuali di Finanze con il backup ${chosen.name}.`)
    console.log('Prima salvo un backup di sicurezza dello stato attuale.')
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('Scrivi RIPRISTINA per continuare: ')
    rl.close()
    if (answer.trim() !== 'RIPRISTINA') {
      console.log('Annullato: nessun dato è stato modificato.')
      process.exit(0)
    }
  }

  const safety = spawnSync(process.execPath, [join(import.meta.dirname, 'backup.mjs')], { stdio: 'inherit' })
  if (safety.status !== 0) throw new Error('Backup di sicurezza non riuscito: ripristino annullato.')

  const tables = await listTables(db, SCHEMAS)
  const sql = Buffer.concat([Buffer.from(restorePrelude(tables)), dump, Buffer.from(RESTORE_EPILOGUE)])
  await dockerExec(db, ['psql', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, interactive: true })
  await dockerExec(storage, ['sh', '-c', 'find /mnt -mindepth 1 -delete && tar -xzf - -C /mnt'], { input: files, interactive: true })

  console.log(`✓ Ripristinato il backup ${chosen.name}. Ricarica l'app e rifai l'accesso.`)
} catch (error) {
  console.error(`✗ Ripristino non riuscito: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
