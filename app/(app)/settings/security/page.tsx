import { ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'

import { SignOutButton } from '@/components/layout/user-menu'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { requireUser } from '@/server/auth/session'

export const metadata: Metadata = { title: 'Sicurezza' }

export default async function SecuritySettingsPage() {
  const user = await requireUser('/settings/security')

  return (
    <>
      <PageHeader title="Sicurezza" description="Accesso e protezione del tuo account." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Email</dt>
              <dd className="truncate font-medium text-fg">{user.email ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-fg-muted">Verifica in due passaggi</dt>
              <dd>
                <Badge tone="positive">
                  <ShieldCheck aria-hidden className="size-3.5" />
                  Attiva
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Registrazione pubblica</dt>
              <dd className="font-medium text-fg">Disattivata</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Sessione" description="Esci da questo dispositivo. La sessione resta attiva finché non esci." />
          <SignOutButton className="border border-line" />
        </Card>
      </div>
    </>
  )
}
