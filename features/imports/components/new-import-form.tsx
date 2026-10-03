'use client'

import { FileUp } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import type { ImportSource } from '@/lib/imports/types'

import { createImportAction, type ImportFormState } from '../actions'
import { SOURCE_LABELS } from '../labels'

export type AccountOption = { id: string; name: string; bankProfile: string | null; currency: string }

const INITIAL: ImportFormState = { status: 'idle' }
const SOURCES: ImportSource[] = ['ing', 'revolut', 'trade_republic']
const HINTS: Record<ImportSource, string> = {
  ing: 'Movimenti del conto ING (CSV)',
  revolut: 'Estratto conto Revolut (CSV)',
  trade_republic: 'Export transazioni Trade Republic (CSV)',
}

export function NewImportForm({ accounts }: { accounts: AccountOption[] }) {
  const [state, action, pending] = useActionState(createImportAction, INITIAL)
  const [source, setSource] = useState<ImportSource>('ing')
  const defaultAccount = accounts.find((a) => a.bankProfile === source)?.id ?? accounts[0]?.id ?? ''
  const [accountId, setAccountId] = useState(defaultAccount)

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-fg">Banca</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SOURCES.map((s) => (
            <label
              key={s}
              className={cn(
                'flex min-h-16 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-4 py-3 transition-colors',
                source === s ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name="source"
                value={s}
                checked={source === s}
                onChange={() => {
                  setSource(s)
                  setAccountId(accounts.find((a) => a.bankProfile === s)?.id ?? accountId)
                }}
                className="sr-only"
              />
              <span className="text-sm font-medium text-fg">{SOURCE_LABELS[s]}</span>
              <span className="text-xs text-fg-muted">{HINTS[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="accountId" className="text-[13px] font-medium text-fg">
          Conto di destinazione
        </label>
        <select
          id="accountId"
          name="accountId"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px] text-fg"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
        {state.fieldErrors?.accountId ? <p className="text-xs text-negative">{state.fieldErrors.accountId}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="text-[13px] font-medium text-fg">
          File CSV
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          aria-describedby="file-hint"
          className="min-h-11 rounded-[var(--radius-control)] border border-dashed border-line-strong bg-surface p-3 text-sm text-fg file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-fg"
        />
        <p id="file-hint" className="text-xs text-fg-muted">
          Massimo 10 MB. Il file originale viene conservato in modo privato e non viene mai modificato.
        </p>
        {state.fieldErrors?.file ? <p className="text-xs text-negative">{state.fieldErrors.file}</p> : null}
      </div>

      {state.errors?.length ? (
        <div role="alert" className="rounded-[var(--radius-control)] bg-negative-soft px-3 py-2.5 text-sm text-negative">
          {state.errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}

      <div>
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          <FileUp aria-hidden className="size-4" />
          Analizza e mostra l’anteprima
        </Button>
        <p className="mt-2 text-xs text-fg-subtle">Nulla viene importato finché non confermi l’anteprima.</p>
      </div>
    </form>
  )
}
