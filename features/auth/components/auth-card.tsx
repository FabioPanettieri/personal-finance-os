import type { ReactNode } from 'react'

import { Card } from '@/components/ui/card'

export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-fg">{title}</h1>
      {description ? <p className="mt-1.5 text-sm text-fg-muted">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </Card>
  )
}

export function FormMessage({ message }: { message: string | undefined }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-[var(--radius-control)] bg-negative-soft px-3 py-2.5 text-sm text-negative">
      {message}
    </p>
  )
}
