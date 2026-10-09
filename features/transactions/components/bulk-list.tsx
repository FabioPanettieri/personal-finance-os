'use client'

import { Check, CheckSquare, X } from 'lucide-react'
import { useActionState, useMemo, useState } from 'react'

import { TransactionRow, type TransactionRowData } from '@/components/finance/transaction-row'
import { choicesFor } from '@/lib/transactions/quick-choices'
import { cn } from '@/lib/utils/cn'

import { bulkTransactionsAction, type ConfirmState } from '../actions'

export type DayGroup = { day: string; label: string; items: TransactionRowData[] }

const INITIAL: ConfirmState = { status: 'idle' }

/**
 * Lista dei movimenti raggruppati per giorno, con la modalità "Seleziona":
 * si spuntano i movimenti (o tutti quelli dei filtri) e si confermano o si
 * classificano in un colpo solo.
 */
export function BulkTransactionList({ groups, total, filters }: { groups: DayGroup[]; total: number; filters: string }) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [allResults, setAllResults] = useState(false)
  const [classifying, setClassifying] = useState(false)
  // Dopo un'operazione riuscita si esce dalla modalità selezione.
  const [state, action, pending] = useActionState(async (prev: ConfirmState, formData: FormData) => {
    const result = await bulkTransactionsAction(prev, formData)
    if (result.status === 'done') {
      setSelecting(false)
      setSelected(new Set())
      setAllResults(false)
      setClassifying(false)
    }
    return result
  }, INITIAL)

  const items = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const chosen = items.filter((t) => selected.has(t.id))
  const count = allResults ? total : selected.size
  const signs = new Set(chosen.map((t) => (t.amount > 0 ? 'in' : 'out')))
  const [direction, setDirection] = useState<'in' | 'out'>('out')
  const effectiveDirection: 'in' | 'out' = !allResults && signs.size === 1 ? [...signs][0]! : direction

  const toggle = (id: string) => {
    setAllResults(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        {state.message ? (
          <p role="status" className={cn('text-sm', state.status === 'error' ? 'text-negative' : 'text-positive')}>
            {state.message}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => {
            setSelecting((s) => !s)
            setSelected(new Set())
            setAllResults(false)
            setClassifying(false)
          }}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          {selecting ? <X aria-hidden className="size-4" /> : <CheckSquare aria-hidden className="size-4" />}
          {selecting ? 'Annulla' : 'Seleziona'}
        </button>
      </div>

      {selecting ? (
        <form
          action={action}
          aria-label="Modifica di gruppo"
          className="sticky top-2 z-30 mb-4 rounded-[var(--radius-card)] border border-line-strong bg-surface-2 p-4 shadow-2xl"
        >
          <input type="hidden" name="scope" value={allResults ? 'all' : 'selected'} />
          <input type="hidden" name="filters" value={filters} />
          {allResults ? null : [...selected].map((id) => <input key={id} type="hidden" name="id" value={id} />)}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[15px] font-semibold text-fg">{count === 1 ? '1 selezionato' : `${count} selezionati`}</p>
            <div className="flex gap-3 text-[13px] font-medium">
              <button type="button" onClick={() => { setAllResults(false); setSelected(new Set(items.map((t) => t.id))) }} className="text-fg-muted hover:text-fg">
                Tutti in pagina
              </button>
              {total > items.length ? (
                <button type="button" onClick={() => setAllResults(true)} className="text-fg-muted hover:text-fg">
                  Tutti i {total} risultati
                </button>
              ) : null}
            </div>
          </div>

          {classifying ? (
            <div className="mt-3 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
              {allResults || signs.size !== 1 ? (
                <fieldset className="flex gap-2">
                  <legend className="mb-1 text-[13px] text-fg-muted">Applica a:</legend>
                  {(['out', 'in'] as const).map((d) => (
                    <label key={d} className={cn('inline-flex min-h-10 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold', direction === d ? 'bg-fg text-canvas' : 'bg-surface text-fg-muted')}>
                      <input type="radio" className="sr-only" checked={direction === d} onChange={() => setDirection(d)} />
                      {d === 'out' ? 'Uscite' : 'Entrate'}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <input type="hidden" name="direction" value={effectiveDirection} />
              <input type="hidden" name="operation" value="classify" />
              <div className="grid grid-cols-2 gap-2">
                {choicesFor(effectiveDirection === 'in' ? 1 : -1).map((c) => (
                  <button
                    key={c.key}
                    type="submit"
                    name="choice"
                    value={c.key}
                    disabled={pending || count === 0}
                    className="min-h-12 rounded-[14px] border border-line bg-surface px-3 py-2 text-left text-sm font-semibold text-fg hover:bg-line disabled:opacity-40"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="submit"
                name="operation"
                value="confirm"
                disabled={pending || count === 0}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-fg text-sm font-semibold text-canvas disabled:opacity-40"
              >
                <Check aria-hidden className="size-4" />
                Conferma
              </button>
              <button
                type="button"
                onClick={() => setClassifying(true)}
                disabled={count === 0}
                className="min-h-12 rounded-full border border-line text-sm font-semibold text-fg disabled:opacity-40"
              >
                Classifica come…
              </button>
            </div>
          )}
        </form>
      ) : null}

      <ul aria-label="Movimenti" className="flex flex-col gap-5">
        {groups.map((group) => (
          <li key={group.day}>
            <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">{group.label}</h2>
            <ul className="rounded-[var(--radius-card)] border border-line bg-surface px-3 py-1">
              {group.items.map((t) =>
                selecting ? (
                  <li key={t.id} data-testid="transaction-row">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allResults || selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                        aria-label={`Seleziona ${t.description}`}
                        className="size-5 shrink-0 accent-[var(--fg)]"
                      />
                      <TransactionRow tx={t} link={false} />
                    </label>
                  </li>
                ) : (
                  <li key={t.id} data-testid="transaction-row">
                    <TransactionRow tx={t} />
                  </li>
                ),
              )}
            </ul>
          </li>
        ))}
      </ul>

    </>
  )
}
