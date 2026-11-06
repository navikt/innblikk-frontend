import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Website } from '../../../shared/types/chart'
import type { RepetitionResult } from '../model/repetition'
import { parseRepetitionResult } from '../model/repetition'
import RepetitionAnalysis from './RepetitionAnalysis'
import RepetitionResults from './RepetitionResults'
import { betaFeatures } from '../../../shared/lib/betaFeatures'
import { analyticsPages } from '../../analysis/model/analyticsNavigation'

vi.mock('../../analysis/ui/WebsitePicker', () => ({
  default: ({ onWebsiteChange }: { onWebsiteChange: (site: Website) => void }) => (
    <button
      onClick={() =>
        onWebsiteChange({
          id: 'site-1',
          name: 'Test',
          domain: 'test.nav.no',
          teamId: 'team-1',
          createdAt: '2026-01-01',
        })
      }
    >
      Velg testnettsted
    </button>
  ),
}))
vi.mock('../../analysis/ui/PeriodPicker', () => ({
  default: ({ period, onPeriodChange }: { period: string; onPeriodChange: (value: string) => void }) => (
    <select aria-label="Periode" value={period} onChange={(event) => onPeriodChange(event.target.value)}>
      <option value="last_7_days">Siste 7 dager</option>
      <option value="last_28_days">Siste 28 dager</option>
      <option value="custom">Egendefinert</option>
    </select>
  ),
}))
vi.mock('../../analysis/ui/UrlPathFilter', () => ({
  default: ({ urlPaths, onUrlPathsChange }: { urlPaths: string[]; onUrlPathsChange: (paths: string[]) => void }) => (
    <input aria-label="URL" value={urlPaths[0] || ''} onChange={(event) => onUrlPathsChange([event.target.value])} />
  ),
}))
vi.mock('../../chartbuilder-next', () => ({ SqlViewer: () => <div>SQL</div> }))

const rawResult = {
  summary: {
    total_visitors: 10,
    total_visits: 12,
    cookie_visitors: 8,
    fingerprint_visitors: 2,
    events_without_visit: 0,
    total_events: 30,
    custom_events: 20,
    interaction_events: 12,
    targeted_interaction_events: 9,
    tied_timestamps: 1,
  },
  affected_visitors: 2,
  total_episodes: 3,
  duplicate_episodes: 1,
  total_findings: 1,
  signal_findings: { pageviews: 0, interactions: 1, duplicates: 0 },
  is_generated_data: false,
  generatedSql: 'SELECT 1',
  queryStats: null,
  findings: [
    {
      signal: 'interactions',
      hostname: 'test.nav.no',
      page: '/',
      event_name: 'navigere',
      target: 'Send',
      has_target: 1,
      episodes: 3,
      affected_visitors: 2,
      max_repetitions: 4,
      examples: [
        {
          started_at: '2026-10-01T10:00:00Z',
          ended_at: '2026-10-01T10:00:02Z',
          event_count: 4,
          duration_seconds: 2,
          session_id: 'fingerprint-1',
          visit_id: 'visit-1',
          visitor_type: 'cookie',
          device: 'mobile',
          browser: 'safari',
          event_ids: ['event-1', 'event-3', 'event-4', 'event-5'],
          example_kind: 'largest',
        },
        {
          started_at: '2026-10-02T10:00:00Z',
          ended_at: '2026-10-02T10:00:01Z',
          event_count: 3,
          duration_seconds: 1,
          session_id: 'fingerprint-2',
          visit_id: 'visit-2',
          visitor_type: 'cookie',
          device: 'desktop',
          browser: 'chrome',
          event_ids: ['event-6', 'event-7', 'event-8'],
          example_kind: 'latest',
        },
      ],
    },
  ],
}

function renderPage(url = '/gjentatt-aktivitet?period=last_7_days') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <RepetitionAnalysis />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('alpha discovery', () => {
  it('lists the feature as alpha without adding it to the analysis menu', () => {
    expect(betaFeatures.find((feature) => feature.id === 'gjentatt-aktivitet')).toMatchObject({
      stage: 'alfa',
      href: '/gjentatt-aktivitet',
    })
    expect(analyticsPages.some((page) => page.href === '/gjentatt-aktivitet')).toBe(false)
  })
})

