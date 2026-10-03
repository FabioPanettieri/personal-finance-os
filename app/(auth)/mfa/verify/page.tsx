import type { Metadata } from 'next'

import { MfaVerifyForm } from '@/features/auth/components/mfa-verify-form'
import { safeNextPath } from '@/lib/auth/access'
import { requireSession } from '@/server/auth/session'

export const metadata: Metadata = { title: 'Verifica in due passaggi' }

export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  await requireSession()
  const { next } = await searchParams
  return <MfaVerifyForm next={safeNextPath(typeof next === 'string' ? next : null)} />
}
