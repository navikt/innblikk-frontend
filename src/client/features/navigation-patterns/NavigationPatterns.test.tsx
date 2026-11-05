import { useEffect } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Website } from '../../shared/types/chart'
import { analyticsPages } from '../analysis/model/analyticsNavigation'
import { betaFeatures } from '../../shared/lib/betaFeatures'
import NavigationPatterns from './NavigationPatterns'
import { patternDescriptions, type PatternResult } from './model'

const website: Website = {
  id: 'site-1',
  name: 'Eksempel',
  domain: 'example.com',
  createdAt: '2026-01-01',
  teamId: 'team-1',
}
const response: PatternResult = {
  summary: { totalSessions: 100, patternSessions: 15, repeatedCycleSessions: 12, ambiguousSessions: 2 },
  patterns: [
    {
      id: 'loop',
      type: 'alternation',
      pages: ['/oversikt', '/soknad'],
      sessions: 12,
      share: 0.12,
      medianRepetitions: 2,
      trend: [{ date: '2026-10-28', sessions: 12 }],
      before: [{ path: '/', sessions: 8 }],
      after: [],
    },
    {
      id: 'return',
      type: 'quick-return',
      pages: ['/vilkar', '/hjelp'],
      sessions: 8,
      share: 0.08,
      medianRepetitions: 1,
      trend: [],
      before: [],
      after: [],
    },
  ],
  generatedSql: 'SELECT 1',
}

vi.mock('../analysis/ui/WebsitePicker', () => ({
  default: function WebsitePickerMock({ onWebsiteChange }: { onWebsiteChange: (site: Website | null) => void }) {
    useEffect(() => onWebsiteChange(website), [onWebsiteChange])
    return <span>Nettside: Eksempel</span>
  },
}))
vi.mock('../analysis/ui/PeriodPicker', () => ({
  default: ({ period, onPeriodChange }: { period: string; onPeriodChange: (value: string) => void }) => (
    <select aria-label="Periode" value={period} onChange={(event) => onPeriodChange(event.target.value)}>
      <option value="last_7_days">Siste 7 dager</option>
      <option value="last_28_days">Siste 28 dager</option>
      <option value="custom">Egendefinert</option>
    </select>
  ),
}))
vi.mock('../analysis/ui/UrlPathFilter', () => ({
  default: ({ urlPaths, onUrlPathsChange }: { urlPaths: string[]; onUrlPathsChange: (paths: string[]) => void }) => (
    <input
      aria-label="Side (valgfritt)"
      value={urlPaths[0] || ''}
      onChange={(event) => onUrlPathsChange(event.target.value ? [event.target.value] : [])}
    />
  ),
}))
vi.mock('../analysis/hooks/useChartNavigation.ts', () => ({
  useChartNavigation: () => ({ filteredChartGroups: [], handleNavigation: vi.fn() }),
}))
vi.mock('../../shared/ui/theme/Skyra/Skyra.tsx', () => ({ Skyra: () => null }))
vi.mock('../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx', () => ({ KontaktSeksjon: () => null }))
vi.mock('../chartbuilder-next/ui/results/SqlViewer', () => ({
  default: ({ sql }: { sql: string }) => <pre>{sql}</pre>,
}))

function renderPage(search = '?websiteId=site-1&period=last_7_days') {
  return render(
    <MemoryRouter initialEntries={[`/navigasjonsmonstre${search}`]}>
      <NavigationPatterns />
    </MemoryRouter>,
  )
}

const success = (data: unknown = response) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })

const quote = {
  queryStats: { totalBytesProcessed: 1024, totalBytesProcessedGB: '0.00', estimatedCostUSD: '0.000' },
  requiresConfirmation: false,
  maximumBytesBilled: String(500 * 1024 ** 3),
}
const analysisCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/bigquery/navigation-patterns')
function mockAnalysis(data: unknown = response) {
  vi.mocked(fetch).mockImplementation((url) =>
    Promise.resolve(success(url === '/api/bigquery/navigation-patterns/estimate' ? quote : data)),
  )
}

