import { ArrowLeftRight } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Transazioni' }

export default function Page() {
  return <ComingSoon title="Transazioni" description="Cerca, filtra e classifica tutti i movimenti." sprint={4} icon={ArrowLeftRight} />
}
