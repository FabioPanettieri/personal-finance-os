import { Wallet } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Patrimonio' }

export default function Page() {
  return <ComingSoon title="Patrimonio" description="Il valore complessivo dei tuoi conti e investimenti nel tempo." sprint={5} icon={Wallet} />
}
