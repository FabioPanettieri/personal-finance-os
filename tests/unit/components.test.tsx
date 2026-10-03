// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BottomNav } from '@/components/layout/bottom-nav'
import { initialsFor } from '@/components/layout/user-menu'
import { DeltaBadge } from '@/components/ui/delta-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Field } from '@/components/ui/field'
import { KpiCard } from '@/components/ui/kpi-card'
import { Money } from '@/components/ui/money'
import { cents } from '@/lib/money'
import { Wallet } from 'lucide-react'

const pathname = vi.hoisted(() => ({ current: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))
vi.mock('@/features/auth/actions', () => ({ signOut: vi.fn() }))

afterEach(cleanup)

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/ | /g, ' ')

describe('Money', () => {
  it('formatta i centesimi in euro con cifre tabulari', () => {
    render(<Money value={cents(123456)} />)
    const el = screen.getByText(/1\.234,56/)
    expect(el).toHaveClass('tabular')
  })

  it('colora per segno solo se richiesto', () => {
    const { container } = render(<Money value={cents(-500)} tone="signed" />)
    expect(container.firstChild).toHaveClass('text-negative')
  })

  it('in modalità hero mantiene un’etichetta accessibile completa', () => {
    const { container } = render(<Money value={cents(4821532)} emphasizeUnits />)
    expect((container.firstChild as HTMLElement).getAttribute('aria-label')?.replace(/ | /g, ' ')).toBe('48.215,32 €')
  })
})

describe('DeltaBadge', () => {
  it('per le spese un aumento è sfavorevole', () => {
    const { container } = render(<DeltaBadge ratio={0.12} goodWhen="down" />)
    expect(container.firstChild).toHaveClass('text-negative')
    expect(text(container.firstChild as HTMLElement)).toContain('+12,0')
  })

  it('senza riferimento mostra un trattino', () => {
    render(<DeltaBadge ratio={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('KpiCard', () => {
  it('distingue "nessun dato" da zero', () => {
    const { rerender } = render(<KpiCard label="Entrate" value={null} icon={Wallet} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    rerender(<KpiCard label="Entrate" value={cents(0)} icon={Wallet} />)
    expect(screen.getByText(/0,00/)).toBeInTheDocument()
  })
})

describe('stati', () => {
  it('EmptyState mostra titolo, descrizione e azione', () => {
    render(<EmptyState title="Nessun movimento" description="Importa un CSV" action={<button>Importa</button>} />)
    expect(screen.getByRole('heading', { name: 'Nessun movimento' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importa' })).toBeInTheDocument()
  })

  it('ErrorState è annunciato come alert e mostra solo il riferimento opaco', () => {
    render(<ErrorState reference="abc123" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Rif. abc123')
  })
})

describe('Field', () => {
  it('collega errore e input via ARIA', () => {
    render(<Field label="Email" name="email" error="Email non valida" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Email non valida')
  })
})

describe('BottomNav', () => {
  it('mostra 5 voci e marca quella corrente', () => {
    pathname.current = '/settings/security'
    render(<BottomNav />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Impostazioni' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })
})

describe('initialsFor', () => {
  it('ricava le iniziali da nome o email', () => {
    expect(initialsFor({ displayName: 'Mario Rossi', email: null })).toBe('MR')
    expect(initialsFor({ displayName: null, email: 'mario.rossi@example.test' })).toBe('MR')
    expect(initialsFor({ displayName: null, email: null })).toBe('?')
  })
})
