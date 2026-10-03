import { ArrowLeftRight, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { PageHeader } from '@/components/ui/page-header'
import { formatIsoDate } from '@/lib/dates'
import { parseTransactionFilters, transactionsHref, TYPE_FILTER_LABELS, type TransactionFilters } from '@/lib/transactions/filters'
import { cn } from '@/lib/utils/cn'
import { requireUser } from '@/server/auth/session'
import { listAccounts } from '@/server/repositories/accounts'
import { businessList, categoryTree, incomeSourceList } from '@/server/repositories/dashboard'
import { listTransactions } from '@/server/repositories/transactions'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Transazioni' }

/**
 * Elenco dei movimenti con filtri nell'URL (gli stessi usati dai link della
 * dashboard). Sola lettura in questo sprint: la modifica e le azioni di massa
 * arrivano con l'explorer completo.
 */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('/transactions')
  const filters = parseTransactionFilters(await searchParams)
  const db = await createSupabaseServerClient()
  const [accounts, tree, businesses, sources] = await Promise.all([listAccounts(db), categoryTree(db), businessList(db), incomeSourceList(db)])

  // Una macro-categoria comprende le sue sottocategorie (come nel grafico della dashboard).
  const categoryIds =
    filters.categoryId && filters.categoryId !== 'none' ? [filters.categoryId, ...tree.filter((c) => c.parentId === filters.categoryId).map((c) => c.id)] : null
  const result = await listTransactions(db, filters, categoryIds)
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize))

  const chips: { label: string; remove: Partial<TransactionFilters> }[] = []
  if (filters.from || filters.to)
    chips.push({
      label: `${filters.from ? formatIsoDate(filters.from) : '…'} – ${filters.to ? formatIsoDate(filters.to) : '…'}`,
      remove: { from: null, to: null },
    })
  if (filters.type) chips.push({ label: TYPE_FILTER_LABELS[filters.type], remove: { type: null } })
  if (filters.accountId) chips.push({ label: accounts.find((a) => a.id === filters.accountId)?.name ?? 'Conto', remove: { accountId: null } })
  if (filters.categoryId)
    chips.push({
      label: filters.categoryId === 'none' ? 'Senza categoria' : (tree.find((c) => c.id === filters.categoryId)?.name ?? 'Categoria'),
      remove: { categoryId: null },
    })
  if (filters.businessId) chips.push({ label: businesses.find((b) => b.id === filters.businessId)?.name ?? 'Business', remove: { businessId: null } })
  if (filters.incomeSourceId)
    chips.push({
      label: filters.incomeSourceId === 'none' ? 'Senza fonte' : (sources.find((s) => s.id === filters.incomeSourceId)?.name ?? 'Fonte'),
      remove: { incomeSourceId: null },
    })
  if (filters.review) chips.push({ label: 'Da verificare', remove: { review: false } })
  if (filters.query) chips.push({ label: `“${filters.query}”`, remove: { query: null } })

  const withFilters = (patch: Partial<TransactionFilters>) => transactionsHref({ ...filters, page: 1, ...patch })

  return (
    <>
      <PageHeader title="Transazioni" description={result.total === 1 ? '1 movimento' : `${result.total} movimenti`} />

      <form method="get" action="/transactions" className="mb-4 flex flex-wrap items-end gap-3">
        {Object.entries({ from: filters.from, to: filters.to, type: filters.type, account: filters.accountId, category: filters.categoryId, business: filters.businessId, source: filters.incomeSourceId, status: filters.review ? 'review' : null })
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v!} />
          ))}
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-fg">
          Cerca nella descrizione
          <input
            type="search"
            name="q"
            defaultValue={filters.query ?? ''}
            maxLength={100}
            className="h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm text-fg"
          />
        </label>
        <button type="submit" className="h-11 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90">
          Cerca
        </button>
      </form>

      <nav aria-label="Filtri rapidi" className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link
          href={withFilters({ review: !filters.review })}
          aria-current={filters.review ? 'page' : undefined}
          className={cn('inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm sm:min-h-9', filters.review ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-muted hover:text-fg')}
        >
          Da verificare
        </Link>
        {(['income', 'spending', 'transfer', 'investment'] as const).map((t) => (
          <Link
            key={t}
            href={withFilters({ type: filters.type === t ? null : t })}
            aria-current={filters.type === t ? 'page' : undefined}
            className={cn('inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm sm:min-h-9', filters.type === t ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-muted hover:text-fg')}
          >
            {t === 'spending' ? 'Uscite' : TYPE_FILTER_LABELS[t]}
          </Link>
        ))}
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={withFilters({ accountId: filters.accountId === a.id ? null : a.id })}
            aria-current={filters.accountId === a.id ? 'page' : undefined}
            className={cn('inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm sm:min-h-9', filters.accountId === a.id ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-muted hover:text-fg')}
          >
            {a.name}
          </Link>
        ))}
      </nav>

      {chips.length > 0 ? (
        <ul aria-label="Filtri attivi" className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <li key={chip.label}>
              <Link href={withFilters(chip.remove)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-xs text-fg hover:bg-surface-2">
                {chip.label}
                <X aria-label="Rimuovi filtro" className="size-3.5 text-fg-muted" />
              </Link>
            </li>
          ))}
          <li>
            <Link href="/transactions" className="text-xs text-fg-muted hover:text-fg">
              Azzera
            </Link>
          </li>
        </ul>
      ) : null}

      {result.items.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="Nessun movimento" description={chips.length > 0 ? 'Nessun movimento corrisponde ai filtri.' : 'Importa un estratto conto per iniziare.'} />
      ) : (
        <Card className="p-0 lg:p-0">
          <ul aria-label="Movimenti" className="divide-y divide-line">
            {result.items.map((t) => {
              const internal = t.type === 'transfer' || t.type === 'investment'
              return (
                <li key={t.id}>
                  <Link href={`/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
                    <span className="w-20 shrink-0 text-xs text-fg-muted tabular">{formatIsoDate(t.bookedOn, 'numeric')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{t.description}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {[t.accountName, internal ? (t.type === 'transfer' ? 'Trasferimento' : 'Investimento') : t.categoryName, t.businessName].filter(Boolean).join(' · ')}
                        {internal && !t.isTransferLinked ? ' · controparte non collegata' : ''}
                        {!t.isCategorized ? <span className="text-warning"> · da verificare</span> : null}
                      </span>
                    </span>
                    <Money value={t.amount} currency={t.currency} signDisplay="exceptZero" tone={internal ? 'none' : 'signed'} className={cn('shrink-0 text-sm font-medium', internal && 'text-fg-muted')} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagine" className="mt-4 flex items-center justify-between text-sm">
          {result.page > 1 ? (
            <Link href={transactionsHref({ ...filters, page: result.page - 1 })} className="inline-flex min-h-11 items-center gap-1 text-fg-muted hover:text-fg">
              <ChevronLeft aria-hidden className="size-4" /> Precedenti
            </Link>
          ) : (
            <span />
          )}
          <span className="text-fg-muted">
            Pagina {result.page} di {pages}
          </span>
          {result.page < pages ? (
            <Link href={transactionsHref({ ...filters, page: result.page + 1 })} className="inline-flex min-h-11 items-center gap-1 text-fg-muted hover:text-fg">
              Successivi <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  )
}
