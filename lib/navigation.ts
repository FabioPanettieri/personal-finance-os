import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  ChartPie,
  FileUp,
  Goal,
  House,
  Landmark,
  LineChart,
  NotebookText,
  Settings,
  Wallet,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

/** Navigazione primaria: bottom nav su mobile, prima sezione della sidebar. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/', label: 'Home', icon: House },
  { href: '/transactions', label: 'Transazioni', icon: ArrowLeftRight },
  { href: '/net-worth', label: 'Patrimonio', icon: Wallet },
  { href: '/analytics', label: 'Analytics', icon: ChartPie },
  { href: '/settings', label: 'Impostazioni', icon: Settings },
]

/** Sezioni secondarie: sidebar desktop, raggiungibili su mobile dalle pagine principali. */
export const SECONDARY_NAV: readonly NavItem[] = [
  { href: '/accounts', label: 'Conti', icon: Landmark },
  { href: '/investments', label: 'Investimenti', icon: LineChart },
  { href: '/reports', label: 'Report', icon: NotebookText },
  { href: '/goals', label: 'Obiettivi', icon: Goal },
  { href: '/imports', label: 'Importazioni', icon: FileUp },
]

/** Una voce è attiva sulla sua pagina e sulle sottopagine; la Home solo su "/". */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Voce primaria da evidenziare su mobile anche per le sezioni secondarie. */
export function activePrimaryHref(pathname: string): string | null {
  const direct = PRIMARY_NAV.find((item) => isNavItemActive(pathname, item.href))
  if (direct) return direct.href
  if (SECONDARY_NAV.some((item) => isNavItemActive(pathname, item.href))) {
    // Conti e investimenti fanno parte del patrimonio; il resto è analisi.
    return ['/accounts', '/investments'].some((href) => isNavItemActive(pathname, href)) ? '/net-worth' : '/analytics'
  }
  return null
}