describe('navigation patterns Alfa page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    mockAnalysis()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('uses the new name and Alfa badge, lists in Alfa settings, and has no banner or menu entry', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Gjentatt navigasjon', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Se hvilke sider brukerne kommer tilbake til i samme besøk.')).toBeVisible()
    expect(screen.getByText('Alfa', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Beta', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Navigasjonsmønstre er i beta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hvor går folk i ring?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Filtrene er endret' })).not.toBeInTheDocument()
    expect(analyticsPages.some((page) => page.href === '/navigasjonsmonstre')).toBe(false)
    expect(betaFeatures.find((feature) => feature.href === '/navigasjonsmonstre')).toMatchObject({
      stage: 'alfa',
      title: 'Gjentatt navigasjon',
      description: 'Se hvilke sider brukerne kommer tilbake til i samme besøk.',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requests whole-site analysis only when asked, and shows session-based findings', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText('Mønstre å undersøke')
    const call = analysisCalls()[0]
    expect(call[0]).toBe('/api/bigquery/navigation-patterns')
    expect(typeof call[1]?.body).toBe('string')
    const body: unknown = JSON.parse(typeof call[1]?.body === 'string' ? call[1].body : '')
    expect(body).toMatchObject({ websiteId: 'site-1' })
    expect(body).not.toHaveProperty('urlPath')
    expect(await screen.findByText('Mønstre å undersøke')).toBeInTheDocument()
    expect(screen.getByText('12 %')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Frem og tilbake.*\/oversikt/ })).toBeInTheDocument()
    const sessions = screen.getByRole('group', { name: 'Analyserte økter' })
    expect(within(sessions).getByText('2 økter utelatt: usikker rekkefølge.')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rask retur/ })).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/bigquery/navigation-patterns/estimate')
  })

  it('expands context, trend and contextual links without claiming an exit', async () => {
    renderPage('?websiteId=site-1&period=last_28_days&urlPath=%2Foversikt')
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await userEvent.click(await screen.findByRole('button', { name: /Frem og tilbake/ }))
    expect(screen.getByRole('heading', { name: 'Vanlige sider før mønsteret' })).toBeInTheDocument()
    expect(screen.getAllByText(/Ingen registrert side/).length).toBeGreaterThan(0)
    expect(screen.getByRole('cell', { name: '2026-10-28' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Navigasjonsflyt' })[0]).toHaveAttribute(
      'href',
      '/brukerreiser?websiteId=site-1&period=last_28_days&urlPath=%2Foversikt',
    )
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toContain('"urlPath":"/oversikt"')
  })

  it('explains repetition versus speed on collapsed findings and in the method help', async () => {
    mockAnalysis({
      ...response,
      patterns: [
        ...response.patterns,
        { ...response.patterns[0], id: 'cycle', type: 'cycle', pages: ['/a', '/b', '/c'] },
      ],
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText('Mønstre å undersøke')
    for (const [label, description] of [
      [/Frem og tilbake/, patternDescriptions.alternation],
      [/Rundgang/, patternDescriptions.cycle],
      [/Rask retur/, patternDescriptions['quick-return']],
    ] as const) {
      const finding = screen.getByRole('button', { name: label })
      expect(finding).toHaveAttribute('aria-expanded', 'false')
      expect(within(finding).getByText(description)).toBeVisible()
    }
    expect(
      screen.queryByText(/Visningsfiltrene koster|CSV tar med alle mønstre|statistisk signifikans/),
    ).not.toBeInTheDocument()
    const caveat = screen.getByText(/^Mønstrene viser ikke hvorfor/)
    const help = screen.getByRole('button', { name: 'Slik finner og teller vi mønstre' })
    expect(help).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('option', { name: 'Frem og tilbake (minst to runder)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Rask retur (innen 10 sekunder)' })).toBeInTheDocument()
    await userEvent.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Eksempel: A → B → A → B → A\./)).toBeVisible()
    expect(screen.getByText(/Tiden måles fra ankomst på B til retur til A/)).toBeVisible()
    expect(screen.getByText('Samme økt kan telles i flere mønstertyper.')).toBeVisible()
    expect(caveat).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('separates rapid returns from repeated rounds', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText('Mønstre å undersøke')
    await userEvent.selectOptions(screen.getByLabelText('Mønstertype'), 'quick-return')
    expect(screen.queryByRole('button', { name: /Frem og tilbake/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rask retur/ })).toBeInTheDocument()
  })

  it('hides stale findings when filters change without making an expensive automatic query', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText('Mønstre å undersøke')
    await userEvent.selectOptions(screen.getByLabelText('Periode'), 'last_28_days')
    expect(screen.getByText('Filtrene er endret')).toBeInTheDocument()
    expect(screen.queryByText('Mønstre å undersøke')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('aborts in-flight work on a filter change and ignores a late result', async () => {
    let finish: ((value: ReturnType<typeof success>) => void) | undefined
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
    fireEvent.change(screen.getByLabelText('Side (valgfritt)'), { target: { value: '/ny-side' } })
    expect(signal?.aborted).toBe(true)
    fireEvent.change(screen.getByLabelText('Side (valgfritt)'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Analyser' })).not.toBeDisabled()
    finish?.(success())
    await waitFor(() => expect(screen.queryByText('Mønstre å undersøke')).not.toBeInTheDocument())
  })

  it('surfaces service errors and malformed responses rather than showing zero findings', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/HTTP 503/)).toBeInTheDocument()
    vi.mocked(fetch).mockResolvedValueOnce(success({}))
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/Kostnadsestimatet er ugyldig/)).toBeInTheDocument()
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>Unexpected response</html>', { status: 200 }))
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/ugyldig svar/)).toBeInTheDocument()
  })

  it('distinguishes no patterns from no analysable sessions', async () => {
    mockAnalysis({ ...response, patterns: [] })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/Ingen mønstre oppfylte reglene/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Last ned CSV' })).toBeDisabled()
  })

  it('rejects incomplete custom dates without issuing a query', async () => {
    renderPage('?websiteId=site-1&period=custom&from=invalid')
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/Velg en gyldig periode/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reveals more findings without dropping data or mounting every detail table', async () => {
    mockAnalysis({
      ...response,
      patterns: Array.from({ length: 12 }, (_, index) => ({ ...response.patterns[0], id: `loop-${index}` })),
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findAllByRole('button', { name: /Frem og tilbake/ })).toHaveLength(5)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Vis flere mønstre' }))
    expect(screen.getAllByRole('button', { name: /Frem og tilbake/ })).toHaveLength(10)
    await userEvent.click(screen.getByRole('button', { name: 'Vis flere mønstre' }))
    expect(screen.getAllByRole('button', { name: /Frem og tilbake/ })).toHaveLength(12)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('discloses missing data and distinguishes zero analysed sessions', async () => {
    mockAnalysis({
      ...response,
      summary: { totalSessions: 0, patternSessions: 0, repeatedCycleSessions: 0, ambiguousSessions: 2 },
      patterns: [],
      metadata: { invalidPathSessions: 3, missingSessionEvents: 4, timezone: 'Europe/Oslo' },
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/Ingen analyserbare økter/)).toBeInTheDocument()
    const sessions = screen.getByRole('group', { name: 'Analyserte økter' })
    expect(within(sessions).getByText('2 økter utelatt: usikker rekkefølge.')).toBeVisible()
    expect(within(sessions).getByText('3 økter utelatt: ukjent sidesti.')).toBeVisible()
    expect(within(sessions).getByText('4 sidevisninger utelatt: mangler økt-ID.')).toBeVisible()
    expect(within(sessions).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not show exclusion notices when there are no excluded sessions or events', async () => {
    mockAnalysis({
      ...response,
      summary: { ...response.summary, ambiguousSessions: 0 },
      metadata: { invalidPathSessions: 0, missingSessionEvents: 0, timezone: 'Europe/Oslo' },
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    const sessions = await screen.findByRole('group', { name: 'Analyserte økter' })
    expect(within(sessions).queryByText(/utelatt/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows backend validation errors and rejects unknown period values locally', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Velg maksimalt 93 dager.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const first = renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/Velg maksimalt 93 dager/)).toBeInTheDocument()
    first.unmount()
    renderPage('?websiteId=site-1&period=unknown')
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/Velg en gyldig periode/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('defaults to the first visit to a selected page and keeps the mode in share links', async () => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText')
    renderPage('?websiteId=site-1&period=last_7_days&urlPath=%2Fhello')
    expect(screen.getByLabelText('Analyseområde')).toHaveValue('from-first-visit')
    expect(screen.queryByText('Bare mønstre fra valgt side og tilbake.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText('Mønstre å undersøke')
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toContain('"pathScope":"from-first-visit"')
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toContain('"urlPath":"/hello"')
    await user.click(screen.getByRole('button', { name: 'Kopier lenke' }))
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('pathScope=from-first-visit'))
    await user.selectOptions(screen.getByLabelText('Analyseområde'), 'anywhere')
    expect(screen.getByText('Filtrene er endret')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('preserves an explicit broader scope, including when sharing and reopening the link', async () => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText')
    mockAnalysis({
      ...response,
      patterns: response.patterns.map((pattern) => ({ ...pattern, pages: [pattern.pages[0], '/hello'] })),
    })
    const page = renderPage('?websiteId=site-1&period=last_7_days&urlPath=%2Fhello&pathScope=anywhere')
    expect(screen.getByLabelText('Analyseområde')).toHaveValue('anywhere')
    expect(screen.getByRole('option', { name: 'Inneholder valgt side' })).toBeInTheDocument()
    expect(screen.queryByText('Også mønstre uten den valgte siden tas med.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText('Mønstre å undersøke')
    expect(analysisCalls()[0][1]?.body).toContain('"pathScope":"anywhere"')
    await user.click(screen.getByRole('button', { name: 'Kopier lenke' }))
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('pathScope=anywhere'))
    const sharedUrl = copy.mock.calls[0][0]
    page.unmount()
    renderPage(new URL(sharedUrl).search)
    expect(screen.getByLabelText('Analyseområde')).toHaveValue('anywhere')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('defaults to the whole website without a page and to selected-page patterns when a page is added', () => {
    renderPage()
    expect(screen.getByLabelText('Analyseområde')).toHaveValue('anywhere')
    expect(screen.getByRole('option', { name: 'Hele nettstedet' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fra valgt side' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Side (valgfritt)'), { target: { value: '/hello' } })
    expect(screen.getByLabelText('Analyseområde')).toHaveValue('from-first-visit')
    expect(screen.getByRole('option', { name: 'Fra valgt side' })).not.toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires an anchor, clears the broader scope with the page, and restores the default on a new page', async () => {
    const invalid = renderPage('?websiteId=site-1&period=last_7_days&pathScope=from-first-visit')
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/Velg en startside/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    invalid.unmount()
    renderPage('?websiteId=site-1&period=last_7_days&urlPath=%2Fhello&pathScope=anywhere')
    fireEvent.change(screen.getByLabelText('Side (valgfritt)'), { target: { value: '' } })
    expect(screen.getByLabelText('Analyseområde')).toHaveValue('anywhere')
    expect(screen.getByRole('option', { name: 'Hele nettstedet' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Side (valgfritt)'), { target: { value: '/new' } })
    expect(screen.getByLabelText('Analyseområde')).toHaveValue('from-first-visit')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires cost confirmation before executing a large query and supports cancelling', async () => {
    const large = {
      ...quote,
      requiresConfirmation: true,
      queryStats: { totalBytesProcessed: 50 * 1024 ** 3, totalBytesProcessedGB: '50.00', estimatedCostUSD: '0.305' },
    }
    vi.mocked(fetch).mockResolvedValueOnce(success(large))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    const dialog = await screen.findByRole('dialog', { name: 'Bekreft stor spørring' })
    expect(analysisCalls()).toHaveLength(0)
    expect(within(dialog).getByText(/50.00/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(analysisCalls()).toHaveLength(0)
    vi.mocked(fetch).mockResolvedValueOnce(success(large))
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ja, kjør spørringen' }))
    await screen.findByText('Mønstre å undersøke')
    expect(analysisCalls()).toHaveLength(1)
    expect(analysisCalls()[0][1]?.body).toContain(`"confirmedBytes":${large.queryStats.totalBytesProcessed}`)
  })

  it('never executes after an estimate failure or after filters invalidate a pending confirmation', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Kostnadsestimatet kunne ikke hentes.'))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(await screen.findByText(/Kostnadsestimatet kunne ikke hentes/)).toBeInTheDocument()
    expect(analysisCalls()).toHaveLength(0)
    vi.mocked(fetch).mockResolvedValueOnce(success({ ...quote, requiresConfirmation: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByRole('dialog', { name: 'Bekreft stor spørring' })
    fireEvent.change(screen.getByLabelText('Periode'), { target: { value: 'last_28_days' } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(analysisCalls()).toHaveLength(0)
  })

  it('shows a renewed cost quote if the server detects a cost increase before execution', async () => {
    const increased = {
      ...quote,
      requiresConfirmation: true,
      queryStats: { totalBytesProcessed: 70 * 1024 ** 3, totalBytesProcessedGB: '70.00', estimatedCostUSD: '0.427' },
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(success(quote))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(increased), { status: 409, headers: { 'Content-Type': 'application/json' } }),
      )
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByRole('dialog', { name: 'Bekreft stor spørring' })
    expect(screen.queryByText('Mønstre å undersøke')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ja, kjør spørringen' }))
    await screen.findByText('Mønstre å undersøke')
    expect(analysisCalls()[1][1]?.body).toContain(`"confirmedBytes":${increased.queryStats.totalBytesProcessed}`)
  })

  it('filters every pattern type and minimum reach without making another query', async () => {
    mockAnalysis({
      ...response,
      patterns: [
        ...response.patterns,
        {
          ...response.patterns[0],
          id: 'cycle',
          type: 'cycle',
          pages: ['/a', '/b', '/c'],
          sessions: 9,
          share: 0.09,
          trend: [
            { date: '2026-10-28', sessions: 3 },
            { date: '2026-10-29', sessions: 3 },
            { date: '2026-10-30', sessions: 3 },
          ],
        },
      ],
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText('Mønstre å undersøke')
    await userEvent.selectOptions(screen.getByLabelText('Mønstertype'), 'cycle')
    expect(screen.getByRole('button', { name: /Rundgang/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Frem og tilbake/ })).not.toBeInTheDocument()
    expect(screen.getByText('Treff på 3 dager')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Minst antall økter'), '10')
    expect(screen.getByText(/Ingen mønstre passer filtrene/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Last ned CSV' })).toBeDisabled()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
