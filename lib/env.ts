import { z } from 'zod'

export type SupabasePublicConfig = {
  url: string
  publishableKey: string
}

export type SupabaseConfigResult =
  | { configured: true; config: SupabasePublicConfig }
  | { configured: false; missing: string[]; invalid: string[] }

const urlSchema = z
  .url({ protocol: /^https?$/ })
  .refine((value) => !value.endsWith('/'), 'senza slash finale')

const keySchema = z.string().min(20)

/**
 * Valida la configurazione pubblica di Supabase. Funzione pura: riceve i
 * valori grezzi così da essere testabile senza toccare process.env.
 */
export function parseSupabaseConfig(raw: {
  url: string | undefined
  publishableKey: string | undefined
}): SupabaseConfigResult {
  const missing: string[] = []
  const invalid: string[] = []

  const url = raw.url?.trim() ?? ''
  const publishableKey = raw.publishableKey?.trim() ?? ''

  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  else if (!urlSchema.safeParse(url).success) invalid.push('NEXT_PUBLIC_SUPABASE_URL')

  if (!publishableKey) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  else if (!keySchema.safeParse(publishableKey).success) invalid.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

  if (missing.length > 0 || invalid.length > 0) {
    return { configured: false, missing, invalid }
  }
  return { configured: true, config: { url, publishableKey } }
}

/**
 * Configurazione corrente. I riferimenti letterali a process.env.NEXT_PUBLIC_*
 * sono necessari: Next.js li sostituisce staticamente in fase di build.
 */
export function getSupabaseConfig(): SupabaseConfigResult {
  return parseSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
}
