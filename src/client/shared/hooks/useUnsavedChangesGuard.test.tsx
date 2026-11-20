import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { hasUnsavedChanges, useUnsavedChangesGuard } from './useUnsavedChangesGuard.ts'

function Editor() {
  const navigate = useNavigate()
  const { isLeaveBlocked, cancelLeave, confirmLeave } = useUnsavedChangesGuard(true)
  return (
    <>
      <div>Draft</div>
      <button onClick={() => void navigate('/other?from=program#target')}>Navigate</button>
      <button onClick={() => void navigate('/editor?draft=1#section')}>Anchor</button>
      {isLeaveBlocked && (
        <div role="dialog">
          <button onClick={cancelLeave}>Stay</button>
          <button onClick={confirmLeave}>Discard</button>
        </div>
      )}
    </>
  )
}

function setup() {
  const router = createMemoryRouter(
    [
      { path: '/first', element: <div>First</div> },
      { path: '/editor', element: <Editor /> },
      { path: '/last', element: <div>Last</div> },
      { path: '/other', element: <div>Other</div> },
    ],
    { initialEntries: ['/first', '/editor?draft=1', '/last'], initialIndex: 1 },
  )
  const result = render(<RouterProvider router={router} />)
  return { router, ...result }
}

describe('useUnsavedChangesGuard', () => {
  it('allows same-document anchors without a discard dialog', async () => {
    const user = userEvent.setup()
    const { router } = setup()
    await user.click(screen.getByRole('button', { name: 'Anchor' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.hash).toBe('#section')
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('cancels Back without changing the URL or draft and discards by resuming the original POP', async () => {
    const user = userEvent.setup()
    const { router } = setup()
    await act(() => router.navigate(-1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(router.state.location.pathname + router.state.location.search).toBe('/editor?draft=1')
    await user.click(screen.getByRole('button', { name: 'Stay' }))
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(router.state.location.pathname + router.state.location.search).toBe('/editor?draft=1')
    await act(() => router.navigate(-1))
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(await screen.findByText('First')).toBeInTheDocument()
    await act(() => router.navigate(1))
    expect(await screen.findByText('Draft')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?draft=1')
  })

  it('resumes Forward after discard', async () => {
    const user = userEvent.setup()
    const { router } = setup()
    await act(() => router.navigate(1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(await screen.findByText('Last')).toBeInTheDocument()
    await act(() => router.navigate(-1))
    expect(await screen.findByText('Draft')).toBeInTheDocument()
  })

  it('blocks programmatic navigation and resumes its exact destination', async () => {
    const user = userEvent.setup()
    const { router } = setup()
    await user.click(screen.getByRole('button', { name: 'Navigate' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(await screen.findByText('Other')).toBeInTheDocument()
    expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe(
      '/other?from=program#target',
    )
  })

  it('registers a native unload warning while dirty and removes it on unmount', () => {
    const { unmount } = setup()
    expect(hasUnsavedChanges()).toBe(true)
    const event = new Event('beforeunload', { cancelable: true })
    fireEvent(window, event)
    expect(event.defaultPrevented).toBe(true)
    unmount()
    expect(hasUnsavedChanges()).toBe(false)
    const after = new Event('beforeunload', { cancelable: true })
    fireEvent(window, after)
    expect(after.defaultPrevented).toBe(false)
  })
})
