import type { LucideIcon } from 'lucide-react'
import { ArrowLeftRight, Briefcase, House, Landmark, Plus } from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** Azione principale (Importa): pulsante evidenziato al centro della barra mobile. */
  primary?: boolean
  /** Altri percorsi che attivano la voce. */
  matches?: readonly string[]
}

/** Cinque voci, uguali su desktop (sidebar) e mobile (barra in basso). */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/', label: 'Home', icon: House, matches: ['/reports'] },
  { href: '/transactions', label: 'Movimenti', icon: ArrowLeftRight },
  { href: '/imports/new', label: 'Importa', icon: Plus, primary: true, matches: ['/imports'] },
  { href: '/accounts', label: 'Conti', icon: Landmark, matches: ['/investments'] },
  { href: '/business', label: 'Business', icon: Briefcase },
]

/** Una voce è attiva sulla sua pagina e sulle sottopagine; la Home solo su "/". */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Voce da evidenziare per il percorso corrente (null se nessuna, es. Impostazioni). */
export function activePrimaryHref(pathname: string): string | null {
  const item = PRIMARY_NAV.find(
    (i) => isNavItemActive(pathname, i.href) || (i.matches ?? []).some((m) => isNavItemActive(pathname, m)),
  )
  return item?.href ?? null
}
