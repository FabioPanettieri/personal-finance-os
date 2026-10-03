import type { Metadata } from 'next'

import { LoginForm } from '@/features/auth/components/login-form'
import { getSupabaseConfig } from '@/lib/env'
import { safeNextPath } from '@/lib/auth/access'

export const metadata: Metadata = { title: 'Accedi' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  const config = getSupabaseConfig()
  const nextPath = safeNextPath(typeof next === 'string' ? next : null)

  return (
    <LoginForm
      next={nextPath}
      configIssue={config.configured ? null : [...config.missing, ...config.invalid]}
    />
  )
}
