import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ResultsPanel from './ResultsPanel'

vi.mock('@fluentui/react-charting', () => ({
  LineChart: () => null,
  VerticalBarChart: () => null,
  AreaChart: () => null,
  PieChart: () => null,
  ResponsiveContainer: () => null,
}))

const props = {
  result: { data: [{ data_key: 'element', count: 12345, missing: null, timestamp: { value: '2026-06-01' } }] },
  loading: false,
  error: null,
  queryStats: null,
  lastAction: null,
  showLoadingMessage: false,
  executeQuery: vi.fn(),
  handleRetry: vi.fn(),
  prepareLineChartData: () => null,
  prepareBarChartData: () => null,
  preparePieChartData: () => null,
  hiddenTabs: ['linechart', 'areachart', 'barchart', 'piechart'],
  showSqlMetabaseActions: false,
  showDownloadReadMore: false,
  initialTab: 'table' as const,
}

describe('secondary action', () => {
  it.each(['initial', 'results', 'empty', 'error'] as const)('remains available in the %s state', (state) => {
    const reset = vi.fn()
    render(
      <ResultsPanel
        {...props}
        result={state === 'results' ? props.result : state === 'empty' ? { data: [] } : null}
        error={state === 'error' ? 'Spørringen feilet' : null}
        secondaryAction={<button onClick={reset}>Tilbakestill alle valg</button>}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Tilbakestill alle valg' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Tilbakestill alle valg' }))
    expect(reset).toHaveBeenCalledTimes(1)
    if (state === 'initial') {
      expect(screen.getByRole('button', { name: 'Vis resultater' })).toBeVisible()
    } else {
      expect(screen.queryByRole('button', { name: 'Vis resultater' })).not.toBeInTheDocument()
    }
  })
})

describe('empty results', () => {
  it('suggests adjusting filters and dates without linking back to the builder when already editing', () => {
    render(<ResultsPanel {...props} websiteId="test-website" result={{ data: [] }} showChartBuilderLink={false} />)

    expect(
      screen.getByText('Spørringen returnerte ingen resultater. Prøv å justere filtrene eller datoperioden.'),
    ).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Åpne i Grafbygger' })).not.toBeInTheDocument()
  })

  it('preserves the builder link for results displayed outside the builder', () => {
    render(<ResultsPanel {...props} websiteId="test-website" result={{ data: [] }} />)

    expect(screen.getByRole('link', { name: 'Åpne i Grafbygger' })).toHaveAttribute(
      'href',
      '/grafbygger?websiteId=test-website',
    )
  })
})

describe('result cell copying', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses the theme-aware accent text color for result paths and their icons', () => {
    render(<ResultsPanel {...props} websiteId="test-website" result={{ data: [{ url_path: '/pensjon' }] }} />)
    const path = screen.getByText('/pensjon')
    expect(path).toHaveClass('text-[var(--ax-text-accent)]')
    expect(path).not.toHaveClass('text-blue-600')
    expect(path.querySelector('svg')).toBeInTheDocument()
  })

  it('does not add cell copy controls by default', () => {
    render(<ResultsPanel {...props} />)
    expect(within(screen.getByRole('table')).queryByRole('button', { name: 'Kopier verdi' })).not.toBeInTheDocument()
  })

  it.each([
    [0, 'element'],
    [1, '12345'],
    [2, 'NULL'],
    [3, '2026-06-01'],
  ])('copies the original value in column %i', async (column, expected) => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<ResultsPanel {...props} copyableCells />)
    const cell = screen.getAllByRole('cell')[column]
    fireEvent.click(within(cell).getByRole('button', { name: 'Kopier verdi' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected))
    expect(await within(cell).findByRole('button', { name: 'Kopiert' })).toBeInTheDocument()
  })

  it('reports a clipboard failure and allows retrying', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<ResultsPanel {...props} copyableCells />)
    const cell = screen.getAllByRole('cell')[0]
    fireEvent.click(within(cell).getByRole('button', { name: 'Kopier verdi' }))
    fireEvent.click(await within(cell).findByRole('button', { name: 'Kunne ikke kopiere. Prøv igjen.' }))
    expect(await within(cell).findByRole('button', { name: 'Kopiert' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledTimes(2)
  })
})

describe('large results', () => {
  const rows = (count: number, columns: number) =>
    Array.from({ length: count }, (_, i) =>
      Object.fromEntries(Array.from({ length: columns }, (_, c) => [`kolonne_${c}`, `${i}-${c}`])),
    )

  it('limits wide results by cells so the page stays responsive, and shows all rows on request', () => {
    render(<ResultsPanel {...props} result={{ data: rows(101, 40) }} />)
    const table = screen.getByRole<HTMLTableElement>('table')
    expect(table.rows).toHaveLength(1 + 100)
    expect(screen.getByText(/Viser bare 100 av 101 rader for ytelse/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vis alle rader' }))
    expect(table.rows).toHaveLength(1 + 101)
    expect(table.rows[101].cells[39]).toHaveTextContent('100-39')
  })

  it('shows every row of a narrow result', () => {
    render(<ResultsPanel {...props} result={{ data: rows(1000, 3) }} />)
    expect(screen.getByRole<HTMLTableElement>('table').rows).toHaveLength(1 + 1000)
    expect(screen.queryByText(/for ytelse/)).not.toBeInTheDocument()
  })
})
