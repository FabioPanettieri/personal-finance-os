import { NotebookText } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Report' }

export default function Page() {
  return <ComingSoon title="Report" description="Report settimanali, mensili e annuali." sprint={9} icon={NotebookText} />
}
