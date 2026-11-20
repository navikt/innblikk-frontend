import { act, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { routes } from '../../routes.tsx'
import { RouteBreadcrumbsProvider } from './RouteBreadcrumbs.tsx'
import { PageHeader } from './theme/PageHeader/PageHeader.tsx'

function setup(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <RouteBreadcrumbsProvider>
            <PageHeader title="Page" description="Page description" />
            <Outlet />
          </RouteBreadcrumbsProvider>
        ),
        children: routes.map(({ path, breadcrumbs }) => ({
          path,
          element: <div>Content</div>,
          handle: { breadcrumbs },
        })),
      },
    ],
    { initialEntries: [initialEntry] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('route breadcrumbs', () => {
  it('places compact breadcrumbs above the title with minimum-size link targets', () => {
    setup('/utforsk-hendelser/hendelse?event=one')
    const heading = screen.getByRole('heading', { name: 'Page', level: 1 })
    const titleArea = heading.closest('div[style]')!
    const navigation = screen.getByRole('navigation', { name: 'Brødsmulesti' })
    expect(titleArea).toContainElement(screen.getByText('Page description'))
    expect(titleArea).toContainElement(navigation)
    expect(navigation.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(navigation).getByRole('list')).toHaveClass('text-base', 'leading-6')
    expect(within(navigation).getByRole('link')).toHaveClass('min-h-6', 'min-w-6')
  })

  it('does not show breadcrumbs for first-level screens', () => {
    setup('/utforsk-hendelser?websiteId=site-1')
    expect(screen.queryByRole('navigation', { name: 'Brødsmulesti' })).not.toBeInTheDocument()
  })

  it('shows event ancestors with encoded names and shared context, not parameter selection', () => {
    setup(
      '/utforsk-hendelser/hendelse/parameter?websiteId=site-1&period=last_7_days&urlPath=%2Fa&urlPath=%2Fb&event=A%2BB+C&parameter=valg',
    )
    const nav = screen.getByRole('navigation', { name: 'Brødsmulesti' })
    const eventLink = within(nav).getByRole('link', { name: 'A+B C' })
    expect(eventLink.parentElement?.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2)
    expect(eventLink.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
    const eventUrl = new URL(eventLink.getAttribute('href')!, 'https://example.test')
    expect(eventUrl.pathname).toBe('/utforsk-hendelser/hendelse')
    expect(eventUrl.searchParams.get('event')).toBe('A+B C')
    expect(eventUrl.searchParams.has('parameter')).toBe(false)
    expect(eventUrl.searchParams.getAll('urlPath')).toEqual(['/a', '/b'])
    expect(within(nav).getByText('valg')).toHaveAttribute('aria-current', 'page')
    const parentUrl = new URL(
      within(nav).getByRole('link', { name: 'Egendefinerte hendelser' }).getAttribute('href')!,
      'https://example.test',
    )
    expect(parentUrl.pathname).toBe('/utforsk-hendelser')
    expect(parentUrl.searchParams.has('event')).toBe(false)
    expect(parentUrl.searchParams.get('websiteId')).toBe('site-1')
  })

  it.each([
    ['/brukergrupper/ny', 'Brukergrupper', '/brukergrupper'],
    ['/sidegrupper/42', 'Sidegrupper', '/sidegrupper'],
    ['/hendelsesreiser/visualisering', 'Hendelsesforløp', '/hendelsesreiser'],
  ])('uses the same parent-navigation pattern for %s', (path, label, parentPath) => {
    setup(`${path}?websiteId=site-1`)
    const nav = screen.getByRole('navigation', { name: 'Brødsmulesti' })
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', `${parentPath}?websiteId=site-1`)
  })

  it('removes nested breadcrumbs when navigating to a first-level screen', async () => {
    const router = setup('/utforsk-hendelser/hendelse?event=one')
    expect(screen.getByRole('navigation', { name: 'Brødsmulesti' })).toBeInTheDocument()
    await act(() => router.navigate('/utforsk-hendelser'))
    expect(screen.queryByRole('navigation', { name: 'Brødsmulesti' })).not.toBeInTheDocument()
  })

  it('leaves dashboard detail breadcrumbs to the page instead of showing generic route labels', () => {
    setup('/dashboard/42')
    expect(screen.queryByRole('navigation', { name: 'Brødsmulesti' })).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboardvisning')).not.toBeInTheDocument()
  })
})
