import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActionMenu,
  Alert,
  BodyShort,
  Button,
  Checkbox,
  CheckboxGroup,
  HelpText,
  Loader,
  Pagination,
  Select,
  UNSAFE_Combobox,
} from '@navikt/ds-react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx'
import TransferToMetabaseDialog from '../../../shared/ui/TransferToMetabaseDialog.tsx'
import { openSqlEditorWithContext } from '../../../shared/lib/openSqlEditor.ts'
import { useCookieStartDate, useCookieSupport } from '../../../shared/hooks/useSiteimproveSupport.ts'
import {
  getCookieCountByParams,
  getDateRangeFromPeriod,
  getStoredPeriod,
  normalizeUrlToPath,
  savePeriodPreference,
} from '../../../shared/lib/utils.ts'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts'
import type { Website } from '../../../shared/types/chart.ts'
import { PeriodPicker } from '../../analysis/ui/PeriodPicker.tsx'
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import { fetchPageMetrics } from '../../traffic/api/trafficApi.ts'
import type { PageMetricRow } from '../../traffic/model/types.ts'
import { downloadCsvFile } from '../../traffic/utils/trafficUtils.ts'
import { fetchColumnValues } from '../../cohortmanager/api/columnValuesApi.ts'

type TableMetric = 'visitors' | 'visits' | 'pageviews' | 'proportion'
type EventMetric = 'visitors' | 'events' | 'share'
type SubmittedQuery = {
  websiteId: string
  startDate: Date
  endDate: Date
  urlPaths: string[]
  pathOperator: string
  eventNames: string[]
  countBy?: 'distinct_id'
  countBySwitchAt?: number
}

const metricOptions: { value: TableMetric; label: string }[] = [
  { value: 'visitors', label: 'Unike besøkende' },
  { value: 'visits', label: 'Besøk' },
  { value: 'pageviews', label: 'Sidevisninger' },
  { value: 'proportion', label: 'Andel av besøkene' },
]

const eventMetricOptions: { value: EventMetric; label: string }[] = [
  { value: 'events', label: 'Totalt antall' },
  { value: 'visitors', label: 'Unike besøkende' },
  { value: 'share', label: 'Andel av besøkene' },
]

const isTableMetric = (value: string): value is TableMetric => metricOptions.some((metric) => metric.value === value)

const getMetricsFromSearchParams = (searchParams: URLSearchParams): TableMetric[] => {
  const metrics = searchParams.getAll('metric').filter(isTableMetric)
  if (metrics.length) return metrics
  return searchParams.getAll('eventName').length ? [] : ['visitors']
}

