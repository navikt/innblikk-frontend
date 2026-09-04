import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import EventFilter from './EventFilter.tsx'

// ── helpers ───────────────────────────────────────────────────────────────────

function renderEventFilter(overrides: Partial<React.ComponentProps<typeof EventFilter>> = {}) {
  const setFilters = vi.fn()

  const utils = render(<EventFilter filters={[]} parameters={[]} setFilters={setFilters} {...overrides} />)

  return { ...utils, setFilters }
}

/** Unique element that only exists when the Sidevisninger card is active. */
const getSidevisningerCard = () => screen.getByRole('radio', { name: /hele nettstedet/i })

/** Unique element that only exists when the Egne hendelser card is active. */
const getCustomEventsCard = () => screen.getByRole('radio', { name: /utvalgte hendelser/i })

// ── tests ─────────────────────────────────────────────────────────────────────

describe('EventFilter', () => {
  describe('initial render', () => {
    it('shows the Sidevisninger card by default', () => {
      renderEventFilter()
      expect(getSidevisningerCard()).toBeInTheDocument()
    })

    it('does not show the Egne hendelser card by default', () => {
      renderEventFilter()
      expect(screen.queryByRole('radio', { name: /utvalgte hendelser/i })).not.toBeInTheDocument()
    })

    it('calls setFilters with the default event_type + url_path filters on mount', async () => {
      const setFilters = vi.fn()
      renderEventFilter({ setFilters })

      // The init effect defers via setTimeout and now uses a functional update —
      // resolve it against an empty previous state to assert the result.
      await waitFor(() => {
        expect(setFilters).toHaveBeenCalled()
      })
      const updater = setFilters.mock.calls[0][0] as unknown
      const next = typeof updater === 'function' ? (updater as (prev: unknown[]) => unknown[])([]) : updater
      expect(next).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column: 'event_type', value: '1' }),
          expect.objectContaining({ column: 'url_path', value: '{{url_sti}}', interactive: true }),
        ]),
      )
    })

    it('shows the "Legg til Egne hendelser" add button', () => {
      renderEventFilter()
      expect(screen.getByRole('button', { name: /egne hendelser/i })).toBeInTheDocument()
    })
  })

  describe('pageviews card', () => {
    it('removes the Sidevisninger card when "Fjern" is clicked', async () => {
      const user = userEvent.setup()
      renderEventFilter()

      // There is only one Fjern button initially
      await user.click(screen.getByRole('button', { name: /fjern/i }))

      expect(screen.queryByRole('radio', { name: /hele nettstedet/i })).not.toBeInTheDocument()
    })

    it('shows the "Legg til Sidevisninger" button after removing the card', async () => {
      const user = userEvent.setup()
      renderEventFilter()

      await user.click(screen.getByRole('button', { name: /fjern/i }))

      expect(screen.getByRole('button', { name: /sidevisninger/i })).toBeInTheDocument()
    })
  })

  describe('custom events card', () => {
    it('adds the Egne hendelser card when the add button is clicked', async () => {
      const user = userEvent.setup()
      renderEventFilter()

      await user.click(screen.getByRole('button', { name: /egne hendelser/i }))

      expect(getCustomEventsCard()).toBeInTheDocument()
      // Sidevisninger card still present too
      expect(getSidevisningerCard()).toBeInTheDocument()
    })

    it('removes the Egne hendelser card when its "Fjern" is clicked', async () => {
      const user = userEvent.setup()
      renderEventFilter()

      await user.click(screen.getByRole('button', { name: /egne hendelser/i }))
      expect(getCustomEventsCard()).toBeInTheDocument()

      // Now there are two Fjern buttons; the second belongs to Egne hendelser
      const fjernButtons = screen.getAllByRole('button', { name: /fjern/i })
      expect(fjernButtons).toHaveLength(2)
      await user.click(fjernButtons[1])

      expect(screen.queryByRole('radio', { name: /utvalgte hendelser/i })).not.toBeInTheDocument()
      // Add button should be back
      expect(screen.getByRole('button', { name: /egne hendelser/i })).toBeInTheDocument()
    })
  })

  describe('dirty state tracking', () => {
    it('reports not dirty in the default state', async () => {
      const onDirtyStateChange = vi.fn()
      renderEventFilter({ onDirtyStateChange })

      await waitFor(() => {
        const calls = onDirtyStateChange.mock.calls
        const lastCall = calls[calls.length - 1]
        expect(lastCall[0]).toBe(false)
      })
    })

    it('reports dirty after adding custom events', async () => {
      const user = userEvent.setup()
      const onDirtyStateChange = vi.fn()
      renderEventFilter({ onDirtyStateChange })

      await user.click(screen.getByRole('button', { name: /egne hendelser/i }))

      await waitFor(() => {
        const calls = onDirtyStateChange.mock.calls
        const lastCall = calls[calls.length - 1]
        expect(lastCall[0]).toBe(true)
      })
    })
  })

  describe('filter-only mode', () => {
    it('does not render event-type cards in filter-only mode', () => {
      renderEventFilter({ mode: 'filter-only' })
      expect(screen.queryByRole('radio', { name: /hele nettstedet/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /utvalgte hendelser/i })).not.toBeInTheDocument()
    })
  })
})
