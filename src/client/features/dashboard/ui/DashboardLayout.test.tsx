import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout.tsx'

function LocationDisplay() {
  const { pathname, search } = useLocation()
  return <output aria-label="Gjeldende adresse">{pathname + search}</output>
}

describe('DashboardLayout breadcrumbs', () => {
  it('shows the hierarchy above the title without changing the existing content', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/12']}>
        <DashboardLayout
          title="Besøk"
          team={{ id: 7, name: 'Team innsikt' }}
          description="Trafikk for teamet"
          headerActions={<button>Rediger</button>}
          showKontaktSection={false}
        >
          Grafer
        </DashboardLayout>
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: 'Brødsmulesti' })
    expect(
      within(navigation)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Dashboard', 'Team innsikt', 'Besøk'])
    expect(within(navigation).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(within(navigation).getByRole('link', { name: 'Team innsikt' })).toHaveAttribute(
      'href',
      '/dashboard?projectId=7',
    )
    expect(within(navigation).getByText('Besøk')).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).queryByRole('link', { name: 'Besøk' })).not.toBeInTheDocument()
    expect(
      navigation.compareDocumentPosition(screen.getByRole('heading', { name: 'Besøk', level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('Trafikk for teamet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rediger' })).toBeInTheDocument()
    expect(screen.getByText('Grafer')).toBeInTheDocument()
  })

  it.each([
    ['Team innsikt', '/dashboard?projectId=7'],
    ['Dashboard', '/dashboard'],
  ])('navigates through %s even when arriving via a direct dashboard link', async (name, destination) => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/dashboard/12?focused=true&websiteId=example']}>
        <DashboardLayout title="Besøk" team={{ id: 7, name: 'Team innsikt' }} showKontaktSection={false}>
          Grafer
        </DashboardLayout>
        <LocationDisplay />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name }))

    expect(screen.getByLabelText('Gjeldende adresse')).toHaveTextContent(destination)
  })

  it('does not add breadcrumbs to layouts without a team', () => {
    render(
      <DashboardLayout title="Oversikt" showKontaktSection={false}>
        Grafer
      </DashboardLayout>,
    )

    expect(screen.queryByRole('navigation', { name: 'Brødsmulesti' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oversikt', level: 1 })).toBeInTheDocument()
  })
})
