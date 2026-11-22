import {
  buildTransferChart,
  convertSqlForEnvironment,
  isTransferChart,
  getTransferTarget,
  getTransferEnvironment,
  transferEnvironments,
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

  it('rejects unsupported charts and invalid incoming payloads', () => {
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
