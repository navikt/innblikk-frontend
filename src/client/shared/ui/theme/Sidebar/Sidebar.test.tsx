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

describe('Sidebar campaign navigation', () => {
  it.each([
    ['?websiteId=supported', true],
    ['?websiteId=unsupported', false],
    ['?websiteId=unknown', false],
    ['?domain=supported.nav.no', true],
    ['?websiteId=unsupported&domain=supported.nav.no', false],
    ['?websiteId=supported&domain=app.dev.nav.no', false],
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
