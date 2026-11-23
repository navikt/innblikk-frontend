import type { SavedChart } from '../../../shared/types/savedChart'

export const PRODUCTION_ORIGIN = 'https://innblikk.ansatt.nav.no'
export const DEVELOPMENT_ORIGIN = 'https://innblikk.ansatt.dev.nav.no'
export const CHART_IMPORT_PATH = '/importer-graf'
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

export type ChartImportState = { chart: TransferChart; error: null } | { chart: null; error: string }

const importStoragePrefix = 'innblikk-chart-import:'
let preparedImport: { context: string; state: ChartImportState } | undefined

export const buildChartImportUrl = (
  chart: TransferChart,
  target: TransferEnvironment,
  sourceOrigin: string,
): string => {
  if (getTransferTarget(sourceOrigin) !== target) {
    throw new Error('Grafen kan ikke legges til i dette miljøet.')
  }
  const url = new URL(CHART_IMPORT_PATH, transferEnvironments[target].origin)
  url.searchParams.set('importId', crypto.randomUUID())
  url.hash = new URLSearchParams({ chart: JSON.stringify({ version: 1, sourceOrigin, chart }) }).toString()
  return url.toString()
}

export const initializeChartImport = (): ChartImportState => {
  const context = `${window.location.origin}${window.location.pathname}${window.location.search}`
  if (!window.location.hash && preparedImport?.context === context) return preparedImport.state
  const importId = new URLSearchParams(window.location.search).get('importId')
  const target = getTransferEnvironment(window.location.origin)
  const hash = window.location.hash
  let state: ChartImportState
  try {
    if (window.location.pathname !== CHART_IMPORT_PATH || !importId || target === null) {
      throw new Error('Åpne «Legg til i Innblikk» på nytt fra grafmenyen.')
    }
    let serialized: string | null
    try {
      serialized = hash
        ? new URLSearchParams(hash.slice(1)).get('chart')
        : sessionStorage.getItem(`${importStoragePrefix}${importId}`)
    } catch {
      throw new Error('Kunne ikke lese importen fra nettleseren. Tillat midlertidig lagring og prøv igjen.')
    }
    if (!serialized) {
      throw new Error(
        'Grafen mangler i lenken. Hvis du nettopp logget inn, åpne «Legg til i Innblikk» på nytt fra grafmenyen.',
      )
    }
    let payload: unknown
    try {
      payload = JSON.parse(serialized)
    } catch {
      throw new Error('Grafen i lenken er ugyldig. Åpne «Legg til i Innblikk» på nytt fra grafmenyen.')
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('version' in payload) ||
      payload.version !== 1 ||
      !('sourceOrigin' in payload) ||
      typeof payload.sourceOrigin !== 'string' ||
      getTransferTarget(payload.sourceOrigin) !== target ||
      !('chart' in payload) ||
      !isTransferChart(payload.chart)
    ) {
      throw new Error('Grafen i lenken er ugyldig eller tilhører feil miljø.')
    }
    if (hash) {
      try {
        sessionStorage.setItem(`${importStoragePrefix}${importId}`, serialized)
      } catch {
        throw new Error('Kunne ikke lagre importen midlertidig i nettleseren. Tillat lagring og prøv igjen.')
      }
    }
    state = { chart: payload.chart, error: null }
  } catch (err) {
    state = { chart: null, error: err instanceof Error ? err.message : 'Kunne ikke lese grafen fra lenken.' }
  } finally {
    if (hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }
  preparedImport = { context, state }
  return state
}

export const clearChartImport = () => {
  preparedImport = undefined
  const importId = new URLSearchParams(window.location.search).get('importId')
  if (importId) {
    try {
      sessionStorage.removeItem(`${importStoragePrefix}${importId}`)
    } catch {
      throw new Error('Kunne ikke fjerne importdata fra nettleseren.')
    }
  }
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
  chart: Omit<SavedChart, 'description'> & {
    description?: string | null
    variants?: { queryName?: string | null; sql: string }[]
  },
  websiteId?: string,
): TransferChart => {
  const graphTypes = { line: 'LINE', bar: 'BAR', pie: 'PIE', table: 'TABLE' } as const
  if (!(chart.type in graphTypes) || !chart.sql) {
    throw new Error('Denne grafen kan ikke eksporteres.')
  }
  const graphType = graphTypes[chart.type as keyof typeof graphTypes]
  const width = chart.width === 'full' ? 100 : chart.width === 'half' || !chart.width ? 50 : Number(chart.width)
  return {
    title: chart.title,
    graphType,
    width,
    description: chart.description ?? undefined,
    ...(websiteId ? { websiteId } : {}),
    queries: chart.variants?.length
      ? chart.variants.map((query, index) => ({
          name: query.queryName?.trim() || `${chart.title} - query ${index + 1}`,
          sql: query.sql,
        }))
      : [{ name: `${chart.title} - query`, sql: chart.sql }],
  }
}
