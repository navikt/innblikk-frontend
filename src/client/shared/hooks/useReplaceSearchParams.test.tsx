import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { useReplaceSearchParams } from './useReplaceSearchParams.ts'

let completeOldRequest: (() => void) | undefined

function Page() {
  const location = useLocation()
  const replaceSearchParams = useReplaceSearchParams()
  return (
    <>
      <output>
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <button onClick={() => replaceSearchParams(new URLSearchParams({ period: 'last_28_days' }))}>Filter</button>
      <button
        onClick={() => {
          completeOldRequest = () => replaceSearchParams(new URLSearchParams({ event: 'stale' }))
        }}
      >
        Start request
      </button>
    </>
  )
}

describe('useReplaceSearchParams', () => {
  it('updates router location, preserves the hash, and does not add a history step', async () => {
    const router = createMemoryRouter(
      [
        { path: '/first', element: <div>First</div> },
        { path: '/report', element: <Page /> },
      ],
      { initialEntries: ['/first', '/report?period=last_7_days#results'], initialIndex: 1 },
    )
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByText('Filter'))
    expect(screen.getByRole('status')).toHaveTextContent('/report?period=last_28_days#results')
    await act(() => router.navigate(-1))
    expect(screen.getByText('First')).toBeInTheDocument()
  })

  it('does not let a request from an unmounted page rewrite the destination', async () => {
    const router = createMemoryRouter(
      [
        { path: '/report', element: <Page /> },
        { path: '/other', element: <div>Other</div> },
      ],
      { initialEntries: ['/report'] },
    )
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByText('Start request'))
    await act(() => router.navigate('/other?websiteId=new#target'))
    act(() => completeOldRequest?.())
    expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe(
      '/other?websiteId=new#target',
    )
  })
})
