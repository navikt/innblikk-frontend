import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar.tsx'

vi.mock('../../../hooks/useIsReopsTeamMember.ts', () => ({
  useIsReopsTeamMember: () => ({ isReopsTeamMember: false }),
}))

vi.mock('../../../../../data/teamsData.json', () => ({
  default: [
    { websiteID: 'supported', teamDomain: 'supported.nav.no', supportsMarketing: true },
    { websiteID: 'unsupported', teamDomain: 'unsupported.nav.no', supportsMarketing: false },
  ],
}))

function WebsiteSwitcher() {
  const navigate = useNavigate()
  return <button onClick={() => void navigate('/trafikkanalyse?websiteId=unsupported')}>Switch website</button>
}

describe('Sidebar tools navigation', () => {
  it('recognizes canonical nested user-group editors and keeps common context in the list link', () => {
    render(
      <MemoryRouter initialEntries={['/brukergrupper/42?websiteId=site-1&period=last_7_days']}>
        <Sidebar theme="light" />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Brukergrupper' })
    expect(link).toHaveAttribute('aria-current', 'location')
    expect(link).toHaveAttribute('href', '/brukergrupper?period=last_7_days&websiteId=site-1')
  })

  it('links from event details to the list while retaining common filters only', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/utforsk-hendelser/hendelse/parameter?event=one&parameter=two&websiteId=site-1&urlPath=%2Fa&metricType=visitors',
        ]}
      >
        <Sidebar theme="light" />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Egendefinerte hendelser' })
    expect(link).toHaveAttribute('aria-current', 'location')
    expect(link).toHaveAttribute('href', '/utforsk-hendelser?urlPath=%2Fa&websiteId=site-1&metricType=visitors')
  })

  it('lists Sidegrupper immediately after Brukergrupper', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar theme="light" />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Vis undermeny for Verktøy' }))

    const sidegrupper = screen.getByRole('link', { name: 'Sidegrupper' })
    expect(sidegrupper).toHaveAttribute('href', '/sidegrupper')
    expect(screen.getByRole('link', { name: 'Brukergrupper' }).nextElementSibling).toBe(sidegrupper)
  })

  it('opens Verktøy when arriving directly at Sidegrupper', () => {
    render(
      <MemoryRouter initialEntries={['/sidegrupper']}>
        <Sidebar theme="light" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Skjul undermeny for Verktøy' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Sidegrupper' })).toBeVisible()
  })
})

describe('Sidebar campaign navigation', () => {
  it.each([
    ['?websiteId=supported', true],
    ['?websiteId=unsupported', false],
    ['?websiteId=unknown', false],
    ['?domain=supported.nav.no', true],
    ['?websiteId=unsupported&domain=supported.nav.no', false],
    ['?websiteId=supported&domain=app.dev.nav.no', true],
    ['', false],
  ])('checks marketing availability for %s', (search, available) => {
    render(
      <MemoryRouter initialEntries={[`/trafikkanalyse${search}`]}>
        <Sidebar theme="light" />
      </MemoryRouter>,
    )

    expect(Boolean(screen.queryByRole('link', { name: 'Kampanjer' }))).toBe(available)
    expect(screen.getByRole('link', { name: 'Trafikkoversikt' })).toBeInTheDocument()
  })

  it('updates when the selected website changes', () => {
    render(
      <MemoryRouter initialEntries={['/trafikkanalyse?websiteId=supported']}>
        <Sidebar theme="light" />
        <WebsiteSwitcher />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Kampanjer' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Switch website' }))
    expect(screen.queryByRole('link', { name: 'Kampanjer' })).not.toBeInTheDocument()
  })
})
