import type { Metadata } from 'next'

import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ProfileForm } from '@/features/profile/profile-form'
import { DEFAULT_TIME_ZONE } from '@/lib/dates'
import { timeZoneOptions } from '@/lib/dates/time-zones'
import { getProfile, requireUser } from '@/server/auth/session'

export const metadata: Metadata = { title: 'Profilo' }

export default async function ProfileSettingsPage() {
  await requireUser('/settings/profile')
  const profile = await getProfile()
  return (
    <>
      <PageHeader title="Profilo e aspetto" description="Il nome del saluto, il fuso orario delle date e il tema." />
      <div className="grid gap-4">
        <Card>
          <CardHeader title="Profilo" description="Valuta: euro. I mesi e “oggi” seguono il fuso orario." />
          <ProfileForm displayName={profile?.display_name ?? ''} timeZone={profile?.timezone ?? DEFAULT_TIME_ZONE} timeZones={timeZoneOptions()} />
        </Card>
        <Card>
          <CardHeader title="Tema" description="Automatico segue il telefono o il PC. Ogni tocco passa al tema successivo." />
          <ThemeToggle showLabel className="border border-line" />
        </Card>
      </div>
    </>
  )
}
