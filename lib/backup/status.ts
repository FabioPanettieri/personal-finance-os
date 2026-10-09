/**
 * Stato dei backup per l'app (Impostazioni e avviso in Home). Stesse regole di
 * scripts/backup/lib.mjs: cartelle "finanze-AAAA-MM-GG-HHMM" con info.json.
 */
export const BACKUP_STALE_DAYS = 7

export type BackupStatus =
  | { kind: 'none' }
  | { kind: 'ok' | 'stale'; last: Date; days: number; count: number; encrypted: boolean }

const NAME_RE = /^finanze-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(?:-\d+)?$/

export function parseBackupName(name: string): Date | null {
  const m = NAME_RE.exec(name)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number]
  return new Date(y, mo - 1, d, h, mi)
}

export function defaultBackupDir(platform: string, home: string): string {
  const sep = platform === 'win32' ? '\\' : '/'
  return platform === 'win32' ? [home, 'Documents', 'Finanze backup'].join(sep) : [home, 'finanze-backup'].join(sep)
}

/** `backups`: nomi delle cartelle complete, con il flag "cifrato" del più recente. */
export function backupStatus(names: string[], latestEncrypted: boolean, now: Date): BackupStatus {
  const dates = names
    .map(parseBackupName)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())
  const last = dates[0]
  if (!last) return { kind: 'none' }
  const days = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000))
  return { kind: days >= BACKUP_STALE_DAYS ? 'stale' : 'ok', last, days, count: dates.length, encrypted: latestEncrypted }
}
