import type { LucideIcon } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

/** Pagina segnaposto per le sezioni pianificate (docs/05-roadmap.md). */
export function ComingSoon({
  title,
  description,
  sprint,
  icon,
}: {
  title: string
  description: string
  sprint: number
  icon: LucideIcon
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title="Sezione in arrivo"
        description={`Questa sezione verrà attivata nello Sprint ${sprint}. Nessun dato è ancora disponibile.`}
      />
    </>
  )
}