const getEventNamesFromSearchParams = (searchParams: URLSearchParams) =>
  Array.from(
    new Set(
      searchParams
        .getAll('eventName')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  )

const isEventMetric = (value: string): value is EventMetric =>
  eventMetricOptions.some((metric) => metric.value === value)

const getEventMetricTypesFromSearchParams = (searchParams: URLSearchParams): Record<string, EventMetric> => {
  const eventNames = searchParams.getAll('eventName')
  const eventMetrics = searchParams.getAll('eventMetric')
  return Object.fromEntries(
    eventNames.map((eventName, index) => [
      eventName,
      isEventMetric(eventMetrics[index] ?? '') ? eventMetrics[index] : 'visitors',
    ]),
  )
}

const numberFormat = new Intl.NumberFormat('nb-NO')
const eventNameCollator = new Intl.Collator('nb')
const percentFormat = new Intl.NumberFormat('nb-NO', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const zeroPercentFormat = new Intl.NumberFormat('nb-NO', { style: 'percent', maximumFractionDigits: 4 })
const formatPercentage = (value: number) => (value === 0 ? zeroPercentFormat.format(0) : percentFormat.format(value))
const rowsPerPage = 10
const metricSqlExpressions: Record<TableMetric, string> = {
  visitors: 'p.visitors AS Unike_besokende',
  visits: 'p.visits AS Besok',
  pageviews: 'p.pageviews AS Sidevisninger',
  proportion: 'SAFE_DIVIDE(p.visitors, total.total_visitors) AS Andel_av_besokende',
}

const escapeSqlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const buildDataTableSql = (
  query: SubmittedQuery,
  selectedMetrics: TableMetric[],
  selectedEventNames: string[],
  eventMetricTypes: Record<string, EventMetric>,
) => {
  const projectId = getGcpProjectId()
  const startAt = query.startDate.toISOString()
  const endAt = query.endDate.toISOString()
  const needsDistinctId = query.countBy === 'distinct_id'
  const distinctUserId = "COALESCE(NULLIF(s.distinct_id, ''), CAST(e.session_id AS STRING))"
  const userIdExpression = needsDistinctId
    ? query.countBySwitchAt
      ? `IF(e.created_at >= TIMESTAMP('${new Date(query.countBySwitchAt).toISOString()}'), ${distinctUserId}, CAST(e.session_id AS STRING))`
      : distinctUserId
    : 'CAST(e.session_id AS STRING)'
  const sessionJoin = needsDistinctId
    ? `LEFT JOIN \`${projectId}.umami_views.session\` s
      ON e.session_id = s.session_id
      AND s.created_at BETWEEN TIMESTAMP('${startAt}') AND TIMESTAMP('${endAt}')`
    : ''
  const urlFilters = query.urlPaths.map((path) => {
    const escapedPath = escapeSqlString(path)
    if (query.pathOperator === 'starts-with') {
      return `LOWER(url_path) LIKE '${escapeSqlString(path.toLowerCase())}%'`
    }
    const escapedSlashPath = escapeSqlString(path.endsWith('/') ? path : `${path}/`)
    return `(url_path = '${escapedPath}' OR url_path = '${escapedSlashPath}' OR url_path LIKE '${escapedPath}?%')`
  })
  const urlFilter = urlFilters.length ? `AND (${urlFilters.join(' OR ')})` : ''
  const getExactEventNameMatch = (name: string) =>
    `TO_HEX(CAST(event_name AS BYTES)) = TO_HEX(CAST('${escapeSqlString(name)}' AS BYTES))`
  const eventNamesSql = selectedEventNames.map(getExactEventNameMatch).join(' OR ')
  const eventStatsCte = selectedEventNames.length
    ? `,
event_stats AS (
  SELECT
    CASE
      WHEN RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(url_path, r'[?#].*', ''), r'//+', '/'), '/') = '' THEN '/'
      ELSE RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(url_path, r'[?#].*', ''), r'//+', '/'), '/')
    END AS url_path,
    ${selectedEventNames
      .flatMap((eventName, index) => {
        const eventNameMatch = getExactEventNameMatch(eventName)
        return [
          `APPROX_COUNT_DISTINCT(IF(${eventNameMatch}, user_id, NULL)) AS event_visitors_${index}`,
          `COUNTIF(${eventNameMatch}) AS event_count_${index}`,
        ]
      })
      .join(',\n    ')}
  FROM filtered_events
  WHERE event_type = 2
    AND (${eventNamesSql})
    ${urlFilter}
  GROUP BY 1
)`
    : ''
  const eventColumns = selectedEventNames.map((eventName, index) => {
    const value = eventMetricTypes[eventName] ?? 'visitors'
    if (value === 'events') return `COALESCE(event_stats.event_count_${index}, 0) AS event_${index + 1}_uses`
    if (value === 'share') {
      return `SAFE_DIVIDE(COALESCE(event_stats.event_visitors_${index}, 0), p.visitors) AS event_${index + 1}_share`
    }
    return `COALESCE(event_stats.event_visitors_${index}, 0) AS event_${index + 1}_unique_visitors`
  })
  const selectedColumns = [...selectedMetrics.map((metric) => metricSqlExpressions[metric]), ...eventColumns]
  const selectedColumnsSql = selectedColumns.length ? `,\n  ${selectedColumns.join(',\n  ')}` : ''
  const eventStatsJoin = selectedEventNames.length ? 'LEFT JOIN event_stats USING (url_path)' : ''

  return `WITH filtered_events AS (
  SELECT
    e.url_path,
    e.visit_id,
    e.event_type,
    e.event_name,
    ${userIdExpression} AS user_id
  FROM \`${projectId}.umami_views.event\` e
  ${sessionJoin}
  WHERE e.website_id = '{{website_id}}'
    AND e.created_at BETWEEN TIMESTAMP('${startAt}') AND TIMESTAMP('${endAt}')
),
total_stats AS (
  SELECT APPROX_COUNT_DISTINCT(user_id) AS total_visitors
  FROM filtered_events
  WHERE event_type = 1
),
page_stats AS (
  SELECT
    CASE
      WHEN RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(url_path, r'[?#].*', ''), r'//+', '/'), '/') = '' THEN '/'
      ELSE RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(url_path, r'[?#].*', ''), r'//+', '/'), '/')
    END AS url_path,
    APPROX_COUNT_DISTINCT(user_id) AS visitors,
    APPROX_COUNT_DISTINCT(visit_id) AS visits,
    COUNT(*) AS pageviews
  FROM filtered_events
  WHERE event_type = 1
    ${urlFilter}
  GROUP BY 1
)
${eventStatsCte}
SELECT
  p.url_path AS URL_sti${selectedColumnsSql}
FROM page_stats p
CROSS JOIN total_stats total
${eventStatsJoin}
ORDER BY p.visitors DESC`
}

const escapeCsvField = (value: string) => `"${value.replace(/"/g, '""')}"`

const parseDateParam = (value: string | null) => {
  if (!value) return undefined
  const date = parseISO(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const DataTableAnalysis = () => {
  const [searchParams] = useSearchParams()
  const shouldAutoLoadFromUrl = useRef(
    searchParams.has('websiteId') &&
      searchParams.has('period') &&
      (searchParams.getAll('metric').some(isTableMetric) || searchParams.getAll('eventName').length > 0) &&
      (searchParams.get('period') !== 'custom' || (searchParams.has('from') && searchParams.has('to'))),
  )
  const hasAutoLoadedFromUrl = useRef(false)
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [urlPaths, setUrlPaths] = useState(() => searchParams.getAll('urlPath'))
  const [pathOperator, setPathOperator] = useState(() => searchParams.get('pathOperator') || 'equals')
  const [period, setPeriodState] = useState(() => getStoredPeriod(searchParams.get('period')))
  const [customStartDate, setCustomStartDate] = useState(() => parseDateParam(searchParams.get('from')))
  const [customEndDate, setCustomEndDate] = useState(() => parseDateParam(searchParams.get('to')))
  const [selectedMetrics, setSelectedMetrics] = useState<TableMetric[]>(() => getMetricsFromSearchParams(searchParams))
  const [selectedEventNames, setSelectedEventNames] = useState(() => getEventNamesFromSearchParams(searchParams))
  const [eventMetricTypes, setEventMetricTypes] = useState(() => getEventMetricTypesFromSearchParams(searchParams))
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [eventNameDraft, setEventNameDraft] = useState('')
  const [eventSearchText, setEventSearchText] = useState('')
  const [eventMetricDraft, setEventMetricDraft] = useState<EventMetric>('visitors')
  const [eventSuggestions, setEventSuggestions] = useState<string[]>([])
  const [eventSuggestionsDays, setEventSuggestionsDays] = useState<number | null>(null)
  const [eventSuggestionsLoading, setEventSuggestionsLoading] = useState(false)
  const [eventSuggestionsFailed, setEventSuggestionsFailed] = useState(false)
  const [rows, setRows] = useState<PageMetricRow[]>([])
  const [submittedQuery, setSubmittedQuery] = useState<SubmittedQuery | null>(null)
  const [page, setPage] = useState(1)
  const [sortColumn, setSortColumn] = useState('visitors')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [showMetabaseDialog, setShowMetabaseDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usesCookies = useCookieSupport(selectedWebsite?.domain, selectedWebsite?.id)
  const cookieStartDate = useCookieStartDate(selectedWebsite?.domain, selectedWebsite?.id)

  useEffect(() => {
    if (!showEventPicker || !selectedWebsite?.id) return
    let cancelled = false
    setEventSuggestionsLoading(true)
    setEventSuggestionsFailed(false)

    fetchColumnValues(selectedWebsite.id, 'event_name')
      .then(({ values, scannedDays }) => {
        if (cancelled) return
        setEventSuggestions(values)
        setEventSuggestionsDays(scannedDays)
      })
      .catch(() => {
        if (cancelled) return
        setEventSuggestions([])
        setEventSuggestionsFailed(true)
      })
      .finally(() => {
        if (!cancelled) setEventSuggestionsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [showEventPicker, selectedWebsite?.id])

  const setPeriod = (value: string) => {
    setPeriodState(value)
    savePeriodPreference(value)
  }

  const fetchTable = useCallback(async () => {
    if (!selectedWebsite || (selectedMetrics.length === 0 && selectedEventNames.length === 0)) return

    const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
    if (!dateRange) {
      setError('Velg en gyldig periode.')
      return
    }

    const countBy = getCookieCountByParams(usesCookies, cookieStartDate, dateRange.startDate, dateRange.endDate)
    const normalizedPaths = urlPaths.map(normalizeUrlToPath).filter(Boolean)
    const submittedQuery: SubmittedQuery = {
      websiteId: selectedWebsite.id,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      urlPaths: normalizedPaths,
      pathOperator,
      eventNames: selectedEventNames,
      ...countBy,
    }
    setSubmittedQuery(submittedQuery)
    setRows([])
    setPage(1)
    setError(null)
    setLoading(true)
    setHasFetched(true)

    try {
      const result = await fetchPageMetrics(
        submittedQuery.websiteId,
        dateRange.startDate,
        dateRange.endDate,
        normalizedPaths,
        pathOperator,
        'visitors',
        {
          countByParams: countBy.countBy ? `&countBy=${countBy.countBy}` : '',
          countBySwitchAtParam: countBy.countBySwitchAt ? `&countBySwitchAt=${countBy.countBySwitchAt}` : '',
        },
        { unlimited: true, eventNames: selectedEventNames },
      )
      setRows(result.data ?? [])

      const params = new URLSearchParams(window.location.search)
      params.set('websiteId', submittedQuery.websiteId)
      params.set('period', period)
      params.delete('urlPath')
      urlPaths.forEach((path) => params.append('urlPath', path))
      if (urlPaths.length) params.set('pathOperator', pathOperator)
      else params.delete('pathOperator')
      params.delete('metric')
      selectedMetrics.forEach((metric) => params.append('metric', metric))
      params.delete('eventName')
      params.delete('eventMetric')
      selectedEventNames.forEach((name) => {
        params.append('eventName', name)
        params.append('eventMetric', eventMetricTypes[name] ?? 'visitors')
      })

      if (period === 'custom' && customStartDate && customEndDate) {
        params.set('from', format(customStartDate, 'yyyy-MM-dd'))
        params.set('to', format(customEndDate, 'yyyy-MM-dd'))
      } else {
        params.delete('from')
        params.delete('to')
      }

      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Kunne ikke hente sidemetrikker.')
    } finally {
      setLoading(false)
    }
  }, [
    selectedWebsite,
    selectedMetrics,
    period,
    customStartDate,
    customEndDate,
    usesCookies,
    cookieStartDate,
    urlPaths,
    pathOperator,
    selectedEventNames,
    eventMetricTypes,
  ])

  useEffect(() => {
    if (!shouldAutoLoadFromUrl.current || hasAutoLoadedFromUrl.current || !selectedWebsite) return
    hasAutoLoadedFromUrl.current = true
    void fetchTable()
  }, [fetchTable, selectedWebsite])

  const formatMetric = (row: PageMetricRow, metric: TableMetric) => {
    const value = row[metric]
    if (!Number.isFinite(value)) return '–'
    if (metric === 'proportion') return formatPercentage(value)
    return numberFormat.format(value)
  }

  const getEventVisitors = (row: PageMetricRow, eventName: string) =>
    row.customEvents?.find((event) => event.eventName === eventName)?.visitors ?? 0
  const getEventCount = (row: PageMetricRow, eventName: string) =>
    row.customEvents?.find((event) => event.eventName === eventName)?.eventCount ?? 0
  const getEventMetricValue = (row: PageMetricRow, eventName: string) => {
    const metric = eventMetricTypes[eventName] ?? 'visitors'
    if (metric === 'events') return getEventCount(row, eventName)
    const eventVisitors = getEventVisitors(row, eventName)
    if (metric === 'share') return row.visitors ? eventVisitors / row.visitors : 0
    return eventVisitors
  }
  const getEventMetricLabel = (eventName: string) => {
    switch (eventMetricTypes[eventName] ?? 'visitors') {
      case 'events':
        return `Totalt antall: ${eventName}`
      case 'share':
        return `Andel av besøkene: ${eventName}`
      default:
        return `Unike besøkende: ${eventName}`
    }
  }
  const formatEventMetric = (row: PageMetricRow, eventName: string) => {
    const metric = eventMetricTypes[eventName] ?? 'visitors'
    const value = getEventMetricValue(row, eventName)
    return metric === 'share' ? formatPercentage(value) : numberFormat.format(value)
  }

  const getSortValue = (row: PageMetricRow, column: string): string | number => {
    if (column === 'urlPath') return row.urlPath
    if (isTableMetric(column)) return row[column]
    if (column.startsWith('event:')) return getEventMetricValue(row, column.slice('event:'.length))
    return 0
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection(column === 'urlPath' ? 'asc' : 'desc')
  }

  const sortIndicator = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown size={14} aria-hidden />
    return sortDirection === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />
  }

  const sortedRows = [...rows].sort((left, right) => {
    const leftValue = getSortValue(left, sortColumn)
    const rightValue = getSortValue(right, sortColumn)
    const comparison =
      typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'nb-NO')
    return sortDirection === 'asc' ? comparison : -comparison
  })
  const visibleRows = sortedRows.slice((page - 1) * rowsPerPage, page * rowsPerPage)
  const pageCount = Math.ceil(rows.length / rowsPerPage)
  const visibleEventNames = selectedEventNames.filter((name) => submittedQuery?.eventNames.includes(name))
  const sqlText = submittedQuery
    ? buildDataTableSql(submittedQuery, selectedMetrics, visibleEventNames, eventMetricTypes)
    : ''
  const handleDownloadCsv = () => {
    const columns = metricOptions.filter((metric) => selectedMetrics.includes(metric.value))
    const csvRows = [
      ['URL', ...columns.map((metric) => metric.label), ...visibleEventNames.map(getEventMetricLabel)]
        .map(escapeCsvField)
        .join(','),
      ...sortedRows.map((row) =>
        [
          row.urlPath,
          ...columns.map((metric) => formatMetric(row, metric.value)),
          ...visibleEventNames.map((eventName) => formatEventMetric(row, eventName)),
        ]
          .map(escapeCsvField)
          .join(','),
      ),
    ]

    downloadCsvFile(csvRows.join('\n'), `datatabell_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const eventNameToAdd = eventNameDraft.trim()

  return (
    <>
      <PageHeader title="Datatabell" description="Sammenlign trafikk for URL-er med metrikker du velger." beta />
      <AppBlock className="pb-16">
        <form
          className="border-b border-[var(--ax-border-neutral-subtle)] pb-6"
          onSubmit={(event) => {
            event.preventDefault()
            void fetchTable()
          }}
        >
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(220px,1fr)_minmax(260px,1.3fr)_minmax(200px,0.8fr)]">
            <WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />
            <UrlPathFilter
              urlPaths={urlPaths}
              onUrlPathsChange={setUrlPaths}
              pathOperator={pathOperator}
              onPathOperatorChange={setPathOperator}
              selectedWebsiteDomain={selectedWebsite?.domain}
              className="w-full"
            />
            <PeriodPicker
              period={period}
              onPeriodChange={setPeriod}
              startDate={customStartDate}
              onStartDateChange={setCustomStartDate}
              endDate={customEndDate}
              onEndDateChange={setCustomEndDate}
            />
          </div>

          <div className="mt-6">
            <CheckboxGroup
              legend="Metrikker"
              value={selectedMetrics}
              onChange={(value) => setSelectedMetrics(value as TableMetric[])}
            >
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {metricOptions.map((metric) => (
                  <Checkbox key={metric.value} value={metric.value} size="small">
                    {metric.label}
                  </Checkbox>
                ))}
              </div>
            </CheckboxGroup>
            {selectedEventNames.length > 0 && (
              <fieldset className="mt-4">
                <legend className="mb-2 text-sm font-semibold">Hendelser</legend>
                <div className="flex flex-col gap-3">
                  {selectedEventNames.map((eventName) => (
                    <div key={eventName} className="flex flex-wrap items-end gap-3">
                      <Checkbox
                        size="small"
                        checked
                        onChange={(event) => {
                          if (event.target.checked) return
                          setSelectedEventNames((current) => current.filter((name) => name !== eventName))
                          setEventMetricTypes((current) => {
                            const next = { ...current }
                            delete next[eventName]
                            return next
                          })
                        }}
                      >
                        {eventName}
                      </Checkbox>
                      <Select
                        label={`Måltall for ${eventName}`}
                        hideLabel
                        size="small"
                        value={eventMetricTypes[eventName] ?? 'visitors'}
                        onChange={(event) =>
                          setEventMetricTypes((current) => ({
                            ...current,
                            [eventName]: event.target.value as EventMetric,
                          }))
                        }
                      >
                        {eventMetricOptions.map((metric) => (
                          <option key={metric.value} value={metric.value}>
                            {metric.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="mt-4">
              <Button
                type="button"
                size="small"
                variant="tertiary"
                icon={<Plus aria-hidden />}
                disabled={!selectedWebsite}
                onClick={() => {
                  setShowEventPicker((current) => !current)
                  setEventNameDraft('')
                  setEventSearchText('')
                  setEventMetricDraft('visitors')
                }}
              >
                {showEventPicker ? 'Skjul hendelsesvalg' : 'Legg til hendelse'}
              </Button>
            </div>
            {showEventPicker && selectedWebsite && (
              <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-end">
                <div className="w-full min-w-0 sm:w-[min(32rem,45vw)]">
                  <UNSAFE_Combobox
                    label="Hendelse"
                    size="small"
                    placeholder="Søk etter hendelse"
                    options={[...eventSuggestions]
                      .sort((left, right) => eventNameCollator.compare(left, right))
                      .map((eventName) => ({ label: eventName, value: eventName }))}
                    selectedOptions={eventNameDraft ? [eventNameDraft] : []}
                    value={eventSearchText}
                    onChange={(value) => {
                      setEventSearchText(value)
                      if (value.trim() && value.trim() !== eventNameDraft) setEventNameDraft('')
                    }}
                    onToggleSelected={(eventName, selected) => {
                      setEventNameDraft(selected ? eventName : '')
                      setEventSearchText(selected ? eventName : '')
                    }}
                    isLoading={eventSuggestionsLoading}
                  />
                  {eventSuggestionsDays !== null && eventSuggestionsDays < 30 && (
                    <BodyShort size="small" className="mt-1 text-[var(--ax-text-subtle)]">
                      Forslag fra siste {eventSuggestionsDays} dager
                    </BodyShort>
                  )}
                  {eventSuggestionsFailed && (
                    <BodyShort size="small" className="mt-1 text-[var(--ax-text-subtle)]">
                      Kunne ikke hente hendelser. Prøv igjen senere.
                    </BodyShort>
                  )}
                </div>
                <Select
                  label="Måltall"
                  hideLabel
                  size="small"
                  className="w-full sm:w-56"
                  value={eventMetricDraft}
                  onChange={(event) => setEventMetricDraft(event.target.value as EventMetric)}
                >
                  {eventMetricOptions.map((metric) => (
                    <option key={metric.value} value={metric.value}>
                      {metric.label}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="small"
                  className="w-fit"
                  disabled={!eventNameToAdd || selectedEventNames.includes(eventNameToAdd)}
                  onClick={() => {
                    const eventName = eventNameToAdd
                    if (!eventName) return
                    setSelectedEventNames((current) =>
                      current.includes(eventName) ? current : [...current, eventName],
                    )
                    setEventMetricTypes((current) => ({ ...current, [eventName]: eventMetricDraft }))
                    setEventNameDraft('')
                    setEventSearchText('')
                    setEventMetricDraft('visitors')
                    setShowEventPicker(false)
                  }}
                >
                  Legg til metrikk
                </Button>
              </div>
            )}
            <div className="mt-4 flex justify-start">
              <Button
                type="submit"
                size="small"
                loading={loading}
                disabled={!selectedWebsite || (!selectedMetrics.length && !selectedEventNames.length)}
              >
                Vis tabell
              </Button>
            </div>
          </div>
        </form>

        {error && (
          <Alert variant="error" className="mt-6">
            {error}
          </Alert>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader size="xlarge" title="Henter sidemetrikker..." />
          </div>
        )}

        {!loading && hasFetched && !error && rows.length === 0 && (
          <p className="py-8 text-center text-[var(--ax-text-neutral-subtle)]">Ingen sider samsvarer med filtrene.</p>
        )}

        {!loading && rows.length > 0 && (
          <div className="mt-6">
            <TableSectionHeader
              title={`Resultater (${rows.length})`}
              actions={
                <ActionMenu>
                  <ActionMenu.Trigger>
                    <Button type="button" variant="secondary" size="small" icon={<Download aria-hidden />}>
                      Eksporter
                    </Button>
                  </ActionMenu.Trigger>
                  <ActionMenu.Content align="end">
                    <ActionMenu.Item onClick={handleDownloadCsv}>Last ned CSV</ActionMenu.Item>
                    <ActionMenu.Item
                      onClick={() => openSqlEditorWithContext({ sql: sqlText, websiteId: submittedQuery?.websiteId })}
                    >
                      Åpne i SQL-editor
                    </ActionMenu.Item>
                    <ActionMenu.Item onClick={() => setShowMetabaseDialog(true)}>Overfør til Metabase</ActionMenu.Item>
                  </ActionMenu.Content>
                </ActionMenu>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--ax-border-neutral-subtle)]">
                    <th
                      scope="col"
                      aria-sort={
                        sortColumn === 'urlPath' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                      className="px-3 py-3 text-left font-semibold"
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-[var(--ax-text-accent)]"
                        style={{ font: 'inherit' }}
                        onClick={() => handleSort('urlPath')}
                      >
                        URL {sortIndicator('urlPath')}
                      </button>
                    </th>
                    {metricOptions
                      .filter((metric) => selectedMetrics.includes(metric.value))
                      .map((metric) => (
                        <th
                          key={metric.value}
                          scope="col"
                          aria-sort={
                            sortColumn === metric.value
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          className="whitespace-nowrap px-3 py-3 text-right font-semibold"
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-[var(--ax-text-accent)]"
                              style={{ font: 'inherit' }}
                              onClick={() => handleSort(metric.value)}
                            >
                              {metric.label} {sortIndicator(metric.value)}
                            </button>
                            {metric.value === 'proportion' && (
                              <HelpText title="Andel av besøkene" strategy="fixed">
                                <span className="block w-72 max-w-[calc(100vw-2rem)] whitespace-normal break-words">
                                  Andel viser URL-ens unike besøkende som andel av alle unike besøkende på nettstedet i
                                  perioden. En person kan besøke flere URL-er, så andelene summerer ikke nødvendigvis
                                  til 100 %.
                                </span>
                              </HelpText>
                            )}
                          </div>
                        </th>
                      ))}
                    {visibleEventNames.map((eventName) => {
                      const eventMetric = eventMetricTypes[eventName] ?? 'visitors'
                      return (
                        <th
                          key={`event-${eventName}`}
                          scope="col"
                          aria-sort={
                            sortColumn === `event:${eventName}`
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          className="max-w-[16rem] whitespace-normal px-3 py-3 text-right font-semibold"
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-[var(--ax-text-accent)]"
                              style={{ font: 'inherit' }}
                              onClick={() => handleSort(`event:${eventName}`)}
                            >
                              {getEventMetricLabel(eventName)}
                              {sortIndicator(`event:${eventName}`)}
                            </button>
                            {eventMetric === 'share' && (
                              <HelpText title={`Andel av besøkene for ${eventName}`} strategy="fixed">
                                <span className="block w-72 max-w-[calc(100vw-2rem)] whitespace-normal break-words">
                                  Andel av URL-ens unike besøkende som utløste hendelsen i perioden.
                                </span>
                              </HelpText>
                            )}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.urlPath} className="border-b border-[var(--ax-border-neutral-subtle)]">
                      <th scope="row" className="max-w-[560px] break-all px-3 py-3 font-normal">
                        {row.urlPath}
                      </th>
                      {metricOptions
                        .filter((metric) => selectedMetrics.includes(metric.value))
                        .map((metric) => (
                          <td key={metric.value} className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                            {formatMetric(row, metric.value)}
                          </td>
                        ))}
                      {visibleEventNames.map((eventName) => (
                        <td key={`event-${eventName}`} className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                          {formatEventMetric(row, eventName)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {pageCount > 1 && (
                <div className="mt-4 flex justify-end">
                  <Pagination page={page} onPageChange={setPage} count={pageCount} size="small" />
                </div>
              )}
            </div>
          </div>
        )}
      </AppBlock>
      <TransferToMetabaseDialog
        open={showMetabaseDialog}
        onClose={() => setShowMetabaseDialog(false)}
        sqlText={sqlText}
        sourceWebsiteId={submittedQuery?.websiteId}
      />
    </>
  )
}

export default DataTableAnalysis
