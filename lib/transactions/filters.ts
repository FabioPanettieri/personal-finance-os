/**
 * Filtri della lista movimenti, letti e scritti nell'URL: ogni numero della
 * dashboard porta a una lista filtrata con gli stessi criteri dell'aggregato.
 */
import { compareIsoDates, isIsoDate, type IsoDate } from '../dates'

export const TYPE_FILTERS = ['income', 'expense', 'refund', 'transfer', 'investment', 'spending'] as const
export type TypeFilter = (typeof TYPE_FILTERS)[number]

export const TYPE_FILTER_LABELS: Record<TypeFilter, string> = {
  income: 'Entrate',
  expense: 'Spese',
  refund: 'Rimborsi',
  transfer: 'Trasferimenti',
  investment: 'Investimenti',
  spending: 'Uscite (spese e rimborsi)',
}

/** Tipi di transazione corrispondenti a un filtro ("spending" = spese al netto dei rimborsi). */
export function typesFor(filter: TypeFilter): ('income' | 'expense' | 'refund' | 'transfer' | 'investment')[] {
  return filter === 'spending' ? ['expense', 'refund'] : [filter]
}

export type TransactionFilters = {
  from: IsoDate | null
  to: IsoDate | null
  accountId: string | null
  /** Macro-categoria o categoria; "none" = senza categoria. */
  categoryId: string | null
  type: TypeFilter | null
  businessId: string | null
  /** Fonte di reddito; "none" = entrate senza fonte. */
  incomeSourceId: string | null
  /** Solo movimenti con classificazione non confermata. */
  review: boolean
  query: string | null
  page: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = Record<string, string | string[] | undefined>

function first(params: Params, key: string): string | null {
  const value = params[key]
  const text = Array.isArray(value) ? value[0] : value
  return text?.trim() || null
}

const idOrNone = (value: string | null) => (value && (value === 'none' || UUID.test(value)) ? value : null)

/** Parametri non validi vengono ignorati (mai un errore per un URL modificato a mano). */
export function parseTransactionFilters(params: Params): TransactionFilters {
  let from = first(params, 'from')
  let to = first(params, 'to')
  if (from && !isIsoDate(from)) from = null
  if (to && !isIsoDate(to)) to = null
  if (from && to && compareIsoDates(from as IsoDate, to as IsoDate) > 0) [from, to] = [to, from]
  const type = first(params, 'type')
  const page = Number(first(params, 'page') ?? '1')
  const query = first(params, 'q')
  return {
    from: from as IsoDate | null,
    to: to as IsoDate | null,
    accountId: idOrNone(first(params, 'account')) === 'none' ? null : idOrNone(first(params, 'account')),
    categoryId: idOrNone(first(params, 'category')),
    type: (TYPE_FILTERS as readonly string[]).includes(type ?? '') ? (type as TypeFilter) : null,
    businessId: idOrNone(first(params, 'business')) === 'none' ? null : idOrNone(first(params, 'business')),
    incomeSourceId: idOrNone(first(params, 'source')),
    review: first(params, 'status') === 'review',
    query: query ? query.slice(0, 100) : null,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  }
}

/** URL della lista movimenti con i filtri indicati. */
export function transactionsHref(filters: Partial<Omit<TransactionFilters, 'page'>> & { page?: number } = {}): string {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.accountId) params.set('account', filters.accountId)
  if (filters.categoryId) params.set('category', filters.categoryId)
  if (filters.type) params.set('type', filters.type)
  if (filters.businessId) params.set('business', filters.businessId)
  if (filters.incomeSourceId) params.set('source', filters.incomeSourceId)
  if (filters.review) params.set('status', 'review')
  if (filters.query) params.set('q', filters.query)
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  const search = params.toString()
  return search ? `/transactions?${search}` : '/transactions'
}
