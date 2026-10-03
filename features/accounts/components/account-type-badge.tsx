import { Badge } from '@/components/ui/badge'
import type { AccountType } from '@/server/repositories/accounts'

export function AccountTypeBadge({ type }: { type: AccountType }) {
  return <Badge tone={type.kind === 'investment' ? 'accent' : 'neutral'}>{type.label}</Badge>
}
