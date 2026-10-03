import Link from 'next/link'

import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <EmptyState
        className="w-full"
        title="Pagina non trovata"
        description="L’indirizzo non esiste o è stato spostato."
        action={
          <Link href="/" className="text-sm font-medium text-accent hover:underline">
            Torna alla Home
          </Link>
        }
      />
    </main>
  )
}
