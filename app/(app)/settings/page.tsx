import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { requireUser } from '@/server/auth/session'
import { readBackupStatus } from '@/server/services/backup-status'

export const metadata: Metadata = { title: 'Impostazioni' }

type Section = { label: string; description: string; href: string }

const GROUPS: { title: string; sections: Section[] }[] = [
  {
    title: 'Tu',
    sections: [
      { label: 'Profilo e aspetto', description: 'Nome, fuso orario, tema chiaro o scuro', href: '/settings/profile' },
      { label: 'Sicurezza', description: 'Verifica in due passaggi, uscita', href: '/settings/security' },
      { label: 'Backup', description: 'Copie automatiche dei tuoi dati', href: '/settings/backup' },
    ],
  },
  {
    title: 'Dati',
    sections: [
      { label: 'Conti', description: 'Nomi, saldi iniziali, attivazione', href: '/accounts' },
      { label: 'Regole automatiche', description: 'Come vengono classificati i movimenti', href: '/rules' },
      { label: 'Import', description: 'Estratti conto importati', href: '/imports' },
      { label: 'Business', description: 'Attività e fonti di reddito', href: '/business' },
      { label: 'Investimenti', description: 'Titoli, valori e piani di accumulo', href: '/investments' },
      { label: 'Obiettivi', description: 'Traguardi di risparmio', href: '/goals' },
      { label: 'Report', description: 'Settimana, mese e anno', href: '/reports' },
    ],
  },
]

export default async function SettingsPage() {
  await requireUser('/settings')
  const backup = readBackupStatus()
  const backupBadge =
    backup.kind === 'ok' ? null : (
      <Badge tone="warning" data-testid="backup-badge">
        {backup.kind === 'none' ? 'Nessun backup' : 'Da aggiornare'}
      </Badge>
    )

  return (
    <>
      <PageHeader title="Impostazioni" />
      <div className="flex flex-col gap-6">
        {GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`settings-${group.title}`}>
            <h2 id={`settings-${group.title}`} className="mb-2 px-1 text-[13px] font-medium tracking-wide text-fg-muted uppercase">
              {group.title}
            </h2>
            <Card className="p-0 lg:p-0">
              <ul className="divide-y divide-line">
                {group.sections.map((section) => (
                  <li key={section.href}>
                    <Link href={section.href} className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-fg">{section.label}</span>
                        <span className="block truncate text-sm text-fg-muted">{section.description}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {section.href === '/settings/backup' ? backupBadge : null}
                        <ChevronRight aria-hidden className="size-4 text-fg-subtle" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}
      </div>
    </>
  )
}
