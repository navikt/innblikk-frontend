import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { routes } from '../../../routes.tsx'
import Features from './Features.tsx'

describe('Features', () => {
  it('groups public features and links every card to a registered route', () => {
    render(
      <MemoryRouter>
        <Features />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Funksjoner i Innblikk' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Funksjonsområder' })).getAllByRole('link')).toHaveLength(5)
    const sections = screen.getAllByRole('region')
    expect(sections).toHaveLength(5)
    const cards = sections.flatMap((section) => within(section).getAllByRole('link'))
    expect(cards).toHaveLength(21)
    for (const card of cards) {
      expect(routes.some((route) => route.path === card.getAttribute('href'))).toBe(true)
    }
    expect(screen.queryByRole('link', { name: /ReOps-internt|Copilot|Diagnose/ })).not.toBeInTheDocument()
    expect(routes.some((route) => route.path === '/funksjoner' && route.fullWidth)).toBe(true)
    const visitors = within(screen.getByRole('region', { name: 'Hva vet vi om de besøkende?' }))
    expect(visitors.getByRole('link', { name: /Brukerdetaljer/ })).toBeInTheDocument()
    expect(visitors.getByRole('link', { name: /Enkeltbrukere/ })).toBeInTheDocument()
    const behavior = within(screen.getByRole('region', { name: 'Hva gjør de besøkende?' }))
    expect(behavior.getByRole('link', { name: /Navigasjonsflyt/ })).toBeInTheDocument()
    expect(behavior.getByRole('link', { name: /Måloppnåelse/ })).toBeInTheDocument()
    expect(behavior.queryByRole('link', { name: /Brukerdetaljer/ })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Hvordan kan vi bygge og dele egne analyser?' })).getByRole('link', {
        name: /Brukergrupper/,
      }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Hva bør vi kvalitetssikre?' })).getByRole('link', {
        name: /Personvernssjekk/,
      }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Hvor mange besøker oss, og hvor kommer de fra?' })).queryByRole(
        'link',
        { name: /Brukerdetaljer/ },
      ),
    ).not.toBeInTheDocument()
  })

  it('preserves analysis filters without carrying unrelated parameters into cards', () => {
    render(
      <MemoryRouter initialEntries={['/funksjoner?websiteId=123&period=last7days&secret=discard']}>
        <Features />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Trafikkoversikt/ })).toHaveAttribute(
      'href',
      '/trafikkanalyse?period=last7days&websiteId=123',
    )
    expect(screen.getByRole('link', { name: /^Dashboard/ })).toHaveAttribute('href', '/dashboard')
  })
})
