import { ChartPie } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Analytics' }

export default function Page() {
  return <ComingSoon title="Analytics" description="Da dove arrivano i tuoi soldi e dove finiscono." sprint={6} icon={ChartPie} />
}
