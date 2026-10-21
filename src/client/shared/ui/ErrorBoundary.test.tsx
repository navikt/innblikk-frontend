import { act, fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import * as pageRecovery from '../lib/pageRecovery.ts'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard.ts'

const chunkError = new Error('Failed to fetch dynamically imported module: /assets/page-old.js')

function BrokenPage({ error }: { error: Error }) {
  throw error
  return null
}

function Editor({ fail }: { fail: boolean }) {
  useUnsavedChangesGuard(true)
  return fail ? <BrokenPage error={chunkError} /> : <div>Ulagret arbeid</div>
}

describe('page recovery policy', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reloads only once per app version and tab, even after remounting', () => {
    const reload = vi.fn()
    expect(pageRecovery.tryReloadPage(reload)).toBe(true)
    expect(pageRecovery.tryReloadPage(reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when session storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    const reload = vi.fn()
    expect(pageRecovery.tryReloadPage(reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it.each([
    'Failed to fetch dynamically imported module: /assets/page.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Loading chunk 123 failed.',
    'Loading CSS chunk 123 failed.',
    'Unable to preload CSS for /assets/page.css',
  ])('recognizes a page-loading failure: %s', (message) => {
    expect(pageRecovery.isPageLoadError(new Error(message))).toBe(true)
  })

  it('does not treat an ordinary rendering bug as a page-loading failure', () => {
    expect(pageRecovery.isPageLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
  })
})

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(pageRecovery, 'tryReloadPage').mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('attempts recovery without flashing a warning or loading message', () => {
    render(
      <ErrorBoundary>
        <BrokenPage error={chunkError} />
      </ErrorBoundary>,
    )
    expect(pageRecovery.tryReloadPage).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Laster siden')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(screen.queryByTitle('Laster siden')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByTitle('Laster siden')).toBeInTheDocument()
  })

  it('shows a calm fallback when automatic recovery has already been attempted', () => {
    vi.mocked(pageRecovery.tryReloadPage).mockReturnValue(false)
    render(
      <ErrorBoundary>
        <BrokenPage error={chunkError} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Vi fikk ikke åpnet siden. Prøv igjen.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument()
  })

  it('offers retry if navigation does not finish', () => {
    render(
      <ErrorBoundary>
        <BrokenPage error={chunkError} />
      </ErrorBoundary>,
    )
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(screen.getByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument()
  })

  it('does not reload automatically for an ordinary rendering bug', () => {
    render(
      <ErrorBoundary>
        <BrokenPage error={new Error('Rendering bug')} />
      </ErrorBoundary>,
    )
    expect(pageRecovery.tryReloadPage).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument()
  })

  it('waits for connectivity before attempting recovery', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(
      <ErrorBoundary>
        <BrokenPage error={chunkError} />
      </ErrorBoundary>,
    )
    expect(pageRecovery.tryReloadPage).not.toHaveBeenCalled()
    expect(screen.getByText(/Du ser ut til å være frakoblet/)).toBeInTheDocument()
    fireEvent.online(window)
    expect(pageRecovery.tryReloadPage).toHaveBeenCalledTimes(1)
  })

  it('does not reload when an editor has unsaved changes, even when the error unmounts it', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Editor fail={false} />
      </ErrorBoundary>,
    )
    rerender(
      <ErrorBoundary>
        <Editor fail />
      </ErrorBoundary>,
    )
    expect(pageRecovery.tryReloadPage).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument()
  })

  it('cancels pending recovery when unmounted', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { unmount } = render(
      <ErrorBoundary>
        <BrokenPage error={chunkError} />
      </ErrorBoundary>,
    )
    unmount()
    fireEvent.online(window)
    expect(pageRecovery.tryReloadPage).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
