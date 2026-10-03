import { LineChart } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Investimenti' }

export default function Page() {
  return <ComingSoon title="Investimenti" description="Capitale versato, valore attuale e PAC su Trade Republic." sprint={8} icon={LineChart} />
}
