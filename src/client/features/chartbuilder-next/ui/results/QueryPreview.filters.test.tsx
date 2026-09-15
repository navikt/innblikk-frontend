import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'
import type { Filter } from '../../../../shared/types/chart.ts'
import QueryPreview from './QueryPreview.tsx'
import EventFilter from '../grafbygger/EventFilter.tsx'

vi.mock('./ResultsPanel.tsx', () => ({
  default: ({ executeQuery }: { executeQuery: () => void }) => <button onClick={executeQuery}>Vis resultater</button>,
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

  it('shows the dynamic period picker and hides it when a chart period override is active', async () => {
    window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
    const dynamicPeriod: Filter = {
      column: 'created_at',
      operator: 'SPECIAL',
      value: '{{created_at}}',
      interactive: true,
      metabaseParam: true,
    }
    const { rerender } = render(<QueryPreview sql="SELECT 1 [[AND {{created_at}} ]]" filters={[dynamicPeriod]} />)

    expect(await screen.findByRole('combobox', { name: 'Periode' })).toBeInTheDocument()

    const override: Filter[] = [
      {
        column: 'created_at',
        operator: '>=',
        value: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)',
        dateRangeType: 'dynamic',
      },
      {
        column: 'created_at',
        operator: '<=',
        value: 'CURRENT_TIMESTAMP()',
        dateRangeType: 'dynamic',
      },
    ]
    rerender(
      <QueryPreview
        sql="SELECT 1 WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)"
        filters={override}
      />,
    )

    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Periode' })).not.toBeInTheDocument())
  })

  it('shows the URL field whenever the dashboard URL override filter is enabled', () => {
    const filter: Filter = {
      column: 'url_path',
      operator: '=',
      value: '{{url_sti}}',
      interactive: true,
      metabaseParam: true,
    }

    render(<QueryPreview sql="SELECT 1" filters={[filter]} />)

    expect(screen.getByRole('combobox', { name: 'URL-sti' })).toBeInTheDocument()
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
