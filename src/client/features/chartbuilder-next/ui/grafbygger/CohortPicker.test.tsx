import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createRef } from 'react'
import CohortPicker from './CohortPicker.tsx'
import type { CohortPickerRef } from './CohortPicker.tsx'
import { fetchCohorts } from '../../api/cohortApi.ts'
import type { CohortDto } from '../../../../shared/types/cohort.ts'

vi.mock('../../api/cohortApi.ts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchCohorts: vi.fn(),
    fetchCohortDetail: vi.fn(),
    // Selected cohorts have no criteria trees in these tests — never time-based.
    fetchCohortsDeep: vi.fn().mockResolvedValue(new Map()),
  }
})

const mockFetchCohorts = vi.mocked(fetchCohorts)

function renderCohortPicker(overrides: Partial<React.ComponentProps<typeof CohortPicker>> = {}) {
  const onCohortIdsChange = vi.fn()
  const onRatioModeChange = vi.fn()
  const ref = createRef<CohortPickerRef>()

  const utils = render(
    <CohortPicker
      ref={ref}
      websiteId="site-1"
      onCohortIdsChange={onCohortIdsChange}
      onRatioModeChange={onRatioModeChange}
      {...overrides}
    />,
  )

  return { ...utils, onCohortIdsChange, onRatioModeChange, ref }
}

describe('CohortPicker', () => {
  describe('initial render', () => {
    it('shows the cohort combobox with no chips selected when no cohorts are chosen', async () => {
      mockFetchCohorts.mockResolvedValue([])
      renderCohortPicker()
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /velg brukergrupper/i })).toBeInTheDocument()
      })
      expect(screen.queryByRole('button', { name: /fjern/i })).not.toBeInTheDocument()
    })

    it('shows Loader while fetching', () => {
      mockFetchCohorts.mockReturnValue(new Promise(() => {}))
      renderCohortPicker()
      expect(screen.getByTitle(/laster brukergrupper/i)).toBeInTheDocument()
    })

    it('shows Alert on fetch error', async () => {
      mockFetchCohorts.mockRejectedValue(new Error('network error'))
      renderCohortPicker()
      await waitFor(() => {
        expect(screen.getByText(/kunne ikke laste brukergrupper/i)).toBeInTheDocument()
      })
    })

    it('shows cohort names as combobox options after fetch resolves', async () => {
      mockFetchCohorts.mockResolvedValue([
        { id: 'c1', websiteId: 'site-1', name: 'Kohort A' },
        { id: 'c2', websiteId: 'site-1', name: 'Kohort B' },
      ])
      renderCohortPicker()
      const user = userEvent.setup()
      await waitFor(() => {
        expect(screen.queryByTitle(/laster brukergrupper/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg brukergrupper/i })
      await user.click(combobox)
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /kohort a/i })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: /kohort b/i })).toBeInTheDocument()
      })
    })

    it('shows the cohort name (not its id) as the chip label, even when the backend id arrives as a raw JSON number', async () => {
      // The actual backend serializes `id` as a JSON number (Kotlin Long), not
      // a string — CohortDto's `id: string` type is a lie the runtime payload
      // doesn't honor. Simulate that here instead of mocking with an
      // already-string id like the other tests do. Selection is keyed by
      // cohort *name* (unique per website, enforced by the backend), not id —
      // Aksel's UNSAFE_Combobox chip shows the option's raw `value` directly,
      // there's no separate label-for-chip concept, so `value` must be the name.
      mockFetchCohorts.mockResolvedValue([{ id: 42, websiteId: 'site-1', name: 'Kohort A' } as unknown as CohortDto])
      const { onCohortIdsChange } = renderCohortPicker()
      const user = userEvent.setup()
      await waitFor(() => {
        expect(screen.queryByTitle(/laster brukergrupper/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg brukergrupper/i })
      await user.click(combobox)
      const option = await screen.findByRole('option', { name: /kohort a/i })
      await user.click(option)

      const chip = await screen.findByRole('button', { name: /kohort a/i })
      expect(chip).toBeInTheDocument()
      expect(chip.textContent).toBe('Kohort A')

      // The real (coerced-to-string) id still reaches the parent for API calls.
      await waitFor(() => {
        expect(onCohortIdsChange).toHaveBeenCalledWith(['42'])
      })
    })
  })

  describe('selection', () => {
    it('fires onCohortIdsChange with id when cohort is selected', async () => {
      mockFetchCohorts.mockResolvedValue([{ id: 'c1', websiteId: 'site-1', name: 'Kohort A' }])
      const { onCohortIdsChange } = renderCohortPicker()
      const user = userEvent.setup()
      await waitFor(() => {
        expect(screen.queryByTitle(/laster brukergrupper/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg brukergrupper/i })
      await user.click(combobox)
      await user.click(screen.getByRole('option', { name: /kohort a/i }))
      await waitFor(() => {
        expect(onCohortIdsChange).toHaveBeenCalledWith(['c1'])
      })
    })

    it('shows ratio checkbox when 2 cohorts are selected', async () => {
      mockFetchCohorts.mockResolvedValue([
        { id: 'c1', websiteId: 'site-1', name: 'Kohort A' },
        { id: 'c2', websiteId: 'site-1', name: 'Kohort B' },
      ])
      renderCohortPicker()
      const user = userEvent.setup()
      await waitFor(() => {
        expect(screen.queryByTitle(/laster brukergrupper/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg brukergrupper/i })
      await user.click(combobox)
      await user.click(screen.getByRole('option', { name: /kohort a/i }))
      await user.click(combobox)
      await user.click(screen.getByRole('option', { name: /kohort b/i }))
      await waitFor(() => {
        expect(screen.getByRole('checkbox')).toBeInTheDocument()
      })
    })

    it('ratio checkbox label includes both cohort names', async () => {
      mockFetchCohorts.mockResolvedValue([
        { id: 'c1', websiteId: 'site-1', name: 'Kohort A' },
        { id: 'c2', websiteId: 'site-1', name: 'Kohort B' },
      ])
      renderCohortPicker()
      const user = userEvent.setup()
      await waitFor(() => {
        expect(screen.queryByTitle(/laster brukergrupper/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg brukergrupper/i })
      await user.click(combobox)
      await user.click(screen.getByRole('option', { name: /kohort a/i }))
      await user.click(combobox)
      await user.click(screen.getByRole('option', { name: /kohort b/i }))
      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /kohort a/i })).toBeInTheDocument()
        expect(screen.getByRole('checkbox', { name: /kohort b/i })).toBeInTheDocument()
      })
    })
  })

  describe('resetCohorts via ref', () => {
    it('clears selected cohorts after resetCohorts is called', async () => {
      mockFetchCohorts.mockResolvedValue([{ id: 'c1', websiteId: 'site-1', name: 'Kohort A' }])
      const { onCohortIdsChange, ref } = renderCohortPicker()
      const user = userEvent.setup()
      await waitFor(() => {
        expect(screen.queryByTitle(/laster brukergrupper/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg brukergrupper/i })
      await user.click(combobox)
      await user.click(screen.getByRole('option', { name: /kohort a/i }))
      await waitFor(() => {
        expect(onCohortIdsChange).toHaveBeenCalledWith(['c1'])
      })
      ref.current?.resetCohorts()
      await waitFor(() => {
        expect(onCohortIdsChange).toHaveBeenLastCalledWith([])
      })
    })
  })
})
