'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type Option = { id: string; label: string }
export type ImportOptions = {
  categories: (Option & { kind: string })[]
  businesses: Option[]
  incomeSources: (Option & { businessId: string | null })[]
}

const OptionsContext = createContext<ImportOptions | null>(null)

/** Opzioni di classificazione condivise da tutte le righe (inviate una sola volta). */
export function ImportOptionsProvider({ value, children }: { value: ImportOptions; children: ReactNode }) {
  return <OptionsContext.Provider value={value}>{children}</OptionsContext.Provider>
}

export function useImportOptions(): ImportOptions {
  const value = useContext(OptionsContext)
  if (!value) throw new Error('ImportOptionsProvider mancante')
  return value
}
