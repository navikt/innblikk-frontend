import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ResultsPanel from './ResultsPanel'
import ShareResultsModal from './ShareResultsModal'

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

describe('chart tab availability', () => {
  afterEach(() => window.history.replaceState({}, '', '/'))

  const line = {
    data: {
      lineChartData: [{ legend: 'Antall', data: [{ x: new Date('2026-11-01'), y: 10 }] }],
    },
  }
  const category = { data: [{ x: 'Søk', y: 10 }] }
  const chartProps = {
    ...props,
    hiddenTabs: [],
    prepareLineChartData: () => line,
    prepareBarChartData: () => category,
    preparePieChartData: () => ({ ...category, total: 10 }),
  }

  it('only shows Table when none of the charts can render', () => {
    render(<ResultsPanel {...props} hiddenTabs={[]} />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Tabell'])
    expect(screen.getByRole('table')).toBeVisible()
  })

  it('shows all supported chart types', () => {
    render(<ResultsPanel {...chartProps} />)
    for (const name of ['Tabell', 'Linje', 'Område', 'Stolpe', 'Kake']) {
      expect(screen.getByRole('tab', { name })).toBeVisible()
    }
    expect(screen.queryByRole('tab', { name: 'Trakt' })).not.toBeInTheDocument()
  })

  it('hides Line and Area together when line preparation fails, without hiding other charts', () => {
    render(<ResultsPanel {...chartProps} prepareLineChartData={() => null} />)
    expect(screen.queryByRole('tab', { name: 'Linje' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Område' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Stolpe' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Kake' })).toBeVisible()
  })

  it.each([
    { data: [] },
    { data: [{ x: 'A', y: 0 }] },
    { data: [{ x: 'A', y: NaN }] },
    { data: [{ x: 'A', y: Infinity }] },
    {
      data: [...Array.from({ length: 11 }, (_, i) => ({ x: String(i), y: 0 })), { x: 'A', y: 1 }, { x: 'B', y: -1 }],
    },
  ])('hides Bar and Pie using their existing displayed-value checks: %j', ({ data }) => {
    render(
      <ResultsPanel
        {...chartProps}
        prepareBarChartData={() => ({ data })}
        preparePieChartData={() => ({ data, total: 0 })}
      />,
    )
    expect(screen.queryByRole('tab', { name: 'Stolpe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Kake' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tabell' })).toBeVisible()
  })

  it('keeps Line and Area available for all-zero data', () => {
    render(
      <ResultsPanel
        {...chartProps}
        prepareLineChartData={() => ({
          data: { lineChartData: [{ legend: 'Antall', data: [{ x: new Date('2026-11-01'), y: 0 }] }] },
        })}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Linje' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Område' })).toBeVisible()
  })

  it('preserves explicit chart exclusions but never hides Table', () => {
    window.history.replaceState({}, '', '/grafbygger?hideTabs=table,linechart')
    render(<ResultsPanel {...chartProps} hiddenTabs={['table', 'piechart']} />)
    expect(screen.getByRole('tab', { name: 'Tabell' })).toBeVisible()
    expect(screen.queryByRole('tab', { name: 'Linje' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Kake' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Område' })).toBeVisible()
  })

  it.each(['linechart', 'areachart', 'barchart', 'piechart', 'funnel'])(
    'falls back from an unavailable %s URL tab and updates the graph suggestion',
    (tab) => {
      window.history.replaceState({}, '', `/grafbygger?websiteId=site-1&tab=${tab}#resultater`)
      const onGraphTypeSuggestionChange = vi.fn()
      render(<ResultsPanel {...props} hiddenTabs={[]} onGraphTypeSuggestionChange={onGraphTypeSuggestionChange} />)
      expect(screen.getByRole('tab', { name: 'Tabell' })).toHaveAttribute('aria-selected', 'true')
      expect(new URLSearchParams(window.location.search).get('tab')).toBe('table')
      expect(new URLSearchParams(window.location.search).get('websiteId')).toBe('site-1')
      expect(window.location.hash).toBe('#resultater')
      expect(onGraphTypeSuggestionChange).toHaveBeenCalledExactlyOnceWith('TABLE')
    },
  )

  it('switches to Table when new results invalidate the selected chart, and restores tabs for compatible results', () => {
    const { rerender } = render(<ResultsPanel {...chartProps} initialTab="linechart" />)
    expect(screen.getByRole('tab', { name: 'Linje' })).toHaveAttribute('aria-selected', 'true')
    rerender(<ResultsPanel {...props} hiddenTabs={[]} result={{ data: [{ antall: 1 }] }} />)
    expect(screen.getByRole('tab', { name: 'Tabell' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Linje' })).not.toBeInTheDocument()
    rerender(<ResultsPanel {...chartProps} />)
    expect(screen.getByRole('tab', { name: 'Linje' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Tabell' })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not discard a requested chart before results arrive', () => {
    window.history.replaceState({}, '', '/grafbygger?tab=linechart')
    const { rerender } = render(<ResultsPanel {...chartProps} result={null} loading />)
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('linechart')
    rerender(<ResultsPanel {...chartProps} />)
    expect(screen.getByRole('tab', { name: 'Linje' })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not show Funnel just because an incompatible result has a funnel marker', () => {
    render(<ResultsPanel {...props} hiddenTabs={[]} sql="/* @chart funnel */ SELECT 1" initialTab={undefined} />)
    expect(screen.queryByRole('tab', { name: 'Trakt' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tabell' })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not offer to hide Table in share settings', () => {
    render(<ShareResultsModal sql="SELECT 1" open onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Skjul graftyper', { selector: 'span' }))
    expect(screen.queryByRole('checkbox', { name: 'Tabell' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Linjediagram' })).toBeVisible()
    expect(screen.getByRole('option', { name: 'Tabell' })).toBeInTheDocument()
  })
})

describe('shared funnel results', () => {
  afterEach(() => window.history.replaceState({}, '', '/'))
  const result = {
    data: [
      { step: 0, url: 'Søk', count: 100 },
      { step: 1, url: 'Søknad', count: 20 },
    ],
  }

  it('honors funnel links and keeps a table view available', () => {
    window.history.replaceState({}, '', '/grafdeling?tab=funnel')
    render(<ResultsPanel {...props} result={result} />)
    expect(screen.getByRole('tab', { name: 'Trakt' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('tabpanel', { name: 'Trakt' })).getByText('Søknad')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabell' }))
    expect(within(screen.getByRole('table')).getByText('Søknad')).toBeVisible()
  })

  it('defaults explicitly marked queries to the visual presentation', () => {
    window.history.replaceState({}, '', '/grafdeling')
    render(<ResultsPanel {...props} initialTab={undefined} result={result} sql="/* @chart funnel */ SELECT 1" />)
    expect(screen.getByRole('tab', { name: 'Trakt' })).toHaveAttribute('aria-selected', 'true')
  })
})

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
