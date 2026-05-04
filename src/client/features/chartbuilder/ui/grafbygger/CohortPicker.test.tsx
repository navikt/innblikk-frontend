import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createRef } from 'react'
import CohortPicker from './CohortPicker.tsx'
import type { CohortPickerRef } from './CohortPicker.tsx'
import { fetchCohorts } from '../../api/cohortApi.ts'

vi.mock('../../api/cohortApi.ts', () => ({
  fetchCohorts: vi.fn(),
  fetchCohortDetail: vi.fn(),
}))

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
    it('shows "Ingen kohorter valgt" when no cohorts selected', async () => {
      mockFetchCohorts.mockResolvedValue([])
      renderCohortPicker()
      await waitFor(() => {
        expect(screen.getByText(/ingen kohorter valgt/i)).toBeInTheDocument()
      })
    })

    it('shows Loader while fetching', () => {
      mockFetchCohorts.mockReturnValue(new Promise(() => {}))
      renderCohortPicker()
      expect(screen.getByTitle(/laster kohorter/i)).toBeInTheDocument()
    })

    it('shows Alert on fetch error', async () => {
      mockFetchCohorts.mockRejectedValue(new Error('network error'))
      renderCohortPicker()
      await waitFor(() => {
        expect(screen.getByText(/kunne ikke laste kohorter/i)).toBeInTheDocument()
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
        expect(screen.queryByTitle(/laster kohorter/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg kohorter/i })
      await user.click(combobox)
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /kohort a/i })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: /kohort b/i })).toBeInTheDocument()
      })
    })
  })

  describe('selection', () => {
    it('fires onCohortIdsChange with id when cohort is selected', async () => {
      mockFetchCohorts.mockResolvedValue([{ id: 'c1', websiteId: 'site-1', name: 'Kohort A' }])
      const { onCohortIdsChange } = renderCohortPicker()
      const user = userEvent.setup()
      await waitFor(() => {
        expect(screen.queryByTitle(/laster kohorter/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg kohorter/i })
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
        expect(screen.queryByTitle(/laster kohorter/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg kohorter/i })
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
        expect(screen.queryByTitle(/laster kohorter/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg kohorter/i })
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
        expect(screen.queryByTitle(/laster kohorter/i)).not.toBeInTheDocument()
      })
      const combobox = screen.getByRole('combobox', { name: /velg kohorter/i })
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
