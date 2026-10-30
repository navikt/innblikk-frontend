import { Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { isFullWidthPath, routes } from './routes.tsx'

vi.mock('./features/sql-next', () => ({ SqlNextPage: () => <div>Ny SQL-editor</div> }))
vi.mock('./features/sql', () => ({ SqlEditor: () => <div>Gammel SQL-editor</div> }))

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
