import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionMenu, Alert, Button, Checkbox, CheckboxGroup, HelpText, Loader, Pagination } from '@navikt/ds-react'
import { Download } from 'lucide-react'
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

type TableMetric = 'visitors' | 'visits' | 'pageviews' | 'proportion'
type SubmittedQuery = {
  websiteId: string
  startDate: Date
  endDate: Date
  urlPaths: string[]
  pathOperator: string
  countBy?: 'distinct_id'
  countBySwitchAt?: number
}

const metricOptions: { value: TableMetric; label: string }[] = [
  { value: 'visitors', label: 'Unike besøkende' },
  { value: 'visits', label: 'Besøk' },
  { value: 'pageviews', label: 'Sidevisninger' },
  { value: 'proportion', label: 'Andel av besøkende' },
]

const isTableMetric = (value: string): value is TableMetric => metricOptions.some((metric) => metric.value === value)

const getMetricsFromSearchParams = (searchParams: URLSearchParams): TableMetric[] => {
  const metrics = searchParams.getAll('metric').filter(isTableMetric)
  return metrics.length ? metrics : ['visitors']
}

const numberFormat = new Intl.NumberFormat('nb-NO')
const percentFormat = new Intl.NumberFormat('nb-NO', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const rowsPerPage = 10
const metricSqlExpressions: Record<TableMetric, string> = {
  visitors: 'p.visitors AS Unike_besokende',
  visits: 'p.visits AS Besok',
  pageviews: 'p.pageviews AS Sidevisninger',
  proportion: 'SAFE_DIVIDE(p.visitors, total.total_visitors) AS Andel_av_besokende',
}

const escapeSqlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const buildDataTableSql = (query: SubmittedQuery, selectedMetrics: TableMetric[]) => {
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
  const urlFilter = urlFilters.length ? `WHERE ${urlFilters.join(' OR ')}` : ''
  const selectedColumns = selectedMetrics.length
    ? `,\n  ${selectedMetrics.map((metric) => metricSqlExpressions[metric]).join(',\n  ')}`
    : ''

  return `WITH filtered_events AS (
  SELECT
    e.url_path,
    e.visit_id,
    ${userIdExpression} AS user_id
  FROM \`${projectId}.umami_views.event\` e
  ${sessionJoin}
  WHERE e.website_id = '{{website_id}}'
    AND e.event_type = 1
    AND e.created_at BETWEEN TIMESTAMP('${startAt}') AND TIMESTAMP('${endAt}')
),
total_stats AS (
  SELECT APPROX_COUNT_DISTINCT(user_id) AS total_visitors
  FROM filtered_events
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
  ${urlFilter}
  GROUP BY 1
)
SELECT
  p.url_path AS URL_sti${selectedColumns}
FROM page_stats p
CROSS JOIN total_stats total
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
      searchParams.getAll('metric').some(isTableMetric) &&
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
  const [rows, setRows] = useState<PageMetricRow[]>([])
  const [submittedQuery, setSubmittedQuery] = useState<SubmittedQuery | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [showMetabaseDialog, setShowMetabaseDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usesCookies = useCookieSupport(selectedWebsite?.domain, selectedWebsite?.id)
  const cookieStartDate = useCookieStartDate(selectedWebsite?.domain, selectedWebsite?.id)

  const setPeriod = (value: string) => {
    setPeriodState(value)
    savePeriodPreference(value)
  }

  const fetchTable = useCallback(async () => {
    if (!selectedWebsite || selectedMetrics.length === 0) return

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
        { unlimited: true },
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
  ])

  useEffect(() => {
    if (!shouldAutoLoadFromUrl.current || hasAutoLoadedFromUrl.current || !selectedWebsite) return
    hasAutoLoadedFromUrl.current = true
    void fetchTable()
  }, [fetchTable, selectedWebsite])

  const formatMetric = (row: PageMetricRow, metric: TableMetric) => {
    const value = row[metric]
    if (!Number.isFinite(value)) return '–'
    if (metric === 'proportion') return percentFormat.format(value)
    return numberFormat.format(value)
  }

  const visibleRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage)
  const pageCount = Math.ceil(rows.length / rowsPerPage)
  const sqlText = submittedQuery ? buildDataTableSql(submittedQuery, selectedMetrics) : ''
  const handleDownloadCsv = () => {
    const columns = metricOptions.filter((metric) => selectedMetrics.includes(metric.value))
    const csvRows = [
      ['URL', ...columns.map((metric) => metric.label)].map(escapeCsvField).join(','),
      ...rows.map((row) =>
        [row.urlPath, ...columns.map((metric) => formatMetric(row, metric.value))].map(escapeCsvField).join(','),
      ),
    ]

    downloadCsvFile(csvRows.join('\n'), `datatabell_${new Date().toISOString().slice(0, 10)}.csv`)
  }

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
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(220px,1fr)_minmax(260px,1.3fr)_minmax(200px,0.8fr)_auto]">
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
            <Button type="submit" size="small" loading={loading} disabled={!selectedWebsite || !selectedMetrics.length}>
              Vis tabell
            </Button>
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
                    <th scope="col" className="px-3 py-3 font-semibold">
                      URL
                    </th>
                    {metricOptions
                      .filter((metric) => selectedMetrics.includes(metric.value))
                      .map((metric) => (
                        <th
                          key={metric.value}
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-right font-semibold"
                        >
                          {metric.value === 'proportion' ? (
                            <span className="inline-flex items-center justify-end gap-1">
                              {metric.label}
                              <HelpText title="Andel av besøkende" strategy="fixed">
                                <span className="block w-72 max-w-[calc(100vw-2rem)] whitespace-normal break-words">
                                  Andel viser URL-ens unike besøkende som andel av alle unike besøkende på nettstedet i
                                  perioden. En person kan besøke flere URL-er, så andelene summerer ikke nødvendigvis
                                  til 100 %.
                                </span>
                              </HelpText>
                            </span>
                          ) : (
                            metric.label
                          )}
                        </th>
                      ))}
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
