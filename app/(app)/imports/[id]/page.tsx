import { ArrowLeft, CheckCircle2, CircleAlert, Copy, FileText, Inbox } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { CommitBar } from '@/features/imports/components/commit-bar'
import { ImportOptionsProvider } from '@/features/imports/components/options-context'
import { RowActions } from '@/features/imports/components/row-actions'
import { IMPORT_STATUS_LABELS, SOURCE_LABELS, STATUS_LABELS, TYPE_LABELS } from '@/features/imports/labels'
import { idSchema } from '@/features/imports/schemas'
import { formatIsoDate, isIsoDate } from '@/lib/dates'
import { cents } from '@/lib/money'
import type { ImportSource, TransactionType } from '@/lib/imports/types'
import { cn } from '@/lib/utils/cn'
import { requireUser } from '@/server/auth/session'
import { loadClassificationData } from '@/server/repositories/import-context'
import { getImportDetail, type ImportDetail } from '@/server/services/imports'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Anteprima importazione' }

type Row = ImportDetail['rows'][number]
type Filter = 'all' | 'ready' | 'review' | 'duplicates' | 'excluded' | 'imported'

const FILTERS: { key: Filter; label: string; match: (r: Row) => boolean }[] = [
  { key: 'all', label: 'Tutte', match: () => true },
  { key: 'ready', label: 'Pronte', match: (r) => r.status === 'new' && !r.needsReview },
  { key: 'review', label: 'Da verificare', match: (r) => r.needsReview },
  { key: 'duplicates', label: 'Duplicate', match: (r) => r.status === 'duplicate' },
  { key: 'excluded', label: 'Escluse', match: (r) => r.status === 'skipped' || r.status === 'invalid' },
  { key: 'imported', label: 'Importate', match: (r) => r.status === 'imported' },
]

const MAX_RENDERED = 500

function isTrade(source: ImportSource, row: Row): boolean {
  const raw = row.raw as Record<string, string>
  return source === 'trade_republic' && (raw.category ?? '').toUpperCase() === 'TRADING'
}

function statusBadge(row: Row) {
  if (row.needsReview) return <Badge tone="warning">Da verificare</Badge>
  const tone = row.status === 'new' || row.status === 'imported' ? 'positive' : row.status === 'invalid' ? 'negative' : 'neutral'
  return <Badge tone={tone}>{row.status === 'new' ? 'Pronta' : (STATUS_LABELS[row.status] ?? row.status)}</Badge>
}