describe('repetition analysis page', () => {
  it('does not offer the signal filter before analysis because it filters existing results', () => {
    renderPage()
    expect(screen.queryByRole('combobox', { name: 'Vis signal' })).not.toBeInTheDocument()
  })

  it('waits for an explicit request and displays results with an alpha badge', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(rawResult)))
    vi.stubGlobal('fetch', fetch)
    renderPage('/gjentatt-aktivitet?period=last_7_days&urlPath=%2F')
    expect(screen.getByText('Alfa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled()
    fireEvent.click(screen.getByText('Velg testnettsted'))
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByRole('heading', { name: 'Funn' })).toBeInTheDocument()
    expect(fetch.mock.calls[0][0]).toBe('/api/bigquery/repetition')
    expect(fetch.mock.calls[0][1]?.method).toBe('POST')
    expect(fetch.mock.calls[0][1]?.body).not.toContain('interactionEvent')
    expect(screen.getByText(/20 % av 10 besøkende/)).toBeInTheDocument()
  })

  it('hides stale results as soon as filters change', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(rawResult) }))
    renderPage()
    fireEvent.click(screen.getByText('Velg testnettsted'))
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByRole('heading', { name: 'Funn' })
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), { target: { value: '/other' } })
    expect(screen.queryByRole('heading', { name: 'Funn' })).not.toBeInTheDocument()
  })

  it('aborts in-flight requests and ignores responses for old filters', async () => {
    let resolve: (value: unknown) => void = () => {
      throw new Error('Request not started')
    }
    let requestSignal: AbortSignal | undefined
    const fetch = vi.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal ?? undefined
      return new Promise((done) => {
        resolve = done
      })
    })
    vi.stubGlobal('fetch', fetch)
    renderPage()
    fireEvent.click(screen.getByText('Velg testnettsted'))
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), { target: { value: '/other' } })
    expect(requestSignal?.aborted).toBe(true)
    resolve({ ok: true, json: () => Promise.resolve(rawResult) })
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Funn' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeEnabled()
  })

  it('shows request errors instead of a no-findings result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    renderPage()
    fireEvent.click(screen.getByText('Velg testnettsted'))
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Funn' })).not.toBeInTheDocument()
  })

  it('rejects invalid custom dates without requesting data', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    renderPage('/gjentatt-aktivitet?period=custom&from=invalid&to=2026-10-02')
    fireEvent.click(screen.getByText('Velg testnettsted'))
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/gyldig periode på maksimalt 31 dager/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('repetition findings', () => {
  const parsed = (): RepetitionResult => parseRepetitionResult(rawResult)

  it('shows bounded examples and a contextual event explorer link', () => {
    render(<RepetitionResults result={parsed()} search="websiteId=site-1&period=last_7_days" />)
    fireEvent.click(screen.getByRole('button', { name: 'Vis mer' }))
    expect(
      screen.getByRole('button', { name: /Flest gjentakelser: .* 4 hendelser på 2 s · mobile · safari/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nyeste: .* 3 hendelser på 1 s · desktop · chrome/ })).toBeInTheDocument()
    const labels = screen.getAllByRole('button', { name: /(Flest gjentakelser|Nyeste):/ })
    expect(labels[0]).toHaveTextContent('Flest gjentakelser')
    expect(screen.getByRole('link', { name: 'Utforsk hendelsen' })).toHaveAttribute(
      'href',
      '/utforsk-hendelser?websiteId=site-1&period=last_7_days&urlPath=%2F&pathOperator=equals&event=navigere',
    )
  })

  it('filters existing findings by signal without requesting data again', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = parsed()
    result.findings.push({ ...result.findings[0], signal: 'pageviews', eventName: '', target: '' })
    result.totalFindings = 2
    result.signalFindings = { pageviews: 1, interactions: 1, duplicates: 0 }
    render(<RepetitionResults result={result} search="websiteId=site-1" />)
    const filter = screen.getByRole('combobox', { name: 'Vis signal' })
    expect(screen.getAllByRole('button', { name: 'Vis mer' })).toHaveLength(2)
    fireEvent.change(filter, { target: { value: 'pageviews' } })
    expect(screen.getAllByRole('button', { name: 'Vis mer' })).toHaveLength(1)
    expect(screen.getByText('Gjentatte sidevisninger', { selector: 'span' })).toBeInTheDocument()
    fireEvent.change(filter, { target: { value: 'duplicates' } })
    expect(screen.getByText('Ingen funn for dette signalet.')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps rules and coverage in one short collapsed panel without warning boxes or settings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(rawResult) }))
    const { container } = renderPage()
    expect(screen.getAllByRole('button', { name: /Om analysen|Hva dekker/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Om analysen' }))
    expect(screen.getByText('Mulig dobbelsporing:')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Ekstra klikkhendelse/)).not.toBeInTheDocument()
    expect(screen.queryByText(/30 hendelser · 12 besøk/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Velg testnettsted'))
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByRole('heading', { name: 'Funn' })
    expect(screen.getAllByRole('button', { name: /Om analysen|Hva dekker/ })).toHaveLength(1)
    expect(
      screen.getByText(/30 hendelser · 12 besøk · 3 klikk uten kjent mål · 1 hendelser med samme tidsstempel/),
    ).toBeInTheDocument()
    expect(container.querySelector('.aksel-alert--warning')).toBeNull()
  })

  it('distinguishes no findings, no coverage and generated data', () => {
    const result = parsed()
    result.findings = []
    result.summary.interactionEvents = 0
    result.summary.targetedInteractionEvents = 0
    result.isGeneratedData = true
    render(<RepetitionResults result={result} search="" />)
    expect(screen.getByText(/Ingen gjentakelser over tersklene/)).toBeInTheDocument()
    expect(screen.getByText(/Ingen gjenkjente klikkhendelser/)).toBeInTheDocument()
    expect(screen.getByText(/genererte eksempeldata/)).toBeInTheDocument()
  })

  it('loads episode context with metadata only when requested, and links to the matching visitor', async () => {
    const activity = {
      activity: ['before', 'during', 'during', 'after'].map((phase, index) => ({
        event_id: `event-${index}`,
        created_at: `2026-10-01T10:00:0${index}Z`,
        event_type: index === 1 ? 2 : 1,
        event_name: index === 1 ? 'navigere' : '',
        url_path: index >= 2 ? `/aap/kalkulator/steg/${index - 1}` : '/',
        page_title: index >= 2 ? `Kalkulator steg ${index - 1}` : 'Søknad',
        hostname: 'test.nav.no',
        phase,
        properties: index === 1 ? [{ key: 'lenketekst', value: 'Send søknad' }] : [],
        property_count: index === 1 ? 1 : 0,
        is_highlighted: index === 1,
      })),
      omitted_events: 0,
      is_generated_data: false,
    }
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(activity)))
    vi.stubGlobal('fetch', fetch)
    render(<RepetitionResults result={parsed()} search="websiteId=site-1&period=last_7_days&urlPath=%2F" />)
    fireEvent.click(screen.getByRole('button', { name: 'Vis mer' }))
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Flest gjentakelser: .* 4 hendelser på 2 s/ }))
    expect(await screen.findByText('Inngår i funnet')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Gjentatte interaksjoner' })
    expect(dialog.querySelectorAll('[data-highlighted="true"]')).toHaveLength(1)
    expect(dialog.querySelector('[data-highlighted="true"]')).toHaveTextContent('navigere')
    expect(dialog.querySelector('[data-highlighted="true"]')).not.toHaveTextContent('Kalkulator')
    expect(fetch.mock.calls[0][1]?.body).toContain('"sessionId":"fingerprint-1"')
    expect(fetch.mock.calls[0][1]?.body).toContain('"visitId":"visit-1"')
    expect(fetch.mock.calls[0][1]?.body).toContain(
      `"highlightedEventIds":${JSON.stringify(rawResult.findings[0].examples[0].event_ids)}`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hendelsesdetaljer' }))
    expect(screen.getByText('lenketekst')).toBeInTheDocument()
    expect(screen.getByText('Send søknad')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Finn denne besøkende i Enkeltbrukere' })
    expect(link.getAttribute('href')).toContain('query=fingerprint-1')
    expect(link.getAttribute('href')).not.toContain('urlPath')
    fireEvent.click(screen.getByRole('button', { name: 'Lukk' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Flest gjentakelser: .* 4 hendelser på 2 s/ }))
    expect(screen.getByRole('dialog', { name: 'Gjentatte interaksjoner' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledOnce()
  })
})
