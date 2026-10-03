import { FileUp } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Importazioni' }

export default function Page() {
  return <ComingSoon title="Importazioni" description="Carica i CSV delle tue banche e consulta lo storico." sprint={3} icon={FileUp} />
}