function confidenceLabel(row: Row): string {
  if (!row.proposed_type) return '—'
  if (row.categorization_method === 'manual') return 'Manuale'
  return `${Math.round(Number(row.categorization_confidence ?? 0) * 100)}%`
}

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string }>
}) {
  const { id } = await params
  const { filter: filterParam } = await searchParams
  await requireUser(`/imports/${id}`)
  if (!idSchema.safeParse(id).success) notFound()

  const db = await createSupabaseServerClient()
  const [detail, options] = await Promise.all([getImportDetail(db, id), loadClassificationData(db)])
  if (!detail) notFound()

  const { record, rows } = detail
  const source = record.bank_profile as ImportSource
  const isPreview = record.status === 'preview'
  const categoryLabel = new Map(options.categories.map((c) => [c.id, c.label]))
  const businessLabel = new Map(options.businesses.map((b) => [b.id, b.label]))
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.match).length])) as Record<Filter, number>
  const filter = FILTERS.find((f) => f.key === filterParam) ?? FILTERS[0]!
  const visible = rows.filter(filter.match)
  const ready = counts.ready
  const toReview = counts.review

  const totals = rows.reduce(
    (acc, r) => {
      if (!['new', 'imported'].includes(r.status) || r.amount_cents === null || !r.proposed_type) return acc
      if (r.proposed_type === 'income') acc.income += r.amount_cents
      else if (r.proposed_type === 'expense') acc.expense += -r.amount_cents
      else if (r.proposed_type === 'refund') acc.expense -= r.amount_cents
      else if (!isTrade(source, r)) acc.transfer += Math.abs(r.amount_cents)
      return acc
    },
    { income: 0, expense: 0, transfer: 0 },
  )

  return (
    <ImportOptionsProvider value={{ categories: options.categories, businesses: options.businesses, incomeSources: options.incomeSources }}>
      <Link href="/imports" className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" />
        Importazioni
      </Link>

      <header className="mb-6 flex flex-col gap-2 lg:mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-fg lg:text-[28px]">
            {isPreview ? 'Anteprima' : 'Importazione'} · {SOURCE_LABELS[source]}
          </h1>
          <Badge tone={record.status === 'committed' ? 'positive' : record.status === 'preview' ? 'warning' : 'neutral'}>
            {IMPORT_STATUS_LABELS[record.status] ?? record.status}
          </Badge>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
          <FileText aria-hidden className="size-4" />
          {detail.file?.name ?? 'File'} · conto {detail.accountName}
          {record.period_start && record.period_end && isIsoDate(record.period_start) && isIsoDate(record.period_end)
            ? ` · ${formatIsoDate(record.period_start)} – ${formatIsoDate(record.period_end)}`
            : ''}
        </p>
      </header>

      <section aria-label="Riepilogo" className="mb-4 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-5 lg:gap-4">
        <Card className="p-4">
          <p className="text-xs text-fg-muted uppercase">Trovate</p>
          <p className="text-2xl font-semibold text-fg tabular">{record.rows_total}</p>
          <p className="text-xs text-fg-subtle">transazioni nel file</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-xs text-fg-muted uppercase"><CheckCircle2 aria-hidden className="size-3.5 text-positive" />{isPreview ? 'Nuove' : 'Importate'}</p>
          <p className="text-2xl font-semibold text-fg tabular">{isPreview ? ready : counts.imported}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-xs text-fg-muted uppercase"><Copy aria-hidden className="size-3.5" />Duplicate</p>
          <p className="text-2xl font-semibold text-fg tabular">{counts.duplicates}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-xs text-fg-muted uppercase"><CircleAlert aria-hidden className="size-3.5 text-warning" />Da verificare</p>
          <p className="text-2xl font-semibold text-fg tabular">{toReview}</p>
        </Card>
        <Card className="col-span-2 p-4 lg:col-span-1">
          <p className="text-xs text-fg-muted uppercase">Escluse</p>
          <p className="text-2xl font-semibold text-fg tabular">{counts.excluded}</p>
          <p className="text-xs text-fg-subtle">non valide o fuori conto</p>
        </Card>
      </section>

      <Card className="mb-4 flex flex-wrap gap-x-8 gap-y-2 p-4 text-sm lg:mb-6">
        <span className="text-fg-muted">Entrate <Money value={cents(totals.income)} currency={detail.accountCurrency} className="ml-1 font-medium text-fg" /></span>
        <span className="text-fg-muted">Uscite <Money value={cents(totals.expense)} currency={detail.accountCurrency} className="ml-1 font-medium text-fg" /></span>
        <span className="text-fg-muted">Trasferimenti <Money value={cents(totals.transfer)} currency={detail.accountCurrency} className="ml-1 font-medium text-fg" /></span>
      </Card>

      <nav aria-label="Filtra righe" className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0 || f.key === filter.key).map((f) => (
          <Link
            key={f.key}
            href={f.key === 'all' ? `/imports/${id}` : `/imports/${id}?filter=${f.key}`}
            aria-current={filter.key === f.key ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm',
              filter.key === f.key ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-muted hover:text-fg',
            )}
          >
            {f.label} <span className="tabular opacity-70">{counts[f.key]}</span>
          </Link>
        ))}
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nessuna riga"
          description={filter.key === 'review' ? 'Non ci sono più righe da verificare.' : 'Nessuna riga corrisponde a questo filtro.'}
        />
      ) : (
        <Card className="p-0 lg:p-0">
          <div className="hidden grid-cols-[7rem_minmax(0,1fr)_8rem_9rem_minmax(0,11rem)_5rem_8rem] gap-3 border-b border-line px-5 py-2 text-xs font-medium text-fg-muted lg:grid">
            <span>Data</span>
            <span>Descrizione</span>
            <span className="text-right">Importo</span>
            <span>Tipo</span>
            <span>Categoria · Business</span>
            <span>Confid.</span>
            <span>Stato</span>
          </div>
          <ul aria-label="Righe del file" className="divide-y divide-line">
            {visible.slice(0, MAX_RENDERED).map((row) => {
              const raw = row.raw as Record<string, string>
              const trade = isTrade(source, row)
              const type = row.proposed_type as TransactionType | null
              const notes = Array.isArray(row.errors) ? (row.errors as string[]) : []
              const editable = isPreview && row.status === 'new'
              return (
                <li key={row.id} data-row-index={row.row_index} className="px-4 py-3 sm:px-5">
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 lg:grid-cols-[7rem_minmax(0,1fr)_8rem_9rem_minmax(0,11rem)_5rem_8rem] lg:items-center">
                    <span className="order-2 text-xs text-fg-muted lg:order-none lg:text-sm">
                      {row.booked_on && isIsoDate(row.booked_on) ? formatIsoDate(row.booked_on, 'numeric') : '—'}
                    </span>
                    <span className="order-1 line-clamp-2 min-w-0 text-sm font-medium break-words text-fg lg:order-none" title={row.description ?? undefined}>
                      {row.description ?? Object.values(raw).filter(Boolean).slice(0, 3).join(' · ')}
                    </span>
                    <span className="order-1 text-right text-sm font-medium lg:order-none">
                      {row.amount_cents !== null ? <Money value={cents(row.amount_cents)} currency={row.currency ?? detail.accountCurrency} tone="signed" /> : '—'}
                    </span>
                    <span className="order-3 text-xs text-fg lg:order-none lg:text-sm">
                      {type ? (trade ? 'Operazione titoli' : TYPE_LABELS[type]) : <span className="text-fg-subtle">Non classificata</span>}
                    </span>
                    <span className="order-3 min-w-0 truncate text-xs text-fg-muted lg:order-none lg:text-sm">
                      {[row.proposed_category_id && categoryLabel.get(row.proposed_category_id), row.proposed_business_id && businessLabel.get(row.proposed_business_id)]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </span>
                    <span className="order-4 text-xs text-fg-muted lg:order-none lg:text-sm">{confidenceLabel(row)}</span>
                    <span className="order-4 justify-self-end lg:order-none lg:justify-self-start">{statusBadge(row)}</span>
                  </div>
                  {notes.length > 0 ? (
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-fg-subtle">
                      {notes.map((note) => (
                        <li key={note}>· {note}</li>
                      ))}
                    </ul>
                  ) : null}
                  {isPreview ? (
                    <div className="mt-2">
                      <RowActions
                        row={{
                          id: row.id,
                          importId: id,
                          amount: row.amount_cents ?? 0,
                          type,
                          categoryId: row.proposed_category_id,
                          businessId: row.proposed_business_id,
                          incomeSourceId: row.proposed_income_source_id,
                          canEdit: editable && !trade,
                          canConfirm: editable && row.needsReview && Boolean(type),
                          canExclude: row.status === 'new' || row.status === 'possible_duplicate',
                          canInclude: (row.status === 'skipped' && Boolean(row.fingerprint)) || row.status === 'possible_duplicate',
                        }}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {visible.length > MAX_RENDERED ? (
            <p className="border-t border-line px-5 py-3 text-xs text-fg-muted">
              Mostrate le prime {MAX_RENDERED} righe di {visible.length}. Usa i filtri per restringere.
            </p>
          ) : null}
        </Card>
      )}

      {isPreview ? <CommitBar importId={id} ready={ready} toReview={toReview} /> : null}
      {record.status === 'committed' ? (
        <p className="mt-6 text-sm text-fg-muted">
          Movimenti visibili nel{' '}
          <Link href={`/accounts/${record.account_id}`} className="font-medium text-accent hover:underline">
            conto {detail.accountName}
          </Link>
          .
        </p>
      ) : null}
    </ImportOptionsProvider>
  )
}
