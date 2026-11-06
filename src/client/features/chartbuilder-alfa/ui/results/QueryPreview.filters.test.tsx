import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'
import type { Filter } from '../../../../shared/types/chart.ts'
import QueryPreview from './QueryPreview.tsx'
import EventFilter from '../../../chartbuilder-next/ui/grafbygger/EventFilter.tsx'
import { generateSQLCore } from '../../../chartbuilder-next/utils/sqlGenerator.ts'

vi.mock('../../../chartbuilder-next/ui/results/ResultsPanel.tsx', () => ({
  default: ({ executeQuery, secondaryAction }: { executeQuery: () => void; secondaryAction?: React.ReactNode }) => (
    <div>
      <button onClick={executeQuery}>Vis resultater</button>
      {secondaryAction}
    </div>
  ),
}))

function Harness({ initialFilters = [] }: { initialFilters?: Filter[] }) {
  const [filters, setFilters] = useState(initialFilters)
  return (
    <>
      <EventFilter filters={filters} setFilters={setFilters} parameters={[]} />
      <QueryPreview sql="-- Please select a website to generate SQL" filters={filters} />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
    </>
  )
}
describe('chartbuilder preview filters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.__RUNTIME_CONFIG__
  })

  it('only asks for a metric when a website is already selected', () => {
    render(<QueryPreview sql="-- Please select a website to generate SQL" websiteId="site-1" />)

    expect(screen.getByText('Velg minst ett måltall for å generere en spørring.')).toBeInTheDocument()
    expect(screen.queryByText(/Velg nettside og/)).not.toBeInTheDocument()
  })

  it('keeps the dynamic period and additional settings visible after reset removes all metrics', () => {
    const dynamicPeriod: Filter = {
      column: 'created_at',
      operator: 'SPECIAL',
      value: '{{created_at}}',
      interactive: true,
      metabaseParam: true,
    }

    render(
      <QueryPreview
        sql="-- Please select a website to generate SQL"
        filters={[dynamicPeriod]}
        additionalOptions={<div>Tilleggsvalg</div>}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Periode' })).toHaveValue('last_7_days')
    expect(screen.getByText('Tilleggsvalg')).toBeInTheDocument()
  })

  it('preserves a stale dashboard date placeholder without requiring runtime config', async () => {
    delete window.__RUNTIME_CONFIG__

    render(<QueryPreview sql="SELECT 1 [[AND {{created_at}} ]]" filters={[]} />)

    expect(await screen.findByRole('combobox', { name: 'Periode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vis resultater' })).toBeInTheDocument()
  })

  it('uses shared runtime config when executing a dynamic date query', async () => {
    window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'runtime-project' }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ totalBytesProcessedGB: '0', data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const dynamicPeriod: Filter = {
      column: 'created_at',
      operator: 'SPECIAL',
      value: '{{created_at}}',
      interactive: true,
      metabaseParam: true,
    }
    render(
      <QueryPreview sql="SELECT 1 WHERE TRUE [[AND {{created_at}} ]]" filters={[dynamicPeriod]} websiteId="site-1" />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Vis resultater' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(firstRequest.body).toContain('`runtime-project.umami_views.event`')
  })

  it('does not estimate or execute until event validation succeeds', async () => {
    const user = userEvent.setup()
    const onBeforeExecute = vi.fn().mockReturnValue(false)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ totalBytesProcessedGB: '0', data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<QueryPreview sql="SELECT 1" onBeforeExecute={onBeforeExecute} />)

    await user.click(screen.getByRole('button', { name: 'Vis resultater' }))
    expect(onBeforeExecute).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()

    onBeforeExecute.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Vis resultater' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/bigquery', expect.any(Object)))
  })

  it('revalidates before execution if the event selection changes while estimating', async () => {
    const user = userEvent.setup()
    const onBeforeExecute = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ totalBytesProcessedGB: '0', data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<QueryPreview sql="SELECT 1" onBeforeExecute={onBeforeExecute} />)

    await user.click(screen.getByRole('button', { name: 'Vis resultater' }))
    await waitFor(() => expect(onBeforeExecute).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/bigquery/estimate', expect.any(Object))
  })

  it('places additional settings before the primary results action', () => {
    render(<QueryPreview sql="SELECT 1" additionalOptions={<div>Tilleggsvalg</div>} />)

    const settings = screen.getByText('Tilleggsvalg')
    const showResults = screen.getByRole('button', { name: 'Vis resultater' })
    expect(settings.compareDocumentPosition(showResults) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps reset above the filter row', async () => {
    const filter: Filter = {
      column: 'url_path',
      operator: '=',
      value: '{{url_sti}}',
      interactive: true,
      metabaseParam: true,
    }
    render(<QueryPreview sql="SELECT 1" activeStep={3} filters={[filter]} onResetAll={vi.fn()} />)

    const reset = screen.getByRole('button', { name: 'Tilbakestill alle valg' })
    const url = await screen.findByRole('combobox', { name: 'URL-sti' })
    expect(reset.compareDocumentPosition(url) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps confirmation and local filter resets when reset is placed beside results', async () => {
    const user = userEvent.setup()
    const onResetAll = vi.fn()
    render(<QueryPreview sql="SELECT 1" activeStep={3} onResetAll={onResetAll} resetPlacement="results" />)
    const reset = screen.getByRole('button', { name: 'Tilbakestill alle valg' })
    expect(screen.getAllByRole('button', { name: 'Tilbakestill alle valg' })).toHaveLength(1)
    expect(reset).toHaveAttribute('data-color', 'neutral')
    expect(
      screen.getByRole('button', { name: 'Vis resultater' }).compareDocumentPosition(reset) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Periode' }), 'yesterday')
    await user.click(reset)
    const dialog = await screen.findByRole('dialog', { name: 'Tilbakestill alle valg?' })
    await user.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    expect(onResetAll).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Periode' })).toHaveValue('yesterday')
    await user.click(reset)
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Tilbakestill alle valg?' })).getByRole('button', {
        name: 'Ja, tilbakestill alt',
      }),
    )
    expect(onResetAll).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('combobox', { name: 'Periode' })).toHaveValue('last_7_days')
  })

  it('always shows the period picker and rewrites concrete chart bounds when executing', async () => {
    window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ totalBytesProcessedGB: '0', data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const override: Filter[] = [
      {
        column: 'created_at',
        operator: '>=',
        value: 'TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))',
        dateRangeType: 'dynamic',
      },
      {
        column: 'created_at',
        operator: '<=',
        value: 'DATE_SUB(DATE_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 1 SECOND)',
        dateRangeType: 'dynamic',
      },
    ]
    render(
      <QueryPreview
        sql="SELECT 1 WHERE e.created_at >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)) AND e.created_at <= DATE_SUB(DATE_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 1 SECOND)"
        filters={override}
        websiteId="site-1"
      />,
    )

    // The picker is the single period control — visible even with concrete SQL bounds.
    expect(await screen.findByRole('combobox', { name: 'Periode' })).toHaveValue('last_7_days')

    await userEvent.click(screen.getByRole('button', { name: 'Vis resultater' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit
    // Concrete bounds rewritten to the picker's dates as a BETWEEN clause …
    expect(firstRequest.body).toContain('`test-project.umami_views.event`.created_at BETWEEN TIMESTAMP(')
    // … and the old generated bounds are gone.
    expect(firstRequest.body).not.toContain('INTERVAL 7 DAY')
    expect(firstRequest.body).not.toContain('DATE_SUB(DATE_TRUNC')
  })

  it('never lets the zero-pad calendar grow a still-collecting today bucket', async () => {
    // Regression: a persisted pre-fix session carries concrete `<= CURRENT_TIMESTAMP()`
    // bounds. zeroPadTimeSeries used to feed that straight into GENERATE_DATE_ARRAY,
    // padding the chart through today — the picker rewrote the WHERE bounds but the
    // calendar was baked at generation time, so "siste 7 dager" showed today's date.
    window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
    const config = {
      website: { id: 'site-1', domain: 'x.no', name: 'X' },
      metrics: [{ function: 'count' }],
      groupByFields: ['created_at'],
      dateFormat: 'day',
    } as unknown as Parameters<typeof generateSQLCore>[0]
    const legacyFilters: Filter[] = [
      {
        column: 'created_at',
        operator: '>=',
        value: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)',
        dateRangeType: 'dynamic',
      },
      { column: 'created_at', operator: '<=', value: 'CURRENT_TIMESTAMP()', dateRangeType: 'dynamic' },
    ]
    const sql = generateSQLCore(config, legacyFilters, [])

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ totalBytesProcessedGB: '0', data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<QueryPreview sql={sql} filters={legacyFilters} websiteId="site-1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Vis resultater' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const executedSql = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string).query as string
    expect(executedSql).toContain('GENERATE_DATE_ARRAY')
    expect(executedSql).not.toContain('DATE(CURRENT_TIMESTAMP())')
  })

  it('shows the URL field whenever the dashboard URL override filter is enabled', () => {
    const filter: Filter = {
      column: 'url_path',
      operator: '=',
      value: '{{url_sti}}',
      interactive: true,
      metabaseParam: true,
    }

    render(<QueryPreview edition="next" sql="SELECT 1" filters={[filter]} />)

    expect(screen.getByRole('combobox', { name: 'Side (URL)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '/ (forsiden) slett' })).not.toBeInTheDocument()
  })

  it.each(['', '/', '/soknad'])('only filters preview SQL by an explicitly selected URL: "%s"', async (path) => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ totalBytesProcessedGB: '0', data: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <QueryPreview
        edition="next"
        sql="SELECT 1 WHERE TRUE AND url_path = {{url_sti}}"
        availableEvents={['/soknad']}
      />,
    )
    const picker = await screen.findByRole('combobox', { name: 'Side (URL)' })
    expect(picker).toHaveValue('')
    expect(screen.queryByRole('button', { name: '/ (forsiden) slett' })).not.toBeInTheDocument()
    if (path) {
      await user.click(picker)
      await user.click(screen.getByRole('option', { name: path === '/' ? '/ (forsiden)' : path }))
    }
    expect(screen.getByRole('combobox', { name: 'Periode' })).toHaveValue('last_7_days')
    await user.click(screen.getByRole('button', { name: 'Vis resultater' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/bigquery', expect.any(Object)))
    const request = fetchMock.mock.calls.find(([url]) => url === '/api/bigquery')?.[1] as RequestInit
    const payload: unknown = JSON.parse(request.body as string)
    if (!payload || typeof payload !== 'object' || !('query' in payload) || typeof payload.query !== 'string') {
      throw new Error('Expected a query string in the request')
    }
    if (path) {
      expect(payload.query).toContain(`url_path = '${path}'`)
    } else {
      expect(payload.query).not.toContain('url_path')
    }
  })

  it('resets the URL picker to empty instead of selecting the front page', async () => {
    const user = userEvent.setup()
    render(
      <QueryPreview
        edition="next"
        sql="SELECT 1 WHERE TRUE AND url_path = {{url_sti}}"
        activeStep={3}
        onResetAll={vi.fn()}
      />,
    )
    await user.click(await screen.findByRole('combobox', { name: 'Side (URL)' }))
    await user.click(screen.getByRole('option', { name: '/ (forsiden)' }))
    expect(screen.getByRole('button', { name: '/ (forsiden) slett' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Tilbakestill alle valg' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Tilbakestill alle valg?' })).getByRole('button', {
        name: 'Ja, tilbakestill alt',
      }),
    )
    expect(screen.queryByRole('button', { name: '/ (forsiden) slett' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Side (URL)' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Periode' })).toHaveValue('last_7_days')
  })

  it('preserves the front-page default and reset in the current edition', async () => {
    const user = userEvent.setup()
    render(
      <QueryPreview
        sql="SELECT 1 WHERE TRUE AND url_path = {{url_sti}}"
        activeStep={3}
        onResetAll={vi.fn()}
        availableEvents={['/soknad']}
      />,
    )
    expect(await screen.findByRole('button', { name: '/ (forsiden) slett' })).toBeVisible()
    await user.click(screen.getByRole('combobox', { name: 'URL-sti' }))
    await user.click(screen.getByRole('option', { name: '/soknad' }))
    expect(screen.getByRole('button', { name: '/soknad slett' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Tilbakestill alle valg' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Tilbakestill alle valg?' })).getByRole('button', {
        name: 'Ja, tilbakestill alt',
      }),
    )
    expect(screen.getByRole('button', { name: '/ (forsiden) slett' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '/soknad slett' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Periode' })).toHaveValue('last_7_days')
  })

  it('keeps the URL input available when date initialization runs and dashboard overrides are toggled', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(await screen.findByRole('combobox', { name: 'URL-sti' })).toBeInTheDocument()
    const override = screen.getByRole('checkbox', { name: 'Side kan overstyres av filter i dashboard' })
    await user.click(override)
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'URL-sti' })).not.toBeInTheDocument())
    await user.click(override)
    expect(await screen.findByRole('combobox', { name: 'URL-sti' })).toBeInTheDocument()
  })
})
