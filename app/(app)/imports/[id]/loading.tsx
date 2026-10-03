import { Skeleton } from '@/components/ui/skeleton'

export default function ImportLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Caricamento anteprima…</span>
      <Skeleton className="mb-6 h-8 w-64" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-[var(--radius-card)]" />
    </div>
  )
}
