import { FileUp } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/ui/empty-state'

export default function ImportNotFound() {
  return (
    <EmptyState
      icon={FileUp}
      title="Importazione non trovata"
      description="L’importazione non esiste o non appartiene al tuo account."
      action={
        <Link href="/imports" className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">
          Torna alle importazioni
        </Link>
      }
    />
  )
}
