import { Landmark } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Conti' }

export default function Page() {
  return <ComingSoon title="Conti" description="ING Direct, Revolut, Trade Republic e gli altri tuoi conti." sprint={2} icon={Landmark} />
}
