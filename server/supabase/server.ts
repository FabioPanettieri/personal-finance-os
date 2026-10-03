import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { getSupabaseConfig } from '@/lib/env'
import type { Database } from '@/types/database'

export class SupabaseNotConfiguredError extends Error {
  override name = 'SupabaseNotConfiguredError'
  constructor() {
    super('Supabase non configurato: imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  }
}

/**
 * Client Supabase legato ai cookie della richiesta corrente: ogni query gira
 * con l'identità dell'utente e quindi sotto RLS. Va creato per richiesta,
 * mai condiviso tra richieste.
 */
export async function createSupabaseServerClient() {
  const result = getSupabaseConfig()
  if (!result.configured) throw new SupabaseNotConfiguredError()

  const cookieStore = await cookies()

  return createServerClient<Database>(result.config.url, result.config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Chiamato da un Server Component, dove i cookie sono in sola
          // lettura: il refresh della sessione lo scrive già proxy.ts.
        }
      },
    },
  })
}
