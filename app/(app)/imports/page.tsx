import { ChevronRight, FileUp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { IMPORT_STATUS_LABELS, SOURCE_LABELS } from '@/features/imports/labels'
import { formatIsoDate, isIsoDate, isoDateInTimeZone } from '@/lib/dates'
import type { ImportSource } from '@/lib/imports/types'
import { requireUser } from '@/server/auth/session'
import { listImports } from '@/server/services/imports'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Importazioni' }

const statusTone = (status: string) =>
  status === 'committed' ? 'positive' : status === 'preview' ? 'warning' : status === 'failed' ? 'negative' : 'neutral'

export default async function ImportsPage() {
  await requireUser('/imports')
  const imports = await listImports(await createSupabaseServerClient())

  const newButton = (
    <Link
      href="/imports/new"
      className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
    >
      <FileUp aria-hidden className="size-4" />
      Importa CSV
    </Link>
  )

  return (
    <>
      <PageHeader title="Importazioni" description="Carica i CSV delle tue banche e consulta lo storico." actions={newButton} />
      {imports.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="Nessuna importazione"
          description="Carica il primo CSV di ING, Revolut o Trade Republic. Vedrai un’anteprima prima di importare."
          action={newButton}
        />
      ) : (
        <Card className="p-0 lg:p-0">
          <ul aria-label="Storico importazioni" className="divide-y divide-line">
            {imports.map((imp) => {
              const created = isoDateInTimeZone(new Date(imp.created_at))
              return (
                <li key={imp.id}>
                  <Link href={`/imports/${imp.id}`} className="flex min-h-[72px] items-center gap-4 px-4 py-3 hover:bg-surface-2 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-medium text-fg">{SOURCE_LABELS[imp.bank_profile as ImportSource] ?? imp.bank_profile}</p>
                        <Badge tone={statusTone(imp.status)}>{IMPORT_STATUS_LABELS[imp.status] ?? imp.status}</Badge>
                      </div>
                      <p className="truncate text-[13px] text-fg-muted">
                        {formatIsoDate(created)} · {imp.accountName}
                        {imp.fileName ? ` · ${imp.fileName}` : ''}
                      </p>
                      <p className="text-xs text-fg-subtle">
                        {imp.rows_total} transazioni · {imp.status === 'committed' ? `${imp.rows_imported} importate` : `${imp.rows_new} nuove`} ·{' '}
                        {imp.rows_duplicate} duplicate
                        {imp.period_start && imp.period_end && isIsoDate(imp.period_start) && isIsoDate(imp.period_end)
                          ? ` · ${formatIsoDate(imp.period_start)} – ${formatIsoDate(imp.period_end)}`
                          : ''}
                      </p>
                    </div>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}
