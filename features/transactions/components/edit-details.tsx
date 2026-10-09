'use client'

import { useActionState } from 'react'

import { cn } from '@/lib/utils/cn'

import { updateTransactionDetailsAction, type DetailsState } from '../actions'

const INITIAL: DetailsState = { status: 'idle' }

type Option = { id: string; name: string }
type CategoryOption = { id: string; name: string; parentName: string | null }

const field = 'flex flex-col gap-1 text-[13px] font-medium text-fg-muted'
const control = 'h-11 rounded-[12px] border border-line bg-surface-2 px-3 text-[15px] text-fg'

/** Modifica a mano: descrizione, categoria (anche sottocategoria), business, fonte e note. */
export function EditDetails({
  id,
  values,
  categories,
  businesses,
  sources,
  showBusiness,
  showSource,
}: {
  id: string
  values: { description: string; notes: string | null; categoryId: string | null; businessId: string | null; incomeSourceId: string | null }
  categories: CategoryOption[]
  businesses: Option[]
  sources: Option[]
  showBusiness: boolean
  showSource: boolean
}) {
  const [state, action, pending] = useActionState(updateTransactionDetailsAction.bind(null, id), INITIAL)
  const roots = categories.filter((c) => c.parentName === null)
  const error = (name: string) => (state.status === 'error' && state.field === name ? <span className="text-xs text-negative">{state.message}</span> : null)

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className={field}>
        Descrizione
        <input name="description" defaultValue={values.description} maxLength={500} required className={control} />
        {error('description')}
      </label>
      <label className={field}>
        Categoria
        <select name="categoryId" defaultValue={values.categoryId ?? ''} className={control}>
          <option value="">Nessuna</option>
          {roots.map((root) => (
            <optgroup key={root.id} label={root.name}>
              <option value={root.id}>{root.name}</option>
              {categories
                .filter((c) => c.parentName === root.name)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {root.name} › {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {error('categoryId')}
      </label>
      {showBusiness ? (
        <label className={field}>
          Business
          <select name="businessId" defaultValue={values.businessId ?? ''} className={control}>
            <option value="">Personale (nessun business)</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {error('businessId')}
        </label>
      ) : null}
      {showSource ? (
        <label className={field}>
          Fonte di reddito
          <select name="incomeSourceId" defaultValue={values.incomeSourceId ?? ''} className={control}>
            <option value="">Nessuna</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {error('incomeSourceId')}
        </label>
      ) : null}
      <label className={field}>
        Note
        <textarea name="notes" defaultValue={values.notes ?? ''} maxLength={2000} rows={3} className="rounded-[12px] border border-line bg-surface-2 px-3 py-2 text-[15px] text-fg" />
        {error('notes')}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="h-11 rounded-full bg-fg px-6 text-sm font-semibold text-canvas disabled:opacity-50">
          {pending ? 'Salvo…' : 'Salva modifiche'}
        </button>
        {state.message && !state.field ? (
          <p role="status" className={cn('text-sm', state.status === 'error' ? 'text-negative' : 'text-positive')}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  )
}
