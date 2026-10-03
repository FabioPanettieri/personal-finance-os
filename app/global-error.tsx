'use client'

import './globals.css'

/** Ultima rete di sicurezza: sostituisce l'intero layout se il root fallisce. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-lg font-semibold">Errore imprevisto</h1>
          <p className="text-sm text-fg-muted">L’applicazione non è riuscita a caricarsi.</p>
          {error.digest ? <p className="font-mono text-xs text-fg-subtle">Rif. {error.digest}</p> : null}
          <button type="button" onClick={reset} className="rounded-md border border-line px-4 py-2 text-sm">
            Riprova
          </button>
        </main>
      </body>
    </html>
  )
}
