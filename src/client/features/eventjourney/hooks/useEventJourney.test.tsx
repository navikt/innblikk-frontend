import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEventJourney } from './useEventJourney.ts'

const { fetchEventJourneysMock } = vi.hoisted(() => ({ fetchEventJourneysMock: vi.fn() }))

vi.mock('../api/eventJourneyApi.ts', () => ({ fetchEventJourneys: fetchEventJourneysMock }))

const website = {
  id: 'site-1',
  name: 'Example',
  domain: 'example.no',
  teamId: 'team-1',
  createdAt: '2023-01-01T00:00:00Z',
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/?urlPath=https%3A%2F%2Fexample.no%2Fnyhetsbrev%3Futm_source%3Dtest']}>
    {children}
  </MemoryRouter>
)

describe('useEventJourney', () => {
  beforeEach(() => {
    fetchEventJourneysMock.mockReset().mockResolvedValue({ journeys: [] })
  })

  it('normalizes a pasted full URL before fetching', async () => {
    const { result } = renderHook(() => useEventJourney(), { wrapper })

    act(() => result.current.setSelectedWebsite(website))

    await waitFor(() => expect(fetchEventJourneysMock).toHaveBeenCalledTimes(1))
    expect(fetchEventJourneysMock).toHaveBeenCalledWith(expect.objectContaining({ urlPath: '/nyhetsbrev' }))
  })
})
