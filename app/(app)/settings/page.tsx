import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

export const metadata: Metadata = { title: 'Impostazioni' }

type Section = { label: string; description: string; href?: string; sprint?: number }

const SECTIONS: Section[] = [
  { label: 'Sicurezza', description: 'Sessione, verifica in due passaggi, uscita', href: '/settings/security' },
  { label: 'Conti', description: 'Nomi, saldi iniziali, attivazione', href: '/accounts' },
  { label: 'Profilo', description: 'Nome, valuta, fuso orario', sprint: 12 },
  { label: 'Import CSV', description: 'Mapping delle colonne per banca', sprint: 3 },
  { label: 'Categorie', description: 'Categorie e sottocategorie', sprint: 4 },
  { label: 'Business', description: 'VOXEL Studio, Il Progettista Meccanico…', sprint: 7 },
  { label: 'Fonti di reddito', description: 'Stipendio, YouTube, altri guadagni', sprint: 7 },
  { label: 'Obiettivi', description: 'Traguardi di risparmio', sprint: 10 },
  { label: 'Regole automatiche', description: 'Categorizzazione automatica', sprint: 11 },
  { label: 'Preferenze e tema', description: 'Aspetto e formati', sprint: 12 },
]

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Impostazioni" />
      <Card className="p-0 lg:p-0">
        <ul className="divide-y divide-line">
          {SECTIONS.map((section) => {
            const content = (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{section.label}</p>
                  <p className="truncate text-sm text-fg-muted">{section.description}</p>
                </div>
                {section.href ? (
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                ) : (
                  <Badge>Sprint {section.sprint}</Badge>
                )}
              </>
            )
            return (
              <li key={section.label}>
                {section.href ? (
                  <Link
                    href={section.href}
                    className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    {content}
                  </Link>
                ) : (
                  <div aria-disabled="true" className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 opacity-70">
                    {content}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}
