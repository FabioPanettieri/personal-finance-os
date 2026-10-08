'use client'

import { Check, FileText, FileUp } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { BANK_COLOR_VAR, bankGradient } from '@/lib/banks'
import type { ImportSource } from '@/lib/imports/types'
import { cn } from '@/lib/utils/cn'

import { createImportAction, type ImportFormState } from '../actions'
import { SOURCE_LABELS } from '../labels'

export type AccountOption = { id: string; name: string; bankProfile: string | null; currency: string }

const INITIAL: ImportFormState = { status: 'idle' }
const SOURCES: ImportSource[] = ['revolut', 'ing', 'trade_republic']
const HINTS: Record<ImportSource, string> = {
  ing: 'Movimenti del conto (CSV)',
  revolut: 'Estratto conto (CSV)',
  trade_republic: 'Export transazioni (CSV)',
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 text-[15px] font-semibold text-fg">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-surface-2 text-[13px] font-bold text-fg">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Tre passi: scegli la banca, scegli il file, guarda l'anteprima. Il conto si propone da solo. */
export function NewImportForm({ accounts }: { accounts: AccountOption[] }) {
  const [state, action, pending] = useActionState(createImportAction, INITIAL)
  const [source, setSource] = useState<ImportSource>('ing')
  const defaultAccount = accounts.find((a) => a.bankProfile === source)?.id ?? accounts[0]?.id ?? ''
  const [accountId, setAccountId] = useState(defaultAccount)
  const [fileName, setFileName] = useState<string | null>(null)

  return (
    <form action={action} className="flex flex-col gap-7" noValidate>
      <Step n={1} title="Da quale banca?">
        <fieldset>
          <legend className="sr-only">Banca</legend>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {SOURCES.map((s) => {
              const selected = source === s
              return (
                <label
                  key={s}
                  className={cn(
                    'relative flex min-h-[104px] cursor-pointer flex-col justify-between rounded-[18px] p-3 text-white transition-all sm:p-4',
                    selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-canvas' : 'opacity-60 hover:opacity-90',
                  )}
                  style={{ background: bankGradient(BANK_COLOR_VAR[s]) }}
                >
                  <input
                    type="radio"
                    name="source"
                    value={s}
                    checked={selected}
                    onChange={() => {
                      setSource(s)
                      setAccountId(accounts.find((a) => a.bankProfile === s)?.id ?? accountId)
                    }}
                    className="sr-only"
                  />
                  {selected ? <Check aria-hidden className="absolute top-3 right-3 size-4" /> : null}
                  <span className="text-[15px] leading-tight font-bold">{SOURCE_LABELS[s]}</span>
                  <span className="hidden text-xs text-white/80 sm:block">{HINTS[s]}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="accountId" className="text-[13px] font-medium text-fg-muted">
            Conto di destinazione
          </label>
          <select
            id="accountId"
            name="accountId"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-12 rounded-[14px] border border-line bg-surface-2 px-3 text-[15px] text-fg"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
          {state.fieldErrors?.accountId ? <p className="text-xs text-negative">{state.fieldErrors.accountId}</p> : null}
        </div>
      </Step>

      <Step n={2} title="Scegli il file">
        <label
          htmlFor="file"
          className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-line-strong bg-surface px-4 py-6 text-center transition-colors hover:bg-surface-2"
        >
          {fileName ? <FileText aria-hidden className="size-7 text-fg" /> : <FileUp aria-hidden className="size-7 text-fg-muted" />}
          <span className="text-[15px] font-semibold break-all text-fg">{fileName ?? 'Tocca per scegliere il CSV'}</span>
          <span id="file-hint" className="text-xs text-fg-muted">
            Massimo 10 MB · il file resta privato e non viene modificato
          </span>
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          aria-label="File CSV"
          aria-describedby="file-hint"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="sr-only"
        />
        {state.fieldErrors?.file ? <p className="text-xs text-negative">{state.fieldErrors.file}</p> : null}
      </Step>

      {state.errors?.length ? (
        <div role="alert" className="rounded-[14px] bg-negative-soft px-4 py-3 text-sm text-negative">
          {state.errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}

      <Step n={3} title="Controlla l’anteprima">
        <Button type="submit" size="lg" loading={pending} className="w-full rounded-full">
          Analizza e mostra l’anteprima
        </Button>
        <p className="text-center text-xs text-fg-subtle">Nulla viene importato finché non confermi.</p>
      </Step>
    </form>
  )
}
