import { DatabaseBackup, Lock, LockOpen } from 'lucide-react'
import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { BACKUP_STALE_DAYS } from '@/lib/backup/status'
import { requireUser } from '@/server/auth/session'
import { backupFolder, readBackupStatus } from '@/server/services/backup-status'

export const metadata: Metadata = { title: 'Backup' }

const WHEN = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short' })

function ago(days: number): string {
  return days === 0 ? 'oggi' : days === 1 ? 'ieri' : `${days} giorni fa`
}

/** Stato dei backup automatici e istruzioni per ripristinarli (docs/backup.md). */
export default async function BackupSettingsPage() {
  await requireUser('/settings/backup')
  const status = readBackupStatus()

  return (
    <>
      <PageHeader title="Backup" description="Una copia dei tuoi dati fuori dal database, fatta in automatico a ogni avvio (una al giorno)." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="backup-status">
          <CardHeader title="Ultimo backup" />
          {status.kind === 'none' ? (
            <div className="flex flex-col gap-2 text-sm">
              <Badge tone="warning">Nessun backup trovato</Badge>
              <p className="text-fg-muted">
                Si crea da solo al prossimo avvio con <strong className="text-fg">Avvia Finanze</strong> o con l’avvio automatico. Oppure subito, dalla cartella
                dell’app: <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run backup</code>
              </p>
            </div>
          ) : (
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-fg-muted">Quando</dt>
                <dd className="text-right font-medium text-fg">
                  {WHEN.format(status.last)} · {ago(status.days)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-fg-muted">Stato</dt>
                <dd>
                  {status.kind === 'ok' ? (
                    <Badge tone="positive">Aggiornato</Badge>
                  ) : (
                    <Badge tone="warning">Più vecchio di {BACKUP_STALE_DAYS} giorni</Badge>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-fg-muted">Cifratura</dt>
                <dd className="inline-flex items-center gap-1.5 font-medium text-fg">
                  {status.encrypted ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
                  {status.encrypted ? 'Con password' : 'Senza password'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-fg-muted">Copie conservate</dt>
                <dd className="font-medium text-fg tabular">{status.count}</dd>
              </div>
            </dl>
          )}
          <p className="mt-4 break-all text-xs text-fg-subtle">
            Cartella: <span data-testid="backup-folder">{backupFolder()}</span>
          </p>
        </Card>

        <Card>
          <CardHeader title="Come funziona" />
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-fg-muted">
            <li>Ogni giorno, all’avvio, salva movimenti, conti, regole, obiettivi, account e i file degli estratti conto importati.</li>
            <li>Tiene le ultime 30 copie e cancella da solo le più vecchie.</li>
            <li>Prima di ogni ripristino salva una copia dello stato attuale: non si perde nulla.</li>
            <li>
              Per una seconda copia sicura imposta una cartella su chiavetta USB o OneDrive con <code>BACKUP_DIR</code> e una password con{' '}
              <code>BACKUP_PASSWORD</code> in <code>.env.local</code>. Senza la password il backup cifrato non si apre: scrivila su carta.
            </li>
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Ripristinare un backup" description="Sostituisce tutti i dati attuali con quelli del backup scelto." />
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-fg-muted">
            <li>Apri PowerShell nella cartella dell’app, con Docker Desktop aperto.</li>
            <li>
              <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run restore</code> mostra i backup disponibili.
            </li>
            <li>
              <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run restore -- finanze-AAAA-MM-GG-HHMM</code> (oppure{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5">-- --latest</code>), poi scrivi RIPRISTINA.
            </li>
            <li>Ricarica l’app e rifai l’accesso.</li>
          </ol>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-fg-subtle">
            <DatabaseBackup aria-hidden className="size-4" />
            Dettagli in docs/backup.md
          </p>
        </Card>
      </div>
    </>
  )
}
