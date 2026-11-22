import type { SavedChart } from '../../../shared/types/savedChart'

export const PRODUCTION_ORIGIN = 'https://innblikk.ansatt.nav.no'
export const DEVELOPMENT_ORIGIN = 'https://innblikk.ansatt.dev.nav.no'
export const CHART_IMPORT_PATH = '/importer-graf'
export const TRANSFER_CHANNEL = 'innblikk-chart-transfer'
export type TransferEnvironment = 'prod' | 'dev'

export const transferEnvironments = {
  prod: { origin: PRODUCTION_ORIGIN, projectId: 'team-researchops-prod-01d6' },
  dev: { origin: DEVELOPMENT_ORIGIN, projectId: 'team-researchops-dev-4396' },
} as const

export type TransferChart = {
  title: string
  graphType: 'LINE' | 'BAR' | 'PIE' | 'TABLE'
  width: number
  description?: string
  websiteId?: string
  sourceWebsites?: { id: string; name: string; domain: string }[]
  queries: { name: string; sql: string }[]
}

export const getTransferEnvironment = (origin: string): TransferEnvironment | null => {
  if (origin === PRODUCTION_ORIGIN) return 'prod'
  if (origin === DEVELOPMENT_ORIGIN) return 'dev'
  return null
}

export const getTransferTarget = (origin: string): TransferEnvironment | null => {
  if (origin === PRODUCTION_ORIGIN) return 'dev'
  if (origin === DEVELOPMENT_ORIGIN) return 'prod'
  try {
    const url = new URL(origin)
    const isLocal =
      url.origin === origin &&
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return isLocal ? 'prod' : null
  } catch {
    return null
  }
}

export const convertSqlForEnvironment = (sql: string, target: TransferEnvironment): string =>
  sql.replace(
    /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'''(?:\\[\s\S]|(?!''')[\s\S])*'''|"""(?:\\[\s\S]|(?!""")[\s\S])*"""|'(?:\\[\s\S]|''|[^'\\])*'|"(?:\\[\s\S]|""|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`|\bteam-researchops-(?:dev-4396|prod-01d6)(?=\.[A-Za-z_]\w*\.)/g,
    (token) => {
      const projectId = transferEnvironments[target].projectId
      if (token.startsWith('`')) {
        return token.replace(/^`team-researchops-(?:dev-4396|prod-01d6)(?=\.)/, `\`${projectId}`)
      }
      return /^team-researchops-(?:dev-4396|prod-01d6)$/.test(token) ? projectId : token
    },
  )

export const isTransferChart = (value: unknown): value is TransferChart => {
  if (!value || typeof value !== 'object') return false
  const chart = value as Record<string, unknown>
  return (
    typeof chart.title === 'string' &&
    Boolean(chart.title.trim()) &&
    typeof chart.graphType === 'string' &&
    ['LINE', 'BAR', 'PIE', 'TABLE'].includes(chart.graphType) &&
    typeof chart.width === 'number' &&
    Number.isFinite(chart.width) &&
    chart.width >= 1 &&
    chart.width <= 100 &&
    (chart.description === undefined || typeof chart.description === 'string') &&
    (chart.websiteId === undefined || typeof chart.websiteId === 'string') &&
    (chart.sourceWebsites === undefined ||
      (Array.isArray(chart.sourceWebsites) &&
        chart.sourceWebsites.every(
          (website: unknown) =>
            website !== null &&
            typeof website === 'object' &&
            'id' in website &&
            typeof website.id === 'string' &&
            'name' in website &&
            typeof website.name === 'string' &&
            'domain' in website &&
            typeof website.domain === 'string',
        ))) &&
    Array.isArray(chart.queries) &&
    chart.queries.length > 0 &&
    chart.queries.every(
      (query: unknown) =>
        query !== null &&
        typeof query === 'object' &&
        'name' in query &&
        typeof query.name === 'string' &&
        Boolean(query.name.trim()) &&
        'sql' in query &&
        typeof query.sql === 'string' &&
        Boolean(query.sql.trim()),
    )
  )
}

export const buildTransferChart = (
  chart: SavedChart & { variants?: { queryName: string; sql: string }[] },
  websiteId?: string,
): TransferChart => {
  const graphTypes = { line: 'LINE', bar: 'BAR', pie: 'PIE', table: 'TABLE' } as const
  if (!(chart.type in graphTypes) || !chart.sql) {
    throw new Error('Denne grafen kan ikke eksporteres.')
  }
  const graphType = graphTypes[chart.type as keyof typeof graphTypes]
  const width = chart.width === 'full' ? 100 : chart.width === 'half' || !chart.width ? 50 : Number(chart.width)
  const payload = {
    title: chart.title,
    graphType,
    width,
    description: chart.description,
    ...(websiteId ? { websiteId } : {}),
    queries: chart.variants?.length
      ? chart.variants.map((query) => ({ name: query.queryName, sql: query.sql }))
      : [{ name: `${chart.title} - query`, sql: chart.sql }],
  }
  if (!isTransferChart(payload)) throw new Error('Grafen mangler informasjon som kreves for eksport.')
  return payload
}
