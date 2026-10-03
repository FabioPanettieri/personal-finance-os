import { Landmark } from 'lucide-react'
import type { Metadata } from 'next'

import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { AccountList } from '@/features/accounts/components/account-list'
import { AccountTotals } from '@/features/accounts/components/account-totals'
import { totalsByCurrency } from '@/lib/accounts'
import { requireUser } from '@/server/auth/session'
import { listAccounts } from '@/server/repositories/accounts'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Conti' }

export default async function AccountsPage() {
  await requireUser('/accounts')
  const accounts = await listAccounts(await createSupabaseServerClient())

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="Conti" description="ING Direct, Revolut, Trade Republic e gli altri tuoi conti." />
        <EmptyState
          icon={Landmark}
          title="Nessun conto"
          description="I conti iniziali vengono creati con il tuo account. Se non li vedi, verifica che le migration del database siano applicate."
        />
      </>
    )
  }

  const active = accounts.filter((a) => a.isActive)
  const inactive = accounts.filter((a) => !a.isActive)
  const totals = totalsByCurrency(accounts.map((a) => ({ currency: a.currency, balance: a.balance, kind: a.type.kind })))

  return (
    <>
      <PageHeader title="Conti" description="Saldi calcolati dai movimenti registrati, mai inseriti a mano." />
      <div className="flex flex-col gap-6 lg:gap-8">
        <AccountTotals totals={totals} />

        <section aria-labelledby="active-accounts">
          <h2 id="active-accounts" className="mb-3 text-[13px] font-medium tracking-wide text-fg-muted uppercase">
            Conti attivi · {active.length}
          </h2>
          {active.length > 0 ? (
            <AccountList accounts={active} label="Conti attivi" />
          ) : (
            <EmptyState icon={Landmark} title="Nessun conto attivo" description="Riattiva un conto dall’elenco qui sotto." />
          )}
        </section>

        {inactive.length > 0 ? (
          <section aria-labelledby="inactive-accounts">
            <h2 id="inactive-accounts" className="mb-3 text-[13px] font-medium tracking-wide text-fg-muted uppercase">
              Disattivati · {inactive.length}
            </h2>
            <AccountList accounts={inactive} label="Conti disattivati" />
          </section>
        ) : null}
      </div>
    </>
  )
}
