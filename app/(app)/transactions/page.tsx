import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { TransactionRow } from '@/components/finance/transaction-row'
import { accountColor } from '@/lib/banks'
import { formatIsoDate, type IsoDate } from '@/lib/dates'
import { parseTransactionFilters, transactionsHref, TYPE_FILTER_LABELS, type TransactionFilters } from '@/lib/transactions/filters'
import { cn } from '@/lib/utils/cn'
import { requireUser } from '@/server/auth/session'
import { listAccounts } from '@/server/repositories/accounts'
import { businessList, categoryTree, incomeSourceList, reviewCounts } from '@/server/repositories/dashboard'
import { listTransactions, type TransactionListItem } from '@/server/repositories/transactions'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Movimenti' }

const chip = (active: boolean) =>
  cn(
    'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors',
    active ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-muted hover:text-fg',
  )

function groupByDay(items: TransactionListItem[]): { day: IsoDate; items: TransactionListItem[] }[] {
  const groups: { day: IsoDate; items: TransactionListItem[] }[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last && last.day === item.bookedOn) last.items.push(item)
    else groups.push({ day: item.bookedOn, items: [item] })
  }
  return groups
}

/**
 * Tutti i movimenti: ricerca, filtri rapidi (da sistemare, per conto) e i
 * filtri nell'URL usati dai link della Home. Tocca un movimento per vederlo o
 * sistemarlo.
 */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('/transactions')
  const filters = parseTransactionFilters(await searchParams)
  const db = await createSupabaseServerClient()
  const [accounts, tree, businesses, sources, review] = await Promise.all([
    listAccounts(db),
    categoryTree(db),
    businessList(db),
    incomeSourceList(db),
    reviewCounts(db),
  ])

  // Una macro-categoria comprende le sue sottocategorie (come nella Home).
  const categoryIds =
    filters.categoryId && filters.categoryId !== 'none' ? [filters.categoryId, ...tree.filter((c) => c.parentId === filters.categoryId).map((c) => c.id)] : null
  const result = await listTransactions(db, filters, categoryIds)
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize))

  const extra: { label: string; remove: Partial<TransactionFilters> }[] = []
  if (filters.from || filters.to)
    extra.push({ label: `${filters.from ? formatIsoDate(filters.from) : '…'} – ${filters.to ? formatIsoDate(filters.to) : '…'}`, remove: { from: null, to: null } })
  if (filters.type) extra.push({ label: TYPE_FILTER_LABELS[filters.type], remove: { type: null } })
  if (filters.categoryId)
    extra.push({
      label: filters.categoryId === 'none' ? 'Senza categoria' : (tree.find((c) => c.id === filters.categoryId)?.name ?? 'Categoria'),
      remove: { categoryId: null },
    })
  if (filters.businessId) extra.push({ label: businesses.find((b) => b.id === filters.businessId)?.name ?? 'Business', remove: { businessId: null } })
  if (filters.incomeSourceId)
    extra.push({
      label: filters.incomeSourceId === 'none' ? 'Senza fonte' : (sources.find((s) => s.id === filters.incomeSourceId)?.name ?? 'Fonte'),
      remove: { incomeSourceId: null },
    })

  const withFilters = (patch: Partial<TransactionFilters>) => transactionsHref({ ...filters, page: 1, ...patch })
  const allActive = !filters.review && !filters.accountId

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Movimenti</h1>
        <p className="mt-1 text-[15px] text-fg-muted">{result.total === 1 ? '1 movimento' : `${result.total} movimenti`}</p>
      </header>

      <form method="get" action="/transactions" className="mb-4">
        {Object.entries({ from: filters.from, to: filters.to, type: filters.type, account: filters.accountId, category: filters.categoryId, business: filters.businessId, source: filters.incomeSourceId, status: filters.review ? 'review' : null })
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v!} />
          ))}
        <label className="flex h-12 items-center gap-3 rounded-[14px] bg-surface-2 px-4 focus-within:ring-2 focus-within:ring-fg/30">
          <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          <span className="sr-only">Cerca nella descrizione</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.query ?? ''}
            maxLength={100}
            placeholder="Cerca: “Etsy”, “supermercato”…"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
      </form>

      <nav aria-label="Filtri rapidi" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={withFilters({ review: false, accountId: null })} aria-current={allActive ? 'page' : undefined} className={chip(allActive)}>
          Tutti
        </Link>
        <Link href={withFilters({ review: !filters.review })} aria-current={filters.review ? 'page' : undefined} className={chip(filters.review)}>
          <span aria-hidden className="size-2 rounded-full bg-warning" />
          Da sistemare{review.transactions > 0 ? ` · ${review.transactions}` : ''}
        </Link>
        {accounts
          .filter((a) => a.isActive || a.transactionCount > 0)
          .map((a) => (
            <Link
              key={a.id}
              href={withFilters({ accountId: filters.accountId === a.id ? null : a.id })}
              aria-current={filters.accountId === a.id ? 'page' : undefined}
              className={chip(filters.accountId === a.id)}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: accountColor(a) }} />
              {a.name}
            </Link>
          ))}
      </nav>

      {extra.length > 0 || filters.query ? (
        <ul aria-label="Filtri attivi" className="mb-4 flex flex-wrap items-center gap-2">
          {[...extra, ...(filters.query ? [{ label: `“${filters.query}”`, remove: { query: null } }] : [])].map((f) => (
            <li key={f.label}>
              <Link href={withFilters(f.remove)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-fg hover:bg-surface-2">
                {f.label}
                <X aria-label="Rimuovi filtro" className="size-3.5 text-fg-muted" />
              </Link>
            </li>
          ))}
          <li>
            <Link href="/transactions" className="text-xs font-medium text-fg-muted hover:text-fg">
              Azzera
            </Link>
          </li>
        </ul>
      ) : null}

      {result.items.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-base font-semibold text-fg">{filters.review ? 'Niente da sistemare' : 'Nessun movimento'}</p>
          <p className="mt-1 text-sm text-fg-muted">
            {filters.review ? 'Tutti i movimenti sono classificati.' : extra.length > 0 || filters.query ? 'Nessun movimento corrisponde ai filtri.' : 'Importa un estratto per iniziare.'}
          </p>
        </div>
      ) : (
        <ul aria-label="Movimenti" className="flex flex-col gap-5">
          {groupByDay(result.items).map((group) => (
            <li key={group.day}>
              <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">{formatIsoDate(group.day, 'long')}</h2>
              <ul className="rounded-[var(--radius-card)] border border-line bg-surface px-3 py-1">
                {group.items.map((t) => (
                  <li key={t.id} data-testid="transaction-row">
                    <TransactionRow tx={t} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagine" className="mt-5 flex items-center justify-between text-sm">
          {result.page > 1 ? (
            <Link href={transactionsHref({ ...filters, page: result.page - 1 })} className="inline-flex min-h-11 items-center gap-1 font-medium text-fg-muted hover:text-fg">
              <ChevronLeft aria-hidden className="size-4" /> Più recenti
            </Link>
          ) : (
            <span />
          )}
          <span className="text-fg-muted">
            {result.page} di {pages}
          </span>
          {result.page < pages ? (
            <Link href={transactionsHref({ ...filters, page: result.page + 1 })} className="inline-flex min-h-11 items-center gap-1 font-medium text-fg-muted hover:text-fg">
              Meno recenti <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  )
}
