import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

import { cn } from '@/lib/utils/cn'

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | undefined
  hint?: string
}

/** Input con etichetta, suggerimento ed errore collegati via ARIA. */
export function Field({ label, error, hint, id, className, ...props }: FieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedBy = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px] text-fg',
          'placeholder:text-fg-subtle transition-colors duration-150',
          'focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/25',
          'aria-[invalid=true]:border-negative',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-negative">
          {error}
        </p>
      ) : null}
    </div>
  )
}
