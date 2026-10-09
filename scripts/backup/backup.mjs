// Backup di Finanze: `npm run backup` (oppure `npm run backup -- --daily`, che salta se c'è già un backup recente).
// Copia dati e file importati da Supabase locale (Docker) in BACKUP_DIR, tiene gli ultimi BACKUP_KEEP.
// Con BACKUP_PASSWORD in .env.local i file sono cifrati (AES-256-GCM): senza password non si leggono.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { dockerExec, schemaVersion } from './docker.mjs'
import {
  backupDir,
  backupName,
  containers,
  dirSize,
  encrypt,
  formatSize,
  isRecent,
  keepCount,
  listBackups,
  pgDumpArgs,
  toPrune,
} from './lib.mjs'

const root = resolve(import.meta.dirname, '..', '..')
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

const dir = backupDir()
const daily = process.argv.includes('--daily')
const password = process.env.BACKUP_PASSWORD || ''

try {
  const latest = listBackups(dir)[0]
  if (daily && latest && isRecent(latest.date)) {
    console.log(`✓ Backup di oggi già presente (${latest.name}): nulla da fare.`)
    process.exit(0)
  }

  const { db, storage } = containers(root)
  console.log('Backup di Finanze in corso…')
  const version = await schemaVersion(db)
  const dump = gzipSync(await dockerExec(db, pgDumpArgs()))
  // I file originali degli import (estratti conto): servono per rifare un import da zero.
  const files = await dockerExec(storage, ['tar', '-czf', '-', '-C', '/mnt', '.'])

  mkdirSync(dir, { recursive: true })
  let name = backupName()
  for (let i = 2; existsSync(join(dir, name)); i++) name = `${backupName()}-${i}`
  const partial = join(dir, `${name}.partial`)
  rmSync(partial, { recursive: true, force: true })
  mkdirSync(partial)
  const suffix = password ? '.enc' : ''
  writeFileSync(join(partial, `database.sql.gz${suffix}`), password ? encrypt(dump, password) : dump)
  writeFileSync(join(partial, `file.tar.gz${suffix}`), password ? encrypt(files, password) : files)
  writeFileSync(
    join(partial, 'info.json'),
    `${JSON.stringify({ app: 'Finanze', format: 1, createdAt: new Date().toISOString(), schemaVersion: version, encrypted: Boolean(password) }, null, 2)}\n`,
  )
  // La cartella prende il nome definitivo solo a backup completo.
  renameSync(partial, join(dir, name))

  const all = listBackups(dir).map((b) => b.name)
  for (const old of toPrune(all, keepCount())) rmSync(join(dir, old), { recursive: true, force: true })

  console.log(`✓ Backup salvato: ${join(dir, name)} (${formatSize(dirSize(join(dir, name)))}${password ? ', cifrato' : ''})`)
  if (!password) console.log('  Suggerimento: imposta BACKUP_PASSWORD in .env.local per cifrarlo (vedi docs/backup.md).')
} catch (error) {
  console.error(`✗ Backup non riuscito: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
