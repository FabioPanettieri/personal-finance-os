// Logica comune di backup e ripristino (senza dipendenze, gira su Windows, macOS e Linux).
// Un backup è una cartella "finanze-AAAA-MM-GG-HHMM" con:
//   database.sql.gz[.enc]  dati di public, auth e storage (pg_dump --data-only)
//   file.tar.gz[.enc]      i file originali degli import (storage locale)
//   info.json              data, versione del database, cifrato sì/no (nessun dato personale)
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const BACKUP_PREFIX = 'finanze-'
export const DEFAULT_KEEP = 30
/** Con --daily un backup più recente di così basta: niente doppioni a ogni riavvio. */
export const DAILY_MIN_HOURS = 20

const MAGIC = Buffer.from('FINENC1\n')
const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16

/** Tabelle gestite dai servizi Supabase: non si salvano e non si svuotano mai. */
export const SKIPPED_TABLES = ['auth.schema_migrations', 'storage.migrations']
/** Sessioni e codici temporanei: dopo un ripristino si rifà l'accesso. */
export const VOLATILE_TABLES = [
  'auth.sessions',
  'auth.refresh_tokens',
  'auth.mfa_amr_claims',
  'auth.mfa_challenges',
  'auth.flow_state',
  'auth.one_time_tokens',
  'auth.webauthn_challenges',
]
export const SCHEMAS = ['public', 'auth', 'storage']

/** Cartella predefinita: Documenti\Finanze backup su Windows, ~/finanze-backup altrove. Mai dentro il repository. */
export function defaultBackupDir(platform = process.platform, home = homedir()) {
  return platform === 'win32' ? join(home, 'Documents', 'Finanze backup') : join(home, 'finanze-backup')
}

export function backupDir(env = process.env) {
  return env.BACKUP_DIR?.trim() || defaultBackupDir()
}

export function keepCount(env = process.env) {
  const n = Number.parseInt(env.BACKUP_KEEP ?? '', 10)
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_KEEP
}

/** "finanze-2026-10-09-1432" in ora locale: si ordina alfabeticamente come per data. */
export function backupName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${BACKUP_PREFIX}${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
}

const NAME_RE = /^finanze-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(?:-\d+)?$/

export function parseBackupName(name) {
  const m = NAME_RE.exec(name)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  return new Date(y, mo - 1, d, h, mi)
}

/** Backup completi (con info.json) dal più recente al più vecchio. */
export function listBackups(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => parseBackupName(name) && existsSync(join(dir, name, 'info.json')))
    .sort()
    .reverse()
    .map((name) => ({ name, path: join(dir, name), date: parseBackupName(name) }))
}

/** I backup da cancellare per tenerne al massimo `keep` (i più vecchi). */
export function toPrune(names, keep) {
  return [...names].sort().reverse().slice(keep)
}

export function isRecent(date, now = new Date(), hours = DAILY_MIN_HOURS) {
  return now.getTime() - date.getTime() < hours * 3_600_000
}

/** Cifratura AES-256-GCM con chiave derivata dalla password (scrypt). Formato: MAGIC | salt | iv | dati | tag. */
export function encrypt(data, password) {
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt), iv)
  const body = Buffer.concat([cipher.update(data), cipher.final()])
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()])
}

export function isEncrypted(data) {
  return data.subarray(0, MAGIC.length).equals(MAGIC)
}

export function decrypt(data, password) {
  if (!isEncrypted(data)) throw new Error('Il file non è cifrato con il formato di Finanze.')
  let offset = MAGIC.length
  const salt = data.subarray(offset, (offset += SALT_BYTES))
  const iv = data.subarray(offset, (offset += IV_BYTES))
  const body = data.subarray(offset, data.length - TAG_BYTES)
  const tag = data.subarray(data.length - TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(body), decipher.final()])
  } catch {
    throw new Error('Password del backup sbagliata (oppure file danneggiato).')
  }
}

function deriveKey(password, salt) {
  if (!password) throw new Error('Serve la password del backup (BACKUP_PASSWORD).')
  return scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

/** Nomi dei container della CLI Supabase per questo progetto (project_id in supabase/config.toml). */
export function containers(root) {
  const config = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8')
  const id = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1]
  if (!id) throw new Error('project_id non trovato in supabase/config.toml')
  return { db: `supabase_db_${id}`, storage: `supabase_storage_${id}` }
}

/** Argomenti di pg_dump: solo dati, schemi dell'app, senza tabelle di servizio né sessioni. */
export function pgDumpArgs() {
  return [
    'pg_dump',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '--data-only',
    '--no-owner',
    '--no-privileges',
    ...SCHEMAS.flatMap((s) => ['--schema', s]),
    ...[...SKIPPED_TABLES, ...VOLATILE_TABLES].flatMap((t) => ['--exclude-table-data', t]),
  ]
}

/**
 * SQL che apre il ripristino: in una sola transazione svuota le tabelle dell'app
 * (trigger e vincoli sospesi con session_replication_role, come fa pg_restore),
 * poi il contenuto del dump, poi il COMMIT. Se qualcosa fallisce non cambia nulla.
 */
export function restorePrelude(tables) {
  const list = tables.filter((t) => !SKIPPED_TABLES.includes(t)).map(quoteTable)
  return [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    'SET session_replication_role = replica;',
    list.length > 0 ? `TRUNCATE ${list.join(', ')} CASCADE;` : '',
    '',
  ].join('\n')
}

export const RESTORE_EPILOGUE = '\nSET session_replication_role = DEFAULT;\nCOMMIT;\n'

function quoteTable(qualified) {
  const [schema, table] = qualified.split('.')
  return `"${schema}"."${table}"`
}

/** Mostra la dimensione in modo leggibile (es. "1,4 MB"). */
export function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`
}

export function dirSize(dir) {
  return readdirSync(dir).reduce((sum, name) => sum + statSync(join(dir, name)).size, 0)
}
