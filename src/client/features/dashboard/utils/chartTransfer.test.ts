// @vitest-environment-options {"url":"https://innblikk.ansatt.nav.no"}
import {
  buildChartImportUrl,
  buildTransferChart,
  clearChartImport,
  convertSqlForEnvironment,
  isTransferChart,
  getTransferTarget,
  getTransferEnvironment,
  transferEnvironments,
  initializeChartImport,
  type TransferChart,
} from './chartTransfer'

describe('chart transfer', () => {
  it.each(['prod', 'dev'] as const)(
    'converts table references to %s without changing strings, comments or placeholders',
    (target) => {
      const sourceProject = transferEnvironments[target === 'prod' ? 'dev' : 'prod'].projectId
      const targetProject = transferEnvironments[target].projectId
      const sql = [
        'SELECT \'team-researchops-dev-4396.umami_views.event\' AS label, "team-researchops-dev-4396.umami_views.event" AS other',
        'FROM `team-researchops-dev-4396.umami_views.event` e',
        'JOIN `team-researchops-dev-4396.umami.public_session` s ON e.session_id = s.session_id',
        'JOIN team-researchops-dev-4396.umami_views.event_data d ON TRUE',
        "WHERE e.website_id = '{{website_id}}' [[AND {{created_at}}]]",
        '-- team-researchops-dev-4396.umami_views.event',
        '/* @filter label "team-researchops-dev-4396.umami_views.event" */',
        "AND e.event_name = '''team-researchops-dev-4396.umami_views.event'''",
      ]
        .join('\n')
        .replace(/team-researchops-dev-4396/g, sourceProject)
      expect(convertSqlForEnvironment(sql, target)).toBe(
        sql
          .replace(`\`${sourceProject}.umami_views.event\``, `\`${targetProject}.umami_views.event\``)
          .replace(`\`${sourceProject}.umami.public_session\``, `\`${targetProject}.umami.public_session\``)
          .replace(`JOIN ${sourceProject}.umami_views.event_data`, `JOIN ${targetProject}.umami_views.event_data`),
      )
    },
  )

  it.each(['prod', 'dev'] as const)('preserves unrelated and already-%s references', (target) => {
    const sql = `SELECT * FROM \`other-project.dataset.table\` JOIN \`${transferEnvironments[target].projectId}.umami_views.session\` ON TRUE`
    expect(convertSqlForEnvironment(sql, target)).toBe(sql)
  })

  describe('chart import links', () => {
    const chart: TransferChart = {
      title: 'Besøk – øæå 🚀',
      graphType: 'TABLE',
      width: 50,
      description: 'SQL med & + # og Unicode',
      sourceWebsites: [
        { id: 'one', name: 'Første nettsted', domain: 'one.nav.no' },
        { id: 'two', name: 'Andre nettsted', domain: 'two.nav.no' },
      ],
      queries: [
        { name: 'Første', sql: `SELECT '${'øæå & + #'.repeat(2000)}' WHERE website_id IN ('one', 'two')` },
        { name: 'Andre', sql: 'SELECT * FROM `team-researchops-dev-4396.umami_views.session`' },
      ],
    }

    beforeEach(() => {
      clearChartImport()
      sessionStorage.clear()
      window.history.replaceState({}, '', '/')
    })

    afterEach(() => vi.restoreAllMocks())

    const openLink = () => {
      const url = new URL(buildChartImportUrl(chart, 'prod', transferEnvironments.dev.origin))
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      return url
    }

    it.each(['prod', 'dev'] as const)(
      'puts all chart data in the fragment for %s, not HTTP query parameters',
      (target) => {
        const source = target === 'prod' ? 'dev' : 'prod'
        const url = new URL(buildChartImportUrl(chart, target, transferEnvironments[source].origin))
        expect(url.origin).toBe(transferEnvironments[target].origin)
        expect(url.pathname).toBe('/importer-graf')
        expect([...url.searchParams.keys()]).toEqual(['importId'])
        expect(url.search).not.toContain('SELECT')
        const payload: unknown = JSON.parse(new URLSearchParams(url.hash.slice(1)).get('chart')!)
        expect(payload).toEqual({ version: 1, sourceOrigin: transferEnvironments[source].origin, chart })
      },
    )

    it('validates and stores the chart before removing its fragment, preserving existing history state', () => {
      const url = openLink()
      window.history.replaceState({ existing: 'state' }, '', url.pathname + url.search + url.hash)
      expect(initializeChartImport()).toEqual({ chart, error: null })
      expect(window.location.hash).toBe('')
      expect(window.history.state).toEqual({ existing: 'state' })
      expect(JSON.parse(sessionStorage.getItem(`innblikk-chart-import:${url.searchParams.get('importId')}`)!)).toEqual({
        version: 1,
        sourceOrigin: transferEnvironments.dev.origin,
        chart,
      })
      expect(initializeChartImport()).toEqual({ chart, error: null })
    })

    it('restores a chart from tab storage after a fresh module load without a fragment', async () => {
      openLink()
      initializeChartImport()
      vi.resetModules()
      const reloaded = await import('./chartTransfer')
      expect(reloaded.initializeChartImport()).toEqual({ chart, error: null })
      expect(window.location.hash).toBe('')
    })

    it.each([
      'not-json',
      JSON.stringify({ version: 1, sourceOrigin: 'https://evil.test', chart }),
      JSON.stringify({ version: 1, sourceOrigin: transferEnvironments.prod.origin, chart }),
      JSON.stringify({ version: 2, sourceOrigin: transferEnvironments.dev.origin, chart }),
      JSON.stringify({ version: 1, sourceOrigin: transferEnvironments.dev.origin, chart: { ...chart, queries: [] } }),
    ])('rejects malformed or wrong-environment links and clears their fragments', (payload) => {
      window.history.replaceState(
        {},
        '',
        `/importer-graf?importId=${crypto.randomUUID()}#${new URLSearchParams({ chart: payload })}`,
      )
      const state = initializeChartImport()
      expect(state.chart).toBeNull()
      expect(state.error).toMatch(/ugyldig/)
      expect(window.location.hash).toBe('')
      expect(sessionStorage.length).toBe(0)
    })

    it('reports unavailable tab storage rather than pretending the import can be resumed', () => {
      openLink()
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage blocked', 'SecurityError')
      })
      expect(initializeChartImport()).toEqual({
        chart: null,
        error: 'Kunne ikke lagre importen midlertidig i nettleseren. Tillat lagring og prøv igjen.',
      })
      expect(window.location.hash).toBe('')
      expect(initializeChartImport().chart).toBeNull()
    })

    it('removes pending data after completion without affecting other tab storage', () => {
      openLink()
      initializeChartImport()
      sessionStorage.setItem('other', 'keep')
      clearChartImport()
      expect(sessionStorage.length).toBe(1)
      expect(sessionStorage.getItem('other')).toBe('keep')
      expect(initializeChartImport().chart).toBeNull()
    })
  })

  it('transfers chart metadata and all variants without freezing dashboard filters', () => {
    expect(
      buildTransferChart({
        title: 'Besøk',
        type: 'line',
        sql: "SELECT '{{website_id}}'",
        description: 'Forklaring',
        width: 'full',
        variants: [
          { queryName: 'Besøk', sql: "SELECT '{{website_id}}'" },
          { queryName: 'Sidevisninger', sql: 'SELECT 2' },
        ],
      }),
    ).toEqual({
      title: 'Besøk',
      graphType: 'LINE',
      description: 'Forklaring',
      width: 100,
      queries: [
        { name: 'Besøk', sql: "SELECT '{{website_id}}'" },
        { name: 'Sidevisninger', sql: 'SELECT 2' },
      ],
    })
  })

  it('imports a saved chart with a null description and unnamed variants without rejecting it', () => {
    const payload = buildTransferChart({
      title: 'Skjermstørrelse',
      type: 'table',
      sql: 'SELECT 1',
      description: null,
      variants: [
        { queryName: '', sql: 'SELECT 1' },
        { queryName: null, sql: 'SELECT 2' },
        { sql: 'SELECT 3' },
        { queryName: 'Navngitt variant', sql: 'SELECT 4' },
      ],
    })
    expect(payload.description).toBeUndefined()
    expect(payload.queries).toEqual([
      { name: 'Skjermstørrelse - query 1', sql: 'SELECT 1' },
      { name: 'Skjermstørrelse - query 2', sql: 'SELECT 2' },
      { name: 'Skjermstørrelse - query 3', sql: 'SELECT 3' },
      { name: 'Navngitt variant', sql: 'SELECT 4' },
    ])
    const url = new URL(buildChartImportUrl(payload, 'prod', transferEnvironments.dev.origin))
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    expect(initializeChartImport()).toEqual({ chart: payload, error: null })
    clearChartImport()
  })

  it('rejects unsupported chart types and keeps format validation for incoming links', () => {
    expect(() => buildTransferChart({ title: 'Tekst', type: 'text', sql: 'SELECT 1' })).toThrow()
    expect(
      isTransferChart({ title: 'Test', graphType: 'TABLE', width: 50, queries: [{ name: 'Test', sql: '' }] }),
    ).toBe(false)
    expect(isTransferChart({ title: 'Test', graphType: 'TABLE', width: NaN, queries: [] })).toBe(false)
  })

  it('selects the opposite environment only for trusted application origins', () => {
    expect(getTransferTarget('https://innblikk.ansatt.dev.nav.no')).toBe('prod')
    expect(getTransferTarget('http://localhost:5173')).toBe('prod')
    expect(getTransferTarget('https://innblikk.ansatt.nav.no')).toBe('dev')
    expect(getTransferTarget('https://innblikk.ansatt.dev.nav.no.evil.test')).toBeNull()
    expect(getTransferTarget('http://localhost:5173/path')).toBeNull()
    expect(getTransferEnvironment('https://innblikk.ansatt.dev.nav.no')).toBe('dev')
    expect(getTransferEnvironment('https://innblikk.ansatt.nav.no')).toBe('prod')
    expect(getTransferEnvironment('http://localhost:5173')).toBeNull()
  })
})
