import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/app-shell'
import { getProfile, requireUser } from '@/server/auth/session'

/** Seconda barriera dopo proxy.ts: nessuna pagina dell'area app senza AAL2. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const profile = await getProfile()

  return <AppShell user={{ displayName: profile?.display_name ?? null, email: user.email }}>{children}</AppShell>
}
