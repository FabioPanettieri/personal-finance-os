'use client'

import { Pause, Play, Trash2 } from 'lucide-react'
import { useActionState } from 'react'

import { FREQUENCY_LABELS, type PlanFrequency } from '@/lib/investments/portfolio'
import { cn } from '@/lib/utils/cn'

import { createPlanAction, deletePlanAction, savePriceAction, togglePlanAction, type FormState } from '../actions'

const INITIAL: FormState = { status: 'idle' }
const field = 'flex flex-col gap-1 text-[13px] font-medium text-fg-muted'
const control = 'h-11 rounded-[12px] border border-line bg-surface-2 px-3 text-[15px] text-fg'

function Message({ state }: { state: FormState }) {
  return state.message ? (
    <p role="status" className={cn('text-[13px]', state.status === 'error' ? 'text-negative' : 'text-positive')}>
      {state.message}
    </p>
  ) : null
}

/** Prezzo attuale di uno strumento: il valore si aggiorna con quantità × prezzo. */
export function PriceForm({ accountId, instrumentId, quantity, name }: { accountId: string; instrumentId: string; quantity: number; name: string }) {
  const [state, action, pending] = useActionState(savePriceAction.bind(null, accountId, instrumentId, quantity), INITIAL)
  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`price-${instrumentId}`}>
          Prezzo attuale di {name}
        </label>
        <input id={`price-${instrumentId}`} name="price" inputMode="decimal" autoComplete="off" placeholder="Prezzo di oggi, es. 95,40" className={cn(control, 'min-w-0 flex-1')} />
        <button type="submit" disabled={pending} className="h-11 shrink-0 rounded-full bg-fg px-4 text-sm font-semibold text-canvas disabled:opacity-50">
          {pending ? '…' : 'Aggiorna'}
        </button>
      </div>
      <Message state={state} />
    </form>
  )
}

export function PlanForm({ accountId, instruments, defaultStart }: { accountId: string; instruments: { id: string; name: string }[]; defaultStart: string }) {
  const [state, action, pending] = useActionState(createPlanAction.bind(null, accountId), INITIAL)
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className={field}>
        Nome
        <input name="name" required maxLength={80} placeholder="es. PAC MSCI World" className={control} />
      </label>
      <label className={field}>
        Strumento
        <select name="instrumentId" defaultValue="" className={control}>
          <option value="">Non indicato</option>
          {instruments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        Importo (EUR)
        <input name="amount" required inputMode="decimal" autoComplete="off" placeholder="es. 150,00" className={control} />
      </label>
      <label className={field}>
        Frequenza
        <select name="frequency" defaultValue="monthly" className={control}>
          {(Object.keys(FREQUENCY_LABELS) as PlanFrequency[]).map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        Prima esecuzione
        <input name="startsOn" type="date" required defaultValue={defaultStart} className={control} />
      </label>
      <div className="flex items-end gap-3">
        <button type="submit" disabled={pending} className="h-11 rounded-full bg-fg px-6 text-sm font-semibold text-canvas disabled:opacity-50">
          {pending ? 'Salvo…' : 'Aggiungi piano'}
        </button>
        <Message state={state} />
      </div>
    </form>
  )
}

export function PlanActions({ id, isActive, name }: { id: string; isActive: boolean; name: string }) {
  const [toggleState, toggle, toggling] = useActionState(() => togglePlanAction(id, !isActive), INITIAL)
  const [deleteState, remove, removing] = useActionState(() => deletePlanAction(id), INITIAL)
  const error = toggleState.status === 'error' ? toggleState.message : deleteState.status === 'error' ? deleteState.message : null
  return (
    <div className="flex items-center gap-1">
      <form action={toggle}>
        <button type="submit" disabled={toggling} aria-label={`${isActive ? 'Metti in pausa' : 'Riattiva'} ${name}`} className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
          {isActive ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
        </button>
      </form>
      <form
        action={remove}
        onSubmit={(e) => {
          if (!window.confirm(`Eliminare il piano “${name}”?`)) e.preventDefault()
        }}
      >
        <button type="submit" disabled={removing} aria-label={`Elimina ${name}`} className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-negative">
          <Trash2 aria-hidden className="size-4" />
        </button>
      </form>
      {error ? <span className="text-xs text-negative">{error}</span> : null}
    </div>
  )
}
