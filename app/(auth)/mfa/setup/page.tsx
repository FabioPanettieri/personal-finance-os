import type { Metadata } from 'next'

import { MfaSetupForm } from '@/features/auth/components/mfa-setup-form'
import { safeNextPath } from '@/lib/auth/access'
import { requireSession } from '@/server/auth/session'

export const metadata: Metadata = { title: 'Configura la verifica in due passaggi' }

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  await requireSession()
  const { next } = await searchParams
  return <MfaSetupForm next={safeNextPath(typeof next === 'string' ? next : null)} />
}
