import { Landmark } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/ui/empty-state'

export default function AccountNotFound() {
  return (
    <EmptyState
      icon={Landmark}
      title="Conto non trovato"
      description="Il conto non esiste o non appartiene al tuo account."
      action={
        <Link href="/accounts" className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">
          Torna ai conti
        </Link>
      }
    />
  )
}
