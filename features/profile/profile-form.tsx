'use client'

import { useActionState } from 'react'

import { cn } from '@/lib/utils/cn'

import { updateProfileAction, type ProfileFormState } from './actions'

const INITIAL: ProfileFormState = { status: 'idle' }
const field = 'flex flex-col gap-1 text-[13px] font-medium text-fg-muted'
const control = 'h-11 rounded-[12px] border border-line bg-surface-2 px-3 text-[15px] text-fg'

export function ProfileForm({ displayName, timeZone, timeZones }: { displayName: string; timeZone: string; timeZones: string[] }) {
  const [state, action, pending] = useActionState(updateProfileAction, INITIAL)
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          Nome
          <input name="displayName" maxLength={80} defaultValue={displayName} autoComplete="given-name" placeholder="Come vuoi essere salutato" className={control} />
        </label>
        <label className={field}>
          Fuso orario
          <select name="timezone" defaultValue={timeZone} className={control}>
            {timeZones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-fg px-5 text-sm font-semibold text-canvas disabled:opacity-50"
        >
          {pending ? 'Salvo…' : 'Salva'}
        </button>
        {state.message ? (
          <p role="status" className={cn('text-[13px]', state.status === 'error' ? 'text-negative' : 'text-positive')}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  )
}
