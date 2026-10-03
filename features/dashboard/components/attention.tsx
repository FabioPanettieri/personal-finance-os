import { CircleAlert, FileClock, FileUp } from 'lucide-react'
import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { formatIsoDate } from '@/lib/dates'
import type { ImportHealth, ReviewCounts } from '@/server/repositories/dashboard'

const SOURCE_LABELS = { ing: 'ING', revolut: 'Revolut', trade_republic: 'Trade Republic' } as const

/** Movimenti da verificare: mai nascosti, sempre raggiungibili con un clic. */
export function ReviewCard({ review }: { review: ReviewCounts }) {
  const total = review.transactions + review.importRows
  if (total === 0) return null
  return (
    <Card className="flex flex-col gap-3 border-warning/40 bg-warning-soft/60 p-4 sm:flex-row sm:items-center lg:p-5" data-testid="review-card">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
        <CircleAlert aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-fg">
          {total === 1 ? '1 movimento richiede attenzione' : `${total} movimenti richiedono attenzione`}
        </p>
        <p className="text-sm text-fg-muted">
          {[
            review.transactions > 0 && `${review.transactions} con classificazione da confermare`,
            review.importRows > 0 && `${review.importRows} in importazioni non ancora confermate`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {review.transactions > 0 ? (
          <Link href="/transactions?status=review" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-fg px-4 text-sm font-medium text-canvas hover:opacity-90">
            Verifica movimenti
          </Link>
        ) : null}
        {review.importRows > 0 ? (
          <Link href="/imports" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-strong px-4 text-sm font-medium text-fg hover:bg-surface-2">
            Importazioni
          </Link>
        ) : null}
      </div>
    </Card>
  )
}

/** Ultima importazione confermata per banca; nessuna data se non esiste. */
export function ImportHealthList({ imports }: { imports: ImportHealth[] }) {
  const sources = ['ing', 'revolut', 'trade_republic'] as const
  return (
    <ul aria-label="Ultime importazioni" className="divide-y divide-line">
      {sources.map((source) => {
        const item = imports.find((i) => i.source === source)
        return (
          <li key={source} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            {item ? <FileClock aria-hidden className="size-4 text-fg-subtle" /> : <FileUp aria-hidden className="size-4 text-fg-subtle" />}
            <span className="flex-1 text-sm font-medium text-fg">{SOURCE_LABELS[source]}</span>
            <span className="text-right text-xs text-fg-muted">
              {item ? (
                <>
                  {formatIsoDate(item.committedOn, 'numeric')}
                  <span className="block">{item.rowsImported === 1 ? '1 movimento' : `${item.rowsImported} movimenti`}</span>
                </>
              ) : (
                'Nessun import'
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
