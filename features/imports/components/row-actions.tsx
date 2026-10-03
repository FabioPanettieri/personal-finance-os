'use client'

import { useActionState, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import type { TransactionType } from '@/lib/imports/types'

import { toggleRowAction, updateRowAction, type ImportFormState } from '../actions'
import { categoryKindFor, TYPE_LABELS } from '../labels'
import { useImportOptions } from './options-context'

export type EditableRow = {
  id: string
  importId: string
  amount: number
  type: TransactionType | null
  categoryId: string | null
  businessId: string | null
  incomeSourceId: string | null
  canEdit: boolean
  canInclude: boolean
  canExclude: boolean
  canConfirm: boolean
}

const INITIAL: ImportFormState = { status: 'idle' }
const TYPES: TransactionType[] = ['income', 'expense', 'refund', 'transfer', 'investment']

const selectClass = 'h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm text-fg'

export function RowActions({ row }: { row: EditableRow }) {
  const options = useImportOptions()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TransactionType | ''>(row.type ?? '')
  const [state, action, pending] = useActionState(updateRowAction.bind(null, row.importId, row.id), INITIAL)
  const [toggling, startToggle] = useTransition()
  const [toggleError, setToggleError] = useState<string | null>(null)

  const allowedTypes = TYPES.filter((t) =>
    t === 'income' || t === 'refund' ? row.amount > 0 : t === 'expense' ? row.amount < 0 : true,
  )
  const categories = type ? options.categories.filter((c) => c.kind === categoryKindFor(type)) : []

  const toggle = (include: boolean) =>
    startToggle(async () => {
      const result = await toggleRowAction(row.importId, row.id, include)
      setToggleError(result.status === 'error' ? (result.message ?? 'Errore') : null)
    })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {row.canEdit ? (
          <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-8" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Chiudi' : row.type ? 'Correggi' : 'Classifica'}
          </Button>
        ) : null}
        {row.canConfirm && row.type ? (
          <form action={action}>
            <input type="hidden" name="type" value={row.type} />
            <input type="hidden" name="categoryId" value={row.categoryId ?? ''} />
            <input type="hidden" name="businessId" value={row.businessId ?? ''} />
            <input type="hidden" name="incomeSourceId" value={row.incomeSourceId ?? ''} />
            <Button type="submit" variant="secondary" size="sm" loading={pending} className="min-h-11 sm:min-h-8">
              Conferma proposta
            </Button>
          </form>
        ) : null}
        {row.canExclude ? (
          <Button variant="ghost" size="sm" loading={toggling} onClick={() => toggle(false)} className="min-h-11 sm:min-h-8">
            Escludi
          </Button>
        ) : null}
        {row.canInclude ? (
          <Button variant="ghost" size="sm" loading={toggling} onClick={() => toggle(true)} className="min-h-11 sm:min-h-8">
            Includi
          </Button>
        ) : null}
      </div>

      {open ? (
        <form action={action} className="grid gap-3 rounded-[var(--radius-control)] border border-line bg-surface-2 p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg">
            Tipo
            <select name="type" value={type} onChange={(e) => setType(e.target.value as TransactionType)} className={selectClass} required>
              <option value="" disabled>
                Scegli…
              </option>
              {allowedTypes.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg">
            Categoria
            <select name="categoryId" defaultValue={row.categoryId ?? ''} className={selectClass} key={type}>
              <option value="">Nessuna</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg">
            Business
            <select name="businessId" defaultValue={row.businessId ?? ''} className={selectClass} disabled={type === 'transfer'}>
              <option value="">Nessuno (personale)</option>
              {options.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg">
            Fonte di reddito
            <select name="incomeSourceId" defaultValue={row.incomeSourceId ?? ''} className={selectClass} disabled={type !== 'income'}>
              <option value="">Nessuna</option>
              {options.incomeSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" size="sm" loading={pending} className="min-h-11 sm:min-h-9">
              Salva
            </Button>
            {state.fieldErrors?.type ? <p className="text-xs text-negative">{state.fieldErrors.type}</p> : null}
          </div>
        </form>
      ) : null}

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-xs text-negative">
          {state.message}
        </p>
      ) : null}
      {toggleError ? (
        <p role="alert" className="text-xs text-negative">
          {toggleError}
        </p>
      ) : null}
    </div>
  )
}
