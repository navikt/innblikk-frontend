import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as sqlFormatter from 'sql-formatter'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils.ts'
import {
  applyUrlFiltersToSql,
  applyWebsiteIdOnly,
  ensureWebsitePlaceholder,
  extractWebsiteId,
  sanitizePlaceholders,
  restorePlaceholders,
  updateUrlParams,
} from '../../sql/utils/sqlProcessing'
import { prepareLineChartData, prepareBarChartData, preparePieChartData } from '../../sql/utils/chartHelpers'
import { fetchWebsites, estimateQueryCost, executeQueryApi } from '../../sql/api/sqlApi'
import type { Website, QueryResult, QueryStats } from '../model/types'
import { INITIAL_SQL_QUERY } from '../model/schemaAndSnippets'
import { applyAutomaticFilters, type AutomaticFilterUsage } from '../model/automaticFilters'

const sqlPrefillCache = new Map<string, string>()

export const SAFETY_LIMIT_OPTIONS = [100, 500, 1000, 5000] as const

const getSqlCode = (sql: string): string =>
  sql.replace(
    /\[\[[\s\S]*?\]\]|\{\{[^}]+\}\}|--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`/g,
    (token) => token.replace(/[^\r\n]/g, /^(?:--|#|\/\*)/.test(token) ? ' ' : '_'),
  )

const getExplicitLimitMatch = (sql: string) => getSqlCode(sql).match(/\bLIMIT\s+(\d+)(?:\s+OFFSET\s+\d+)?\s*;?\s*$/i)

const extractExplicitLimit = (sql: string): number | null => {
  const match = getExplicitLimitMatch(sql)
  return match ? Number(match[1]) : null
}

const replaceExplicitLimit = (sql: string, limit: number): string => {
  const match = getExplicitLimitMatch(sql)
  if (!match || match.index === undefined) return sql
  const numberOffset = match.index + match[0].indexOf(match[1])
  return `${sql.slice(0, numberOffset)}${limit}${sql.slice(numberOffset + match[1].length)}`
}

const removeExplicitLimit = (sql: string): string => {
  const match = getExplicitLimitMatch(sql)
  if (!match || match.index === undefined) return sql
  const clause = /^LIMIT\s+\d+(?:\s+OFFSET\s+\d+)?/i.exec(getSqlCode(sql).slice(match.index))
  if (!clause) return sql
  return sql.slice(0, match.index).trimEnd() + sql.slice(match.index + clause[0].length)
}

const applySafetyLimit = (sql: string, safetyLimit: number | null): string => {
  if (safetyLimit === null) return sql
  const code = getSqlCode(sql).trimEnd()
  if (!code || extractExplicitLimit(sql) !== null) return sql
  const insertionOffset = code.endsWith(';') ? code.length - 1 : code.length
  return `${sql.slice(0, insertionOffset).trimEnd()}\nLIMIT ${safetyLimit}${sql.slice(insertionOffset)}`
}

const getInitialQuery = (): string => {
  if (typeof window === 'undefined') return INITIAL_SQL_QUERY
  const urlParams = new URLSearchParams(window.location.search)
  let sqlParam = urlParams.get('sql')
  const sqlStorageKey = urlParams.get('sqlStorageKey')

  if (!sqlParam && sqlStorageKey) {
    try {
      const cachedSql = sqlPrefillCache.get(sqlStorageKey)
      const storedSql =
        cachedSql || window.localStorage.getItem(sqlStorageKey) || window.sessionStorage.getItem(sqlStorageKey)
      if (storedSql) {
        sqlParam = storedSql
        sqlPrefillCache.set(sqlStorageKey, storedSql)
        window.localStorage.removeItem(sqlStorageKey)
        window.sessionStorage.removeItem(sqlStorageKey)
      }
    } catch {
      // Ignore storage errors
    }
  }

  return sqlParam || INITIAL_SQL_QUERY
}

export const useSqlNextEditor = () => {
  const [searchParams] = useSearchParams()

  const urlPathFromUrl = searchParams.get('urlPath')
  const pathOperatorFromUrl = searchParams.get('pathOperator')
  const dateRangeFromUrl = searchParams.get('dateRange')
  const customStartFromUrl = searchParams.get('customStartDate')
  const customEndFromUrl = searchParams.get('customEndDate')

  const [customVariableValues, setCustomVariableValues] = useState<Record<string, string>>({})
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false)
  const [availableWebsites, setAvailableWebsites] = useState<Website[]>([])

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>(() => {
    const range = getDateRangeFromPeriod(
      dateRangeFromUrl || 'last_7_days',
      customStartFromUrl ? new Date(customStartFromUrl) : undefined,
      customEndFromUrl ? new Date(customEndFromUrl) : undefined,
    )
    return range ? { from: range.startDate, to: range.endDate } : { from: undefined, to: undefined }
  })
  const [period, setPeriod] = useState<string>(() => dateRangeFromUrl || 'last_7_days')
  const [urlPath, setUrlPath] = useState(() => (urlPathFromUrl ? urlPathFromUrl.split(',')[0] : '/'))
  const [websiteIdState, setWebsiteIdState] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('websiteId') || ''
  })
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [websiteIdsState, setWebsiteIdsState] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    const ids = new URLSearchParams(window.location.search).get('websiteIds')
    return ids ? [...new Set(ids.split(',').filter(Boolean))] : websiteIdState ? [websiteIdState] : []
  })

  const [query, setQuery] = useState<string>(getInitialQuery)
  const [safetyLimit, setSafetyLimit] = useState<number | null>(100)
  const [validateError, setValidateError] = useState<string | null>(null)
  const [validationRequested, setValidationRequested] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [estimate, setEstimate] = useState<QueryStats | null>(null)
  const [dryRunError, setDryRunError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareSuccess, setShareSuccess] = useState(false)
  const [lastProcessedSql, setLastProcessedSql] = useState<string>('')
  const [copiedMetabase, setCopiedMetabase] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingQueryEstimate, setPendingQueryEstimate] = useState<QueryStats | null>(null)
  const [pendingQuery, setPendingQuery] = useState<{ sql: string; source: string } | null>(null)

  const dryRunRequestIdRef = useRef(0)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  // Derived flags from query
  const {
    hasMetabaseDateFilter,
    hasUrlPathFilter,
    hasWebsiteIdPlaceholder,
    hasNettsidePlaceholder,
    hasHardcodedWebsiteId,
    customVariables,
    oldTableWarning,
    explicitLimit,
    isSelectStarOnBigTable,
    isMissingPartitionFilter,
  } = useMemo(() => {
    if (!query.trim()) {
      return {
        hasMetabaseDateFilter: false,
        hasUrlPathFilter: false,
        hasWebsiteIdPlaceholder: false,
        hasNettsidePlaceholder: false,
        hasHardcodedWebsiteId: false,
        customVariables: [] as string[],
        oldTableWarning: false,
        explicitLimit: null as number | null,
        isSelectStarOnBigTable: false,
        isMissingPartitionFilter: false,
      }
    }

    const datePattern = /\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/i
    const explicitCreatedAt = /\bcreated_at\b/i
    const metabaseDate = datePattern.test(query) || explicitCreatedAt.test(query)

    const queriesPartitionedTable = /umami_views\.(event|session|event_data)/i.test(query)
    const selectStar = /SELECT\s+\*/i.test(query) && queriesPartitionedTable
    const missingPartition = queriesPartitionedTable && !metabaseDate

    const urlPathPattern = /\[\[\s*\{\{url_sti\}\}\s*--\s*\]\]\s*'\/'/i
    const andUrlPathPattern = /\[\[\s*AND\s*\{\{url_sti\}\}\s*\]\]/i
    const urlPathPattern2 = /\[\[\s*\{\{url_path\}\}\s*--\s*\]\]\s*'\/'/i
    const andUrlPathPattern2 = /\[\[\s*AND\s*\{\{url_path\}\}\s*\]\]/i
    const directUrlPathPattern = /\{\{\s*url_(?:sti|path)\s*\}\}/i
    const urlPathInSpecialPattern =
      urlPathPattern.test(query) ||
      andUrlPathPattern.test(query) ||
      urlPathPattern2.test(query) ||
      andUrlPathPattern2.test(query) ||
      directUrlPathPattern.test(query)

    const websiteIdPattern = /\{\{\s*website_id\s*\}\}/i
    const nettsidePattern = /\{\{\s*nettside\s*\}\}/i
    const hardcodedWebsiteIdPattern = /website_id\s*=\s*['"][0-9a-f-]{36}['"]/i

    const alwaysKnownVariables = ['website_id', 'nettside', 'created_at']
    const knownVariables = urlPathInSpecialPattern
      ? [...alwaysKnownVariables, 'url_sti', 'url_path']
      : alwaysKnownVariables

    const allVariablesRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/gi
    const matches = [...query.matchAll(allVariablesRegex)]
    const detectedVars = matches
      .map((m) => m[1])
      .filter((v) => !knownVariables.includes(v.toLowerCase()))
      .filter((v, i, arr) => arr.indexOf(v) === i)

    const hasOldEventTable = /umami\.public_website_event/.test(query)
    const hasOldSessionTable = /umami\.public_session/.test(query)

    return {
      hasMetabaseDateFilter: metabaseDate,
      hasUrlPathFilter: urlPathInSpecialPattern,
      hasWebsiteIdPlaceholder: websiteIdPattern.test(query),
      hasNettsidePlaceholder: nettsidePattern.test(query),
      hasHardcodedWebsiteId: hardcodedWebsiteIdPattern.test(query),
      customVariables: detectedVars,
      oldTableWarning: hasOldEventTable || hasOldSessionTable,
      explicitLimit: extractExplicitLimit(query),
      isSelectStarOnBigTable: selectStar,
      isMissingPartitionFilter: missingPartition,
    }
  }, [query])

  const activeLimit = explicitLimit ?? safetyLimit
  const isResultLimited = activeLimit !== null && Boolean(result?.data && result.data.length >= activeLimit)
  const isHighCost = Boolean(estimate && Number(estimate.totalBytesProcessedGB ?? 0) >= 5)
  const groupByField =
    /SELECT list expression references (?:column )?([a-z_]\w*(?:\.[a-z_]\w*)*) which is neither grouped nor aggregated/i.exec(
      error ?? dryRunError ?? '',
    )?.[1] ?? null

  const incompleteQueryMessage =
    /(?:\b(?:SELECT|FROM|WHERE|AND|OR|ON|JOIN|BY|LIMIT|OFFSET)|[=<>!+*/,-])\s*;?\s*$/i.test(getSqlCode(query))
      ? 'Spørringen er ikke ferdig.'
      : null

  const effectiveSelectedWebsite = useMemo(() => {
    if (selectedWebsite) return selectedWebsite
    if (hasHardcodedWebsiteId && availableWebsites.length > 0) {
      const detectedId = extractWebsiteId(query)
      if (detectedId) {
        return availableWebsites.find((w) => w.id === detectedId) ?? null
      }
    }
    return null
  }, [selectedWebsite, hasHardcodedWebsiteId, availableWebsites, query])

  const effectiveWebsiteId =
    websiteIdsState[0] || websiteIdState || effectiveSelectedWebsite?.id || extractWebsiteId(query) || ''
  const effectiveWebsiteIds = websiteIdsState.length ? websiteIdsState : effectiveWebsiteId ? [effectiveWebsiteId] : []

  const getFilterContext = useCallback(
    () => ({
      websiteIdState: effectiveWebsiteId,
      websiteIds: websiteIdsState.length ? websiteIdsState : effectiveWebsiteId ? [effectiveWebsiteId] : [],
      selectedWebsite: effectiveSelectedWebsite,
      urlPathFromUrl,
      urlPath,
      pathOperatorFromUrl,
      dateRange,
      customVariables,
      customVariableValues,
    }),
    [
      effectiveWebsiteId,
      websiteIdsState,
      effectiveSelectedWebsite,
      urlPathFromUrl,
      urlPath,
      pathOperatorFromUrl,
      dateRange,
      customVariables,
      customVariableValues,
    ],
  )

  const prepareQuery = useCallback(
    async (sql: string, onFilterUsage?: (usage: AutomaticFilterUsage) => void) => {
      const context = getFilterContext()
      return applyAutomaticFilters(applyUrlFiltersToSql(sql, context), context, onFilterUsage)
    },
    [getFilterContext],
  )

  const getQueryPreview = useCallback(async () => {
    if (!query.trim() || incompleteQueryMessage) throw new Error('Fullfør spørringen for å se SQL som kjøres.')
    const filterUsage: AutomaticFilterUsage[] = []
    const sql = await prepareQuery(applySafetyLimit(query, safetyLimit), (usage) => filterUsage.push(usage))
    return { sql, filterUsage }
  }, [query, safetyLimit, incompleteQueryMessage, prepareQuery])

  // Load websites
  useEffect(() => {
    if (availableWebsites.length > 0) return
    fetchWebsites()
      .then(setAvailableWebsites)
      .catch((err: unknown) => {
        console.error('Error fetching websites:', err)
      })
  }, [availableWebsites.length])

  const formatSQL = () => {
    try {
      const { sanitized, placeholders } = sanitizePlaceholders(query)
      const formatted = sqlFormatter.format(sanitized)
      setQuery(restorePlaceholders(formatted, placeholders))
      setValidateError(null)
    } catch {
      setValidateError('Kunne ikke formatere SQL. Sjekk om den er gyldig.')
    }
  }

  const validateSQL = async () => {
    setError(null)
    setValidationRequested(true)
    setValidateError(null)
    setEstimate(null)
    setDryRunError(null)
    if (!query.trim() || incompleteQueryMessage) return
    if (/\{\{\s*website_id\s*\}\}/i.test(query) && !effectiveWebsiteId) {
      setValidateError('Velg en nettside først.')
      return
    }

    const reqId = ++dryRunRequestIdRef.current
    setEstimating(true)
    try {
      const processedSql = await prepareQuery(query)
      setLastProcessedSql(processedSql)
      const data = await estimateQueryCost(processedSql)
      if (dryRunRequestIdRef.current === reqId) setEstimate(data)
    } catch (err: unknown) {
      if (dryRunRequestIdRef.current === reqId) {
        setDryRunError(err instanceof Error ? err.message : 'Kunne ikke sjekke spørringen')
      }
    } finally {
      if (dryRunRequestIdRef.current === reqId) setEstimating(false)
    }
  }

  const runPreparedQuery = async (processedSql: string, sourceQuery: string) => {
    setLoading(true)
    setError(null)
    setDryRunError(null)
    setResult(null)
    setHasAttemptedFetch(true)
    updateUrlParams({ sql: sourceQuery })

    try {
      setLastProcessedSql(processedSql)
      const data = await executeQueryApi(processedSql)
      setResult(data)
      if (data.queryStats) {
        setEstimate(data.queryStats)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Noe gikk galt under kjøring av spørringen'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const executeQueryWithLimit = async (overrideLimit?: number | null) => {
    const limitToUse = overrideLimit !== undefined ? overrideLimit : safetyLimit
    const nextQuery =
      overrideLimit === null
        ? removeExplicitLimit(query)
        : overrideLimit !== undefined && explicitLimit !== null
          ? replaceExplicitLimit(query, overrideLimit)
          : query

    setLoading(true)
    setError(null)
    setDryRunError(null)
    dryRunRequestIdRef.current += 1
    setEstimating(false)

    try {
      const sqlWithLimit = applySafetyLimit(nextQuery, limitToUse)
      const processedSql = await prepareQuery(sqlWithLimit)
      setLastProcessedSql(processedSql)

      const estimateData = await estimateQueryCost(processedSql)
      setEstimate(estimateData)

      const gb = Number(estimateData.totalBytesProcessedGB ?? 0)
      const shouldWarn = gb >= 20 || (isSelectStarOnBigTable && gb >= 5)

      if (shouldWarn) {
        setPendingQueryEstimate(estimateData)
        setPendingQuery({ sql: processedSql, source: nextQuery })
        setShowConfirmModal(true)
        setLoading(false)
        return
      }

      if (nextQuery !== query) setQuery(nextQuery)
      await runPreparedQuery(processedSql, nextQuery)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Noe gikk galt under kjøring av spørringen'
      setError(message)
      setHasAttemptedFetch(true)
      setLoading(false)
    }
  }

  const executeQuery = async () => {
    setValidationRequested(true)
    if (incompleteQueryMessage) return
    await executeQueryWithLimit()
  }

  const handleConfirmQuery = async () => {
    setShowConfirmModal(false)
    const prepared = pendingQuery
    setPendingQuery(null)
    setPendingQueryEstimate(null)
    if (prepared) await runPreparedQuery(prepared.sql, prepared.source)
  }

  const handleCancelQuery = () => {
    setShowConfirmModal(false)
    setPendingQuery(null)
    setPendingQueryEstimate(null)
  }

  const handleSafetyLimitChange = async (newLimit: number | null) => {
    setSafetyLimit(newLimit)
    if (explicitLimit !== null) {
      setQuery((previous) =>
        newLimit === null ? removeExplicitLimit(previous) : replaceExplicitLimit(previous, newLimit),
      )
    }
    if (hasAttemptedFetch && query.trim()) {
      await executeQueryWithLimit(newLimit)
    }
  }

  const shareQuery = () => {
    const params = new URLSearchParams({ sql: query, dateRange: period })
    if (effectiveWebsiteIds.length > 1) params.set('websiteIds', effectiveWebsiteIds.join(','))
    else if (effectiveWebsiteId) params.set('websiteId', effectiveWebsiteId)
    if (period === 'custom') {
      if (dateRange.from) params.set('customStartDate', dateRange.from.toISOString())
      if (dateRange.to) params.set('customEndDate', dateRange.to.toISOString())
    }
    const shareUrl = `${window.location.origin}/sql?${params}`
    void navigator.clipboard.writeText(shareUrl)
    setShareSuccess(true)
    setTimeout(() => setShareSuccess(false), 3000)
  }

  const handleQueryChange = (val: string) => {
    dryRunRequestIdRef.current += 1
    setValidationRequested(false)
    setEstimate(null)
    setDryRunError(null)
    setError(null)
    setEstimating(false)
    setValidateError(null)
    setQuery(val)
    if (!val.trim() || val === INITIAL_SQL_QUERY) {
      updateUrlParams({ sql: null, sqlStorageKey: null })
    }
  }

  const handleWebsiteChange = (website: Website | null) => {
    setSelectedWebsite(website)
    setWebsiteIdState(website?.id || '')
    setWebsiteIdsState(website ? [website.id] : [])
    handleQueryChange(query)
  }

  const handleWebsiteIdsChange = (ids: string[]) => {
    const uniqueIds = [...new Set(ids)]
    setWebsiteIdsState(uniqueIds)
    setWebsiteIdState(uniqueIds[0] ?? '')
    setSelectedWebsite(availableWebsites.find((website) => website.id === uniqueIds[0]) ?? null)
    handleQueryChange(query)
    updateUrlParams({
      websiteId: uniqueIds.length === 1 ? uniqueIds[0] : null,
      websiteIds: uniqueIds.length > 1 ? uniqueIds.join(',') : null,
    })
  }

  const handleUpgradeTables = () => {
    const newQuery = query
      .replace(/umami\.public_website_event/gi, 'umami_views.event')
      .replace(/umami\.public_session/gi, 'umami_views.session')
    setQuery(newQuery)
  }

  const handleAddDateFilter = () => {
    if (/\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/i.test(query)) return
    const code = getSqlCode(query)
    const followingClause = /\b(?:GROUP\s+BY|HAVING|QUALIFY|ORDER\s+BY|LIMIT)\b/i.exec(code)
    const insertionOffset =
      followingClause?.index ?? (code.trimEnd().endsWith(';') ? code.trimEnd().length - 1 : query.length)
    const before = query.slice(0, insertionOffset).trimEnd()
    const after = query.slice(insertionOffset)
    const websiteFilter = /\bWHERE\b/i.test(getSqlCode(before)) ? '' : "\nWHERE website_id = '{{website_id}}'"
    setQuery(`${before}${websiteFilter}\n[[AND {{created_at}}]]\n${after}`)
    setError(null)
    setDryRunError(null)
  }

  const handleAddGroupBy = () => {
    if (!groupByField) return
    const code = getSqlCode(query)
    const followingClause = /\b(?:HAVING|QUALIFY|WINDOW|ORDER\s+BY|LIMIT)\b/i.exec(code)
    const insertionOffset =
      followingClause?.index ?? (code.trimEnd().endsWith(';') ? code.trimEnd().length - 1 : query.length)
    const before = query.slice(0, insertionOffset).trimEnd()
    const after = query.slice(insertionOffset)
    const grouping = /\bGROUP\s+BY\b/i.exec(getSqlCode(before))
    const nextQuery = grouping
      ? `${before}, ${groupByField}\n${after}`
      : `${before}\nGROUP BY ${groupByField}\n${after}`
    handleQueryChange(nextQuery)
  }

  const handleAddWebsiteFilter = () => {
    setQuery((prev) => {
      const nextQuery = ensureWebsitePlaceholder(prev)
      return nextQuery === prev ? prev : `${nextQuery.trimEnd()}\n`
    })
  }

  const getExportQuery = useCallback(async () => {
    const context = getFilterContext()
    const template = applyWebsiteIdOnly(
      applySafetyLimit(query, safetyLimit),
      context.websiteIdState,
      context.websiteIds,
    )
    return applyAutomaticFilters(template, context, undefined, 'template')
  }, [query, safetyLimit, getFilterContext])

  const handleCopyMetabase = async () => {
    try {
      await navigator.clipboard.writeText(await getExportQuery())
      setCopiedMetabase(true)
      setTimeout(() => setCopiedMetabase(false), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunne ikke kopiere SQL til Metabase.')
    }
  }

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod)
    const range = getDateRangeFromPeriod(newPeriod)
    if (range) {
      setDateRange({ from: range.startDate, to: range.endDate })
    }
    updateUrlParams({
      dateRange: newPeriod,
      customStartDate: null,
      customEndDate: null,
    })
  }

  const handleStartDateChange = (date: Date | undefined) => {
    setDateRange((prev) => {
      const newState = { ...prev, from: date }
      setPeriod('custom')
      updateUrlParams({
        dateRange: 'custom',
        customStartDate: date ? date.toISOString() : null,
        customEndDate: newState.to ? newState.to.toISOString() : null,
      })
      return newState
    })
  }

  const handleEndDateChange = (date: Date | undefined) => {
    setDateRange((prev) => {
      const newState = { ...prev, to: date }
      setPeriod('custom')
      updateUrlParams({
        dateRange: 'custom',
        customStartDate: newState.from ? newState.from.toISOString() : null,
        customEndDate: date ? date.toISOString() : null,
      })
      return newState
    })
  }

  const getLineChartData = (includeAverage: boolean = false) => {
    if (!result?.data) return null
    return prepareLineChartData(result.data, includeAverage)
  }

  const getBarChartData = () => {
    if (!result?.data) return null
    return prepareBarChartData(result.data)
  }

  const getPieChartData = () => {
    if (!result?.data) return null
    return preparePieChartData(result.data)
  }

  return {
    query,
    result,
    estimate,
    dryRunError,
    loading,
    estimating,
    error,
    validateError,
    incompleteQueryMessage: validationRequested ? incompleteQueryMessage : null,
    shareSuccess,
    lastProcessedSql,
    copiedMetabase,
    hasAttemptedFetch,
    oldTableWarning,
    websiteId: effectiveWebsiteId,
    websiteIds: effectiveWebsiteIds,
    availableWebsites,
    period,
    dateRange,
    urlPath,
    selectedWebsite: effectiveSelectedWebsite,
    customVariables,
    customVariableValues,
    hasMetabaseDateFilter,
    hasUrlPathFilter,
    hasWebsiteIdPlaceholder,
    hasNettsidePlaceholder,
    hasHardcodedWebsiteId,
    safetyLimit,
    activeLimit,
    explicitLimit,
    isResultLimited,
    isSelectStarOnBigTable,
    isMissingPartitionFilter,
    isHighCost,
    groupByField,
    showConfirmModal,
    pendingQueryEstimate,

    setUrlPath,
    setCustomVariableValues,
    handleQueryChange,
    handleWebsiteChange,
    handleWebsiteIdsChange,
    handleUpgradeTables,
    handleAddDateFilter,
    handleAddGroupBy,
    handleAddWebsiteFilter,
    handleCopyMetabase,
    getExportQuery,
    handlePeriodChange,
    handleStartDateChange,
    handleEndDateChange,
    handleSafetyLimitChange,
    handleConfirmQuery,
    handleCancelQuery,
    executeQuery,
    validateSQL,
    getQueryPreview,
    formatSQL,
    shareQuery,

    prepareLineChartData: getLineChartData,
    prepareBarChartData: getBarChartData,
    preparePieChartData: getPieChartData,
  }
}
