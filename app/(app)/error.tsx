'use client'

import { RotateCw } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Solo il digest: il messaggio potrebbe contenere dati.
    console.error('[app] errore di rendering', { digest: error.digest })
  }, [error])

  return (
    <ErrorState
      reference={error.digest}
      action={
        <Button variant="secondary" onClick={reset}>
          <RotateCw aria-hidden className="size-4" />
          Riprova
        </Button>
      }
    />
  )
}
