import { Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { isFullWidthPath, routes } from './routes.tsx'

vi.mock('./features/sql-next', () => ({ SqlNextPage: () => <div>Ny SQL-editor</div> }))
vi.mock('./features/sql', () => ({ SqlEditor: () => <div>Gammel SQL-editor</div> }))
vi.mock('./features/chartbuilder-next', () => ({
  Grafbygger: ({ edition }: { edition?: string }) => <div data-testid="builder" data-edition={edition} />,
}))

function LocationProbe() {
  const { pathname, search, hash } = useLocation()
  return (
    <output data-testid="location">
      {pathname}
      {search}
      {hash}
    </output>
  )
}

describe('builder routes', () => {
  it.each(['/grafbygger', '/grafbygger-next', '/grafbygger_next', '/grafbygger-alfa'])(
    'opens the beta builder from %s and keeps URL parameters',
    async (path) => {
      const suffix = '?websiteId=site-1&focused=1#hendelser'
      render(
        <MemoryRouter initialEntries={[`${path}${suffix}`]}>
          <Suspense fallback={null}>
            <Routes>
              {routes
                .filter((route) => route.path.startsWith('/grafbygger'))
                .map((route) => (
                  <Route key={route.path} path={route.path} element={route.component} />
                ))}
            </Routes>
          </Suspense>
          <LocationProbe />
        </MemoryRouter>,
      )
      expect(await screen.findByTestId('builder')).toHaveAttribute('data-edition', 'next')
      expect(screen.getByTestId('location')).toHaveTextContent(`/grafbygger${suffix}`)
      expect(isFullWidthPath(path)).toBe(true)
    },
  )

  it('keeps the previous builder at /grafbygger-eol', async () => {
    const route = routes.find((entry) => entry.path === '/grafbygger-eol')
    render(<Suspense fallback={null}>{route?.component}</Suspense>)
    expect(await screen.findByTestId('builder')).toHaveAttribute('data-edition', 'current')
    expect(isFullWidthPath('/grafbygger-eol')).toBe(true)
  })

  it('does not keep the misspelled grafbyggeren-alfa route or add a redirect', () => {
    expect(routes.some((route) => route.path === '/grafbyggeren-alfa')).toBe(false)
  })
})

describe('SQL routes', () => {
  it.each([
    ['/sql', 'Ny SQL-editor'],
    ['/sql-old', 'Gammel SQL-editor'],
  ])('opens the intended editor at %s', async (path, label) => {
    const route = routes.find((entry) => entry.path === path)
    expect(route).toBeDefined()
    render(<Suspense fallback={null}>{route?.component}</Suspense>)
    expect(await screen.findByText(label)).toBeInTheDocument()
    expect(isFullWidthPath(path)).toBe(true)
  })

  it('does not keep the temporary sql-next route', () => {
    expect(routes.some((route) => route.path === '/sql-next')).toBe(false)
  })
})

describe('isFullWidthPath', () => {
  it('registers the unlisted alpha repetition analysis', () => {
    expect(routes.some((route) => route.path === '/gjentatt-aktivitet')).toBe(true)
    expect(isFullWidthPath('/gjentatt-aktivitet')).toBe(true)
  })
  it('treats every brukergrupper page as full width, including the edit route', () => {
    expect(isFullWidthPath('/brukergrupper')).toBe(true)
    expect(isFullWidthPath('/brukergrupper/ny')).toBe(true)
    expect(isFullWidthPath('/brukergrupper/9')).toBe(true)
  })

  it('treats the sidegrupper list and its editor routes as full width', () => {
    expect(isFullWidthPath('/sidegrupper')).toBe(true)
    expect(isFullWidthPath('/sidegrupper/ny')).toBe(true)
    expect(isFullWidthPath('/sidegrupper/abc-123')).toBe(true)
  })
})
