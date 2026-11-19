import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Komigang from './articles/Komigang.tsx'
import Oppsett from './topics/Oppsett.tsx'

vi.mock('../../settings', () => ({ TeamWebsites: () => null }))
vi.mock('../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx', () => ({ KontaktSeksjon: () => null }))
vi.mock('../../../shared/ui/theme/Skyra/Skyra.tsx', () => ({ Skyra: () => null }))

function CurrentLocation() {
  const { pathname } = useLocation()
  return <div data-testid="location">{pathname}</div>
}

describe('content navigation', () => {
  it('uses router navigation for the guide links and preserves the new-tab link', () => {
    render(
      <MemoryRouter initialEntries={['/komigang']}>
        <Komigang />
        <CurrentLocation />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Innblikk Dashboard:' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Bruk Navs taksnomi' })).toHaveAttribute('href', '/taksonomi')
    expect(screen.getByRole('link', { name: 'Bruk Navs taksnomi' })).toHaveAttribute('target', '_blank')
    fireEvent.click(screen.getByRole('link', { name: 'Grafbyggeren:' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/grafbygger')
  })

  it('uses router navigation for setup cards but keeps external and hash links', () => {
    render(
      <MemoryRouter initialEntries={['/oppsett']}>
        <Oppsett />
        <CurrentLocation />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'sporingskoder' })).toHaveAttribute('href', '#sporingskoder')
    expect(screen.getByRole('link', { name: /Retningslinjer/ })).toHaveAttribute(
      'href',
      'https://navno.sharepoint.com/sites/intranett-utvikling/SitePages/Rutine-for-bruk-av-Umami.aspx',
    )
    fireEvent.click(screen.getByRole('link', { name: /Oppsett guide/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/komigang')
    fireEvent.click(screen.getByRole('link', { name: /Grafbyggeren/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/grafbygger')
  })
})
