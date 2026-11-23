import { useReplaceSearchParams } from '../../../shared/hooks/useReplaceSearchParams'
import { useRef, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { format } from 'date-fns'
import WebsitePicker from '../ui/WebsitePicker'
import type { Website } from '../../../shared/types/chart'
import { useCaptureAnalysisLocation, useRestoreAnalysisContext } from './useRestoreAnalysisContext'

const websites = [
  { id: 'one', name: 'One', domain: 'one.no', teamId: 'team', createdAt: '2023-01-01' },
  { id: 'two', name: 'Two', domain: 'two.no', teamId: 'team', createdAt: '2023-01-01' },
]

function Harness() {
  const { search, hash } = useLocation()
  const params = new URLSearchParams(search)
  const [site, setSite] = useState<Website | null>(null)
  const [period, setPeriod] = useState(params.get('period') || '')
  const [mirrorPeriod, setMirrorPeriod] = useState(params.get('period') || '')
  const [paths, setPaths] = useState(params.getAll('urlPath'))
  const [operator, setOperator] = useState(params.get('pathOperator') || 'equals')
  const [metric, setMetric] = useState(params.get('metricType') || '')
  const [from, setFrom] = useState<Date | undefined>()
  const [to, setTo] = useState<Date | undefined>()
  const replace = useReplaceSearchParams()
  const capture = useCaptureAnalysisLocation(period)
  const pendingRequest = useRef<(() => boolean) | null>(null)
  useRestoreAnalysisContext({
    period: setPeriod,
    paths: setPaths,
    pathOperator: setOperator,
    metricType: setMetric,
    startDate: setFrom,
    endDate: setTo,
  })
  useRestoreAnalysisContext({ period: setMirrorPeriod })
  return (
    <>
      <WebsitePicker selectedWebsite={site} onWebsiteChange={setSite} disableAutoEvents />
      <output data-testid="state">
        {JSON.stringify([
          site?.id,
          period,
          paths,
          operator,
          metric,
          from && format(from, 'yyyy-MM-dd'),
          to && format(to, 'yyyy-MM-dd'),
        ])}
      </output>
      <output data-testid="location">{search + hash}</output>
      <output data-testid="mirror-period">{mirrorPeriod}</output>
      <button
        onClick={() => {
          setPeriod('draft')
          setMirrorPeriod('draft')
        }}
      >
        Draft
      </button>
      <button onClick={() => (pendingRequest.current = capture())}>Start request</button>
      <button
        onClick={() => {
          if (pendingRequest.current?.()) {
            const next = new URLSearchParams(search)
            next.set('period', 'stale')
            replace(next)
          }
        }}
      >
        Finish request
      </button>
      <button
        onClick={() => {
          const next = new URLSearchParams(search)
          next.set('period', 'last_28_days')
          replace(next)
          setPeriod('draft')
          setMirrorPeriod('draft')
        }}
      >
        Replace while editing
      </button>
    </>
  )
}

describe('same-route analysis context restoration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ data: websites }) })),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('restores website, repeated paths, period, dates and metric on links and Back without rewriting the URL', async () => {
    const first = '/report?websiteId=one&period=last_7_days&urlPath=%2Fa#first'
    const second =
      '/report?domain=two.no&period=custom&startDate=2026-01-01&endDate=2026-01-31&urlPath=%2Fb&urlPath=%2Bc&pathOperator=contains&metricType=pageviews#second'
    const router = createMemoryRouter([{ path: '/report', element: <Harness /> }], { initialEntries: [first] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('one'))
    await act(() => router.navigate(second))
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('two'))
    expect(JSON.parse(screen.getByTestId('state').textContent) as unknown[]).toEqual([
      'two',
      'custom',
      ['/b', '+c'],
      'contains',
      'pageviews',
      '2026-01-01',
      '2026-01-31',
    ])
    expect(screen.getByTestId('location')).toHaveTextContent(second.slice('/report'.length))
    expect(screen.getByTestId('mirror-period')).toHaveTextContent('custom')
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('one'))
    expect((JSON.parse(screen.getByTestId('state').textContent) as unknown[]).slice(0, 3)).toEqual([
      'one',
      'last_7_days',
      ['/a'],
    ])
    expect(screen.getByTestId('location')).toHaveTextContent(first.slice('/report'.length))
    expect(screen.getByTestId('mirror-period')).toHaveTextContent('last_7_days')
    await act(() => router.navigate(1))
    expect(screen.getByTestId('mirror-period')).toHaveTextContent('custom')
  })

  it('does not replace an in-progress edit when unrelated search context changes', async () => {
    const router = createMemoryRouter([{ path: '/report', element: <Harness /> }], {
      initialEntries: ['/report?websiteId=one&period=last_7_days'],
    })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('one'))
    act(() => screen.getByText('Draft').click())
    await act(() => router.navigate('/report?websiteId=one&period=last_7_days&other=1#hash'))
    expect((JSON.parse(screen.getByTestId('state').textContent) as unknown[])[1]).toBe('draft')
    expect(screen.getByTestId('mirror-period')).toHaveTextContent('draft')
    expect(screen.getByTestId('location')).toHaveTextContent('other=1#hash')
  })

  it('does not restore its own pending replace over a newer edit', async () => {
    const router = createMemoryRouter([{ path: '/report', element: <Harness /> }], {
      initialEntries: ['/report?websiteId=one&period=last_7_days#hash'],
    })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('one'))
    act(() => screen.getByText('Replace while editing').click())
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('period=last_28_days#hash'))
    expect((JSON.parse(screen.getByTestId('state').textContent) as unknown[])[1]).toBe('draft')
    expect(screen.getByTestId('mirror-period')).toHaveTextContent('draft')
  })

  it('does not let a request started on an earlier same-route entry rewrite the new URL', async () => {
    const router = createMemoryRouter([{ path: '/report', element: <Harness /> }], {
      initialEntries: ['/report?websiteId=one&period=last_7_days#first'],
    })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('one'))
    act(() => screen.getByText('Start request').click())
    await act(() => router.navigate('/report?websiteId=two&period=last_28_days#second'))
    act(() => screen.getByText('Finish request').click())
    expect(screen.getByTestId('location')).toHaveTextContent('websiteId=two&period=last_28_days#second')
  })
})
