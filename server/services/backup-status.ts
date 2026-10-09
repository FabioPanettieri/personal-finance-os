import 'server-only'

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { backupStatus, defaultBackupDir, parseBackupName, type BackupStatus } from '@/lib/backup/status'

/** Cartella dei backup: la stessa che usa `npm run backup` (BACKUP_DIR in .env.local, altrimenti quella predefinita). */
export function backupFolder(): string {
  return process.env.BACKUP_DIR?.trim() || defaultBackupDir(process.platform, homedir())
}

/** Legge solo i nomi delle cartelle e info.json (mai il contenuto dei backup). */
export function readBackupStatus(now = new Date()): BackupStatus {
  const dir = backupFolder()
  try {
    if (!existsSync(dir)) return { kind: 'none' }
    const names = readdirSync(dir)
      .filter((n) => parseBackupName(n) && existsSync(join(dir, n, 'info.json')))
      .sort()
    const latest = names.at(-1)
    let encrypted = false
    if (latest) {
      try {
        encrypted = JSON.parse(readFileSync(join(dir, latest, 'info.json'), 'utf8')).encrypted === true
      } catch {
        encrypted = false
      }
    }
    return backupStatus(names, encrypted, now)
  } catch {
    return { kind: 'none' }
  }
}
