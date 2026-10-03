import { Goal } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Obiettivi' }

export default function Page() {
  return <ComingSoon title="Obiettivi" description="Traguardi di risparmio e il loro avanzamento." sprint={10} icon={Goal} />
}
