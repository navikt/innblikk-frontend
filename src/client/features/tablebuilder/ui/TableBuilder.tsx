import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionMenu,
  Alert,
  BodyShort,
  Button,
  Dialog,
  Heading,
  Label,
  Loader,
  Pagination,
  Select,
  Skeleton,
  Table,
  TextField,
} from '@navikt/ds-react'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Plus, Search, Trash2 } from 'lucide-react'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx'
import TransferToMetabaseDialog from '../../../shared/ui/TransferToMetabaseDialog.tsx'
import { openSqlEditorWithContext } from '../../../shared/lib/openSqlEditor.ts'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts'
import {
  getDateRangeFromPeriod,
  getStoredPeriod,
  normalizeUrlToPath,
  savePeriodPreference,
} from '../../../shared/lib/utils.ts'
import type { Website } from '../../../shared/types/chart.ts'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx'
import { SuggestingValueEditor } from '../../cohortmanager/ui/SuggestingValueEditor.tsx'
import { downloadCsvFile } from '../../traffic/utils/trafficUtils.ts'
import type { JsonValue, Row } from '../../sql/model/types.ts'
import { getUniqueColumnAliases, quoteBigQueryIdentifier } from '../utils/columnAliases.ts'
import type { Sidegroup } from '../../sidegroups/model/types.ts'
import { buildSidegroupSqlCondition } from '../../../shared/lib/sidegroupSql.ts'

type ColumnKind = 'dimension' | 'metric'
type ColumnView = 'rows' | 'events' | 'visitors' | 'share' | 'visitor-share'
type DimensionOperator = 'all' | 'equals' | 'not-equals' | 'contains' | 'not-contains'

type ColumnDefinition = {
  id: string
  label: string
  description: string
  kind: ColumnKind
  expression: string
  needsSession?: boolean
}

type SelectedColumn = ColumnDefinition & {
  instanceId: string
  customLabel: string
  view?: ColumnView
  filterOperator?: DimensionOperator
  filterValue?: string
}

const COLUMN_GROUPS: Array<{ title: string; columns: ColumnDefinition[] }> = [
  {
    title: 'Side og trafikkilde',
    columns: [
      {
        id: 'url_path',
        label: 'URL-sti',
        description: 'Siden hendelsen skjedde på',
        kind: 'dimension',
        expression: 'e.url_path',
      },
      {
        id: 'referrer_domain',
        label: 'Referrer-domene',
        description: 'Domenet brukeren kom fra',
        kind: 'dimension',
        expression: 'e.referrer_domain',
      },
    ],
  },
  {
    title: 'Hendelser',
    columns: [
      {
        id: 'selected_event',
        label: 'Bestemt hendelse',
        description: 'Måltall for én bestemt hendelse',
        kind: 'metric',
        expression: 'e.event_name',
      },
      {
        id: 'event_name',
        label: 'Hendelsesnavn',
        description: 'Én rad per hendelsesnavn',
        kind: 'dimension',
        expression: 'e.event_name',
      },
    ],
  },
  {
    title: 'Måltall',
    columns: [
      {
        id: 'visitors',
        label: 'Antall unike besøkende',
        description: 'Unike personer i hver rad',
        kind: 'metric',
        expression: "APPROX_COUNT_DISTINCT(COALESCE(NULLIF(e.session_distinct_id, ''), CAST(e.session_id AS STRING)))",
        needsSession: true,
      },
      {
        id: 'visits',
        label: 'Totalt antall besøk',
        description: 'Unike besøk i hver rad',
        kind: 'metric',
        expression: 'APPROX_COUNT_DISTINCT(e.visit_id)',
      },
      {
        id: 'pageviews',
        label: 'Sidevisninger',
        description: 'Antall sidevisninger i hver rad',
        kind: 'metric',
        expression: 'COUNTIF(e.event_type = 1)',
      },
      {
        id: 'events',
        label: 'Totalt antall hendelser',
        description: 'Alle egendefinerte hendelser i hver rad',
        kind: 'metric',
        expression: 'COUNTIF(e.event_type = 2)',
      },
    ],
  },
  {
    title: 'Bruker og enhet',
    columns: [
      {
        id: 'browser',
        label: 'Nettleser',
        description: 'Nettleseren som ble brukt',
        kind: 'dimension',
        expression: 'e.session_browser',
        needsSession: true,
      },
      {
        id: 'os',
        label: 'Operativsystem',
        description: 'Operativsystemet som ble brukt',
        kind: 'dimension',
        expression: 'e.session_os',
        needsSession: true,
      },
      {
        id: 'device',
        label: 'Enhetstype',
        description: 'Mobil, nettbrett eller datamaskin',
        kind: 'dimension',
        expression: 'e.session_device',
        needsSession: true,
      },
      {
        id: 'screen',
        label: 'Skjermstørrelse',
        description: 'Skjermoppløsningen som ble registrert',
        kind: 'dimension',
        expression: 'e.session_screen',
        needsSession: true,
      },
      {
        id: 'language',
        label: 'Språk',
        description: 'Språket som var valgt i nettleseren',
        kind: 'dimension',
        expression: 'e.session_language',
        needsSession: true,
      },
      {
        id: 'country',
        label: 'Land',
        description: 'Land registrert for besøket',
        kind: 'dimension',
        expression: 'e.session_country',
        needsSession: true,
      },
    ],
  },
  {
    title: 'Tid',
    columns: [
      {
        id: 'date',
        label: 'Dato',
        description: 'Én rad per dato',
        kind: 'dimension',
        expression: "FORMAT_TIMESTAMP('%Y-%m-%d', e.created_at)",
      },
      {
        id: 'week',
        label: 'Uke',
        description: 'Én rad per ISO-uke',
        kind: 'dimension',
        expression: "FORMAT_TIMESTAMP('%G-%V', e.created_at)",
      },
      {
        id: 'month',
        label: 'Måned',
        description: 'Én rad per måned',
        kind: 'dimension',
        expression: "FORMAT_TIMESTAMP('%Y-%m', e.created_at)",
      },
    ],
  },
]

const numberFormatter = new Intl.NumberFormat('nb-NO')
const percentFormatter = new Intl.NumberFormat('nb-NO', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})
const rowsPerPage = 25
const skeletonBodyRowCount = 6
const columnViewOptions = (column: SelectedColumn): Array<{ value: ColumnView; label: string }> => {
  const rowOption = {
    value: 'rows' as const,
    label: column.id === 'event_name' ? 'Hendelsesnavn' : `Én rad per ${column.label.toLocaleLowerCase('nb')}`,
  }
  const eventOption = {
    value: 'events' as const,
    label: column.id === 'selected_event' ? 'Totalt antall hendelser' : 'Totalt antall besøk',
  }
  const remainingOptions: Array<{ value: ColumnView; label: string }> = [
    { value: 'visitors', label: 'Antall unike besøkende' },
    { value: 'visitor-share', label: 'Andel av unike besøkende' },
    { value: 'share', label: 'Andel av besøk' },
  ]
  if (column.id === 'selected_event') return [eventOption, ...remainingOptions]
  return [rowOption, eventOption, ...remainingOptions]
}
const dimensionOperatorOptions: Array<{ value: DimensionOperator; label: string }> = [
  { value: 'all', label: 'Alle verdier' },
  { value: 'equals', label: 'er lik' },
  { value: 'not-equals', label: 'er ikke lik' },
  { value: 'contains', label: 'inneholder' },
  { value: 'not-contains', label: 'inneholder ikke' },
]
const suggestibleDimensions = [
  'referrer_domain',
  'browser',
  'os',
  'device',
  'screen',
  'language',
  'country',
  'event_name',
] as const
const supportsMetricViews = (column: SelectedColumn) =>
  column.id === 'selected_event' || (suggestibleDimensions.some((id) => id === column.id) && column.id !== 'event_name')

const isShareView = (column: SelectedColumn) => column.view === 'share' || column.view === 'visitor-share'

const escapeSqlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const isGroupedShare = (column: SelectedColumn, columns: SelectedColumn[]) =>
  isShareView(column) &&
  columns.some((item) => item.instanceId !== column.instanceId && item.id === column.id && item.view === 'rows')

const getColumnExpression = (column: SelectedColumn, columns: SelectedColumn[]) => {
  if (isGroupedShare(column, columns)) {
    const visitorId = "COALESCE(NULLIF(e.session_distinct_id, ''), CAST(e.session_id AS STRING))"
    const entityId = column.view === 'visitor-share' ? visitorId : 'e.visit_id'
    return `SAFE_DIVIDE(APPROX_COUNT_DISTINCT(${entityId}), SUM(APPROX_COUNT_DISTINCT(${entityId})) OVER ())`
  }
  if (column.view && column.view !== 'rows') {
    const value = escapeSqlString(column.filterValue?.trim() ?? '')
    const expression = column.expression
    const match =
      column.filterOperator === 'not-equals'
        ? `${expression} != '${value}'`
        : column.filterOperator === 'contains' || column.filterOperator === 'not-contains'
          ? `${column.filterOperator === 'not-contains' ? 'NOT ' : ''}(STRPOS(LOWER(${expression}), LOWER('${value}')) > 0)`
          : `${expression} = '${value}'`
    const condition = column.id === 'selected_event' ? `e.event_type = 2 AND ${match}` : match
    const visitorId = "COALESCE(NULLIF(e.session_distinct_id, ''), CAST(e.session_id AS STRING))"
    const visits = `APPROX_COUNT_DISTINCT(IF(${condition}, e.visit_id, NULL))`
    const visitors = `APPROX_COUNT_DISTINCT(IF(${condition}, ${visitorId}, NULL))`
    if (column.view === 'events') return column.id === 'selected_event' ? `COUNTIF(${condition})` : visits
    if (column.view === 'share') return `SAFE_DIVIDE(${visits}, APPROX_COUNT_DISTINCT(e.visit_id))`
    if (column.view === 'visitor-share') {
      return `SAFE_DIVIDE(${visitors}, APPROX_COUNT_DISTINCT(${visitorId}))`
    }
    return `APPROX_COUNT_DISTINCT(IF(${condition}, ${visitorId}, NULL))`
  }
  return column.expression
}

const getColumnLabel = (column: SelectedColumn) => {
  if (column.customLabel) return column.customLabel
  if (!column.view || column.view === 'rows') return column.label
  const metric = columnViewOptions(column).find((option) => option.value === column.view)?.label
  return `${metric}: ${column.filterValue?.trim() || column.label}`
}

const getColumnAliases = (columns: SelectedColumn[]) => getUniqueColumnAliases(columns.map(getColumnLabel))

const buildSql = (
  websiteId: string,
  startDate: Date,
  endDate: Date,
  columns: SelectedColumn[],
  urlPaths: string[],
  pathOperator: string,
  sidegroup: Sidegroup | null,
  useDashboardFilters = false,
) => {
  const projectId = getGcpProjectId()
  const dimensions = columns.filter((column) => column.kind === 'dimension')
  const hasMetrics = columns.some((column) => column.kind === 'metric')
  const sessionFields = new Set(
    columns
      .filter(
        (column) =>
          column.needsSession && ['browser', 'os', 'device', 'screen', 'language', 'country'].includes(column.id),
      )
      .map((column) => column.id),
  )
  if (
    columns.some((column) => column.id === 'visitors' || column.view === 'visitors' || column.view === 'visitor-share')
  ) {
    sessionFields.add('distinct_id')
  }
  const needsSession = sessionFields.size > 0
  const columnAliases = getColumnAliases(columns)
  const selectColumns = columns.map(
    (column, index) => `${getColumnExpression(column, columns)} AS ${quoteBigQueryIdentifier(columnAliases[index])}`,
  )
  const urlConditions = urlPaths.map((path) => {
    const escapedPath = escapeSqlString(path)
    if (pathOperator === 'starts-with') return `LOWER(e.url_path) LIKE '${escapeSqlString(path.toLowerCase())}%'`
    const escapedSlashPath = escapeSqlString(path.endsWith('/') ? path : `${path}/`)
    return `(e.url_path = '${escapedPath}' OR e.url_path = '${escapedSlashPath}' OR e.url_path LIKE '${escapedPath}?%')`
  })
  const urlFilter = sidegroup
    ? `\n  AND ${buildSidegroupSqlCondition(sidegroup, 'e.url_path')}`
    : useDashboardFilters
      ? `\n    AND e.url_path = [[ {{url_sti}} --]] '/'`
      : urlConditions.length > 0
        ? `\n  AND (${urlConditions.join(' OR ')})`
        : ''
  const dimensionFilters = dimensions.flatMap((column) => {
    const value = column.filterValue?.trim()
    if (!value || !column.filterOperator || column.filterOperator === 'all') return []
    const expression = column.expression
    const escapedValue = escapeSqlString(value)
    if (column.filterOperator === 'equals') return [`${expression} = '${escapedValue}'`]
    if (column.filterOperator === 'not-equals') return [`${expression} != '${escapedValue}'`]
    const contains = `STRPOS(LOWER(${expression}), LOWER('${escapedValue}')) > 0`
    return [column.filterOperator === 'contains' ? contains : `NOT (${contains})`]
  })
  const columnFilter = dimensionFilters.map((condition) => `\n    AND ${condition}`).join('')
  const groupBy =
    dimensions.length > 0 && hasMetrics
      ? `\nGROUP BY ${dimensions.map((dimension) => columns.indexOf(dimension) + 1).join(', ')}`
      : ''
  const firstMetricIndex = columns.findIndex((column) => column.kind === 'metric')
  const orderBy = hasMetrics ? `\nORDER BY ${quoteBigQueryIdentifier(columnAliases[firstMetricIndex])} DESC` : ''
  const sessionColumns = [...sessionFields].map((field) => `,\n    s.${field} AS session_${field}`).join('')
  const detailQuery = `SELECT${hasMetrics ? '' : ' DISTINCT'}
  ${selectColumns.join(',\n  ')}
FROM source e${groupBy}`
  const sessionJoin = needsSession
    ? `LEFT JOIN \`${projectId}.umami_views.session\` s
    ON e.session_id = s.session_id${
      useDashboardFilters
        ? ''
        : `\n    AND s.created_at BETWEEN TIMESTAMP('${startDate.toISOString()}') AND TIMESTAMP('${endDate.toISOString()}')`
    }`
    : ''
  const dateFilter = useDashboardFilters
    ? `\n    [[AND {{created_at}} ]]`
    : `\n    AND e.created_at BETWEEN TIMESTAMP('${startDate.toISOString()}') AND TIMESTAMP('${endDate.toISOString()}')`

  return `WITH source AS (
  SELECT
    e.*${sessionColumns}
  FROM \`${projectId}.umami_views.event\` e
  ${sessionJoin}
  WHERE e.website_id = '${escapeSqlString(websiteId)}'${dateFilter}${urlFilter}${columnFilter}
)
${detailQuery}${orderBy}`
}

const formatCell = (value: JsonValue | undefined, column: SelectedColumn) => {
  if (value == null || value === '') return '–'
  if (typeof value === 'number' && isShareView(column)) return percentFormatter.format(value)
  if (typeof value === 'number') return numberFormatter.format(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const escapeCsvField = (value: string) => `"${value.replace(/"/g, '""')}"`

type ColumnDialogProps = {
  open: boolean
  columns: SelectedColumn[]
  websiteId?: string
  onApply: (columns: SelectedColumn[]) => void
  onClose: () => void
}

const ColumnDialog = ({ open, columns, websiteId, onApply, onClose }: ColumnDialogProps) => {
  const [draft, setDraft] = useState(columns)
  const [search, setSearch] = useState('')
  const [validatedFilterValues, setValidatedFilterValues] = useState<Set<string>>(() => new Set())

  const columnsMissingFilterValue = draft.filter(
    (column) =>
      (column.kind === 'dimension' || (column.view && column.view !== 'rows')) &&
      !isGroupedShare(column, draft) &&
      column.filterOperator &&
      column.filterOperator !== 'all' &&
      !column.filterValue?.trim(),
  )

  const visibleGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('nb')
    if (!normalizedSearch) return COLUMN_GROUPS
    return COLUMN_GROUPS.map((group) => ({
      ...group,
      columns: group.columns.filter((column) =>
        `${column.label} ${column.description}`.toLocaleLowerCase('nb').includes(normalizedSearch),
      ),
    })).filter((group) => group.columns.length > 0)
  }, [search])

  const addColumn = (definition: ColumnDefinition) => {
    setDraft((current) => [
      ...current,
      {
        ...definition,
        instanceId: `${definition.id}-${crypto.randomUUID()}`,
        customLabel: '',
        view:
          definition.id === 'selected_event' ? 'visitor-share' : definition.kind === 'dimension' ? 'rows' : undefined,
        filterOperator: definition.id === 'selected_event' ? 'equals' : undefined,
      },
    ])
  }

  const handleApply = () => {
    if (columnsMissingFilterValue.length > 0) {
      setValidatedFilterValues(new Set(columnsMissingFilterValue.map((column) => column.instanceId)))
      return
    }
    onApply(draft)
  }

  const moveColumn = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Popup width="min(94vw, 1100px)">
        <Dialog.Header>
          <Dialog.Title>Velg kolonner</Dialog.Title>
        </Dialog.Header>
        <Dialog.Body>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <section>
              <TextField
                label="Søk etter kolonne"
                size="small"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="mt-5 max-h-[55vh] space-y-6 overflow-y-auto pr-2">
                {visibleGroups.map((group) => (
                  <div key={group.title}>
                    <Heading level="3" size="xsmall" spacing>
                      {group.title}
                    </Heading>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.columns.map((column) => {
                        const selectedCount = draft.filter((item) => item.id === column.id).length
                        return (
                          <button
                            type="button"
                            key={column.id}
                            aria-label={`Legg til ${column.label}`}
                            onClick={() => addColumn(column)}
                            className="flex w-full cursor-pointer gap-3 rounded-md border border-[var(--ax-border-neutral-subtle)] p-3 text-left"
                          >
                            <Plus className="mt-0.5 shrink-0" aria-hidden />
                            <span>
                              <span className="block text-sm font-semibold">
                                {column.label}
                                {selectedCount > 0 && (
                                  <span className="ml-2 font-normal text-[var(--ax-text-subtle)]">
                                    {selectedCount} lagt til
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs text-[var(--ax-text-subtle)]">{column.description}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-t border-[var(--ax-border-neutral-subtle)] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div className="mb-3 flex items-center justify-between">
                <Label>Kolonner i tabellen</Label>
                <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                  {draft.length} valgt
                </BodyShort>
              </div>
              {draft.length === 0 ? (
                <BodyShort
                  size="small"
                  className="rounded-md bg-[var(--ax-bg-neutral-soft)] p-4 text-[var(--ax-text-subtle)]"
                >
                  Velg minst én kolonne fra listen.
                </BodyShort>
              ) : (
                <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-2">
                  {draft.map((column, index) => (
                    <div
                      key={column.instanceId}
                      className="relative grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-md border border-[var(--ax-border-neutral-subtle)] p-3 focus-within:z-10"
                    >
                      <div className="space-y-2">
                        <TextField
                          label={column.label}
                          size="small"
                          value={getColumnLabel(column)}
                          onChange={(event) =>
                            setDraft((current) =>
                              current.map((item) =>
                                item.instanceId === column.instanceId
                                  ? { ...item, customLabel: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        {supportsMetricViews(column) && (
                          <Select
                            label={column.id === 'selected_event' ? 'Måltall' : `Visning for ${column.label}`}
                            size="small"
                            value={column.view ?? 'rows'}
                            onChange={(event) =>
                              setDraft((current) =>
                                current.map((item) =>
                                  item.instanceId === column.instanceId
                                    ? {
                                        ...item,
                                        view: event.target.value as ColumnView,
                                        kind: event.target.value === 'rows' ? 'dimension' : 'metric',
                                        filterOperator:
                                          event.target.value === 'rows'
                                            ? 'all'
                                            : !item.filterOperator || item.filterOperator === 'all'
                                              ? 'equals'
                                              : item.filterOperator,
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            {columnViewOptions(column).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        )}
                        {(column.kind === 'dimension' || (column.view && column.view !== 'rows')) &&
                          !isGroupedShare(column, draft) &&
                          column.id !== 'url_path' &&
                          column.id !== 'event_name' && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {column.id !== 'selected_event' && (
                                <Select
                                  label={
                                    column.kind === 'metric'
                                      ? `Operator for ${column.label}`
                                      : `Avgrens ${column.label}`
                                  }
                                  size="small"
                                  value={column.filterOperator ?? 'all'}
                                  onChange={(event) =>
                                    setDraft((current) =>
                                      current.map((item) =>
                                        item.instanceId === column.instanceId
                                          ? { ...item, filterOperator: event.target.value as DimensionOperator }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  {dimensionOperatorOptions
                                    .filter((option) => column.kind === 'dimension' || option.value !== 'all')
                                    .map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                </Select>
                              )}
                              {column.filterOperator &&
                                column.filterOperator !== 'all' &&
                                (column.id === 'selected_event' ||
                                suggestibleDimensions.some((id) => id === column.id) ? (
                                  <SuggestingValueEditor
                                    websiteId={websiteId}
                                    column={
                                      column.id === 'selected_event'
                                        ? 'event_name'
                                        : (column.id as (typeof suggestibleDimensions)[number])
                                    }
                                    label={column.id === 'selected_event' ? 'Hendelse' : `Verdi for ${column.label}`}
                                    value={column.filterValue ?? ''}
                                    error={
                                      validatedFilterValues.has(column.instanceId) && !column.filterValue?.trim()
                                        ? 'Angi en verdi'
                                        : undefined
                                    }
                                    className={column.id === 'selected_event' ? 'sm:col-span-2' : undefined}
                                    onChange={(value) =>
                                      setDraft((current) =>
                                        current.map((item) =>
                                          item.instanceId === column.instanceId
                                            ? { ...item, filterValue: value }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                ) : (
                                  <TextField
                                    label={`Verdi for ${column.label}`}
                                    size="small"
                                    value={column.filterValue ?? ''}
                                    error={
                                      validatedFilterValues.has(column.instanceId) && !column.filterValue?.trim()
                                        ? 'Angi en verdi'
                                        : undefined
                                    }
                                    onChange={(event) =>
                                      setDraft((current) =>
                                        current.map((item) =>
                                          item.instanceId === column.instanceId
                                            ? { ...item, filterValue: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                ))}
                            </div>
                          )}
                      </div>
                      <div className="flex gap-1 pb-0.5">
                        <Button
                          type="button"
                          variant="tertiary"
                          size="small"
                          icon={<ArrowUp aria-hidden />}
                          aria-label={`Flytt ${column.label} opp`}
                          disabled={index === 0}
                          onClick={() => moveColumn(index, -1)}
                        />
                        <Button
                          type="button"
                          variant="tertiary"
                          size="small"
                          icon={<ArrowDown aria-hidden />}
                          aria-label={`Flytt ${column.label} ned`}
                          disabled={index === draft.length - 1}
                          onClick={() => moveColumn(index, 1)}
                        />
                        <Button
                          type="button"
                          variant="tertiary"
                          size="small"
                          icon={<Trash2 aria-hidden />}
                          aria-label={`Fjern ${column.label}`}
                          onClick={() =>
                            setDraft((current) => current.filter((item) => item.instanceId !== column.instanceId))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Button
            variant="tertiary"
            size="small"
            onClick={() => {
              setDraft([])
              setValidatedFilterValues(new Set())
            }}
          >
            Tilbakestill
          </Button>
          <Button onClick={handleApply} disabled={draft.length === 0}>
            Bruk {draft.length} {draft.length === 1 ? 'kolonne' : 'kolonner'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Avbryt
          </Button>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog>
  )
}

const TableBuilder = () => {
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [period, setPeriodState] = useState(() => getStoredPeriod())
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [urlPaths, setUrlPaths] = useState<string[]>([])
  const [pathOperator, setPathOperator] = useState('equals')
  const [sidegroup, setSidegroup] = useState<Sidegroup | null>(null)
  const [columns, setColumns] = useState<SelectedColumn[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [page, setPage] = useState(1)
  const [searchText, setSearchText] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSql, setLastSql] = useState('')
  const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false)
  const [showMetabaseDialog, setShowMetabaseDialog] = useState(false)
  const columnAliases = useMemo(() => getColumnAliases(columns), [columns])
  const dashboardRange = getDateRangeFromPeriod(period, startDate, endDate)
  const dashboardSql =
    selectedWebsite && dashboardRange && columns.length > 0
      ? buildSql(
          selectedWebsite.id,
          dashboardRange.startDate,
          dashboardRange.endDate,
          columns,
          urlPaths,
          pathOperator,
          sidegroup,
          true,
        )
      : ''

  const setPeriod = (value: string) => {
    setPeriodState(value)
    savePeriodPreference(value)
  }

  const runTable = useCallback(async () => {
    if (!selectedWebsite || columns.length === 0) return
    const range = getDateRangeFromPeriod(period, startDate, endDate)
    if (!range) {
      setError('Velg en gyldig periode.')
      return
    }

    setLoading(true)
    setError(null)
    setHasRun(true)
    setPage(1)
    try {
      const sql = buildSql(
        selectedWebsite.id,
        range.startDate,
        range.endDate,
        columns,
        urlPaths.map(normalizeUrlToPath).filter(Boolean),
        pathOperator,
        sidegroup,
      )
      setLastSql(sql)
      const response = await fetch('/api/bigquery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: sql,
          analysisType: 'Tabellbygger',
        }),
      })
      const result = (await response.json()) as { data?: Row[]; error?: string }
      if (!response.ok) throw new Error(result.error || 'Kunne ikke lage tabellen')
      setRows(result.data ?? [])
    } catch (caughtError: unknown) {
      setRows([])
      setError(caughtError instanceof Error ? caughtError.message : 'Kunne ikke lage tabellen')
    } finally {
      setLoading(false)
    }
  }, [selectedWebsite, columns, period, startDate, endDate, urlPaths, pathOperator, sidegroup])

  useEffect(() => {
    if (!selectedWebsite || columns.length === 0) return
    if (period === 'custom' && (!startDate || !endDate)) return
    const timeoutId = window.setTimeout(() => void runTable(), 350)
    return () => window.clearTimeout(timeoutId)
  }, [selectedWebsite, columns, period, startDate, endDate, urlPaths, pathOperator, sidegroup, runTable])

  const resultRows = rows
  const normalizedSearch = searchText.trim().toLocaleLowerCase('nb')
  const filteredRows = normalizedSearch
    ? resultRows.filter((row) =>
        columns.some((column, index) =>
          formatCell(row[columnAliases[index]], column).toLocaleLowerCase('nb').includes(normalizedSearch),
        ),
      )
    : resultRows
  const sortColumnIndex = columns.findIndex((column) => column.instanceId === sortColumn)
  const sortedRows = [...filteredRows].sort((left, right) => {
    if (sortColumnIndex < 0) return 0
    const selectedColumn = columns[sortColumnIndex]
    const leftValue = left[columnAliases[sortColumnIndex]]
    const rightValue = right[columnAliases[sortColumnIndex]]
    const comparison =
      typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : formatCell(leftValue, selectedColumn).localeCompare(formatCell(rightValue, selectedColumn), 'nb-NO')
    return sortDirection === 'asc' ? comparison : -comparison
  })
  const pageCount = Math.ceil(sortedRows.length / rowsPerPage)
  const visibleRows = sortedRows.slice((page - 1) * rowsPerPage, page * rowsPerPage)
  const handleSort = (column: SelectedColumn) => {
    setPage(1)
    if (sortColumn === column.instanceId) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column.instanceId)
    setSortDirection(column.kind === 'dimension' ? 'asc' : 'desc')
  }

  const sortIndicator = (column: SelectedColumn) => {
    if (sortColumn !== column.instanceId) return <ArrowUpDown size={14} aria-hidden />
    return sortDirection === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />
  }

  const handleDownloadCsv = () => {
    const header = columns.map((column) => escapeCsvField(getColumnLabel(column))).join(',')
    const dataRows = sortedRows.map((row) =>
      columns.map((column, index) => escapeCsvField(formatCell(row[columnAliases[index]], column))).join(','),
    )
    downloadCsvFile([header, ...dataRows].join('\n'), `tabellbygger_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <>
      <PageHeader title="Tabellbygger" description="Bygg en tabell med kolonnene du trenger" beta />
      <AppBlock className="pb-16">
        <div className="space-y-6">
          <div className="grid gap-4 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(280px,1.2fr)_200px] lg:items-end">
            <WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} disableAutoEvents />
            <UrlPathFilter
              urlPaths={urlPaths}
              onUrlPathsChange={setUrlPaths}
              pathOperator={pathOperator}
              onPathOperatorChange={setPathOperator}
              selectedWebsiteDomain={selectedWebsite?.domain}
              selectedWebsiteId={selectedWebsite?.id}
              sidegroup={sidegroup}
              onSidegroupChange={setSidegroup}
              className="w-full"
            />
            <PeriodPicker
              period={period}
              onPeriodChange={setPeriod}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
            />
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          {columns.length === 0 ? (
            <section className="flex flex-col items-start gap-3 rounded-md border border-dashed border-[var(--ax-border-neutral)] bg-[var(--ax-bg-neutral-soft)] p-5">
              <div className="flex items-center gap-2">
                <Columns3 size={20} aria-hidden className="text-[var(--ax-text-subtle)]" />
                <Heading level="2" size="small">
                  Hvilke kolonner vil du ha i tabellen?
                </Heading>
              </div>
              <Button variant="secondary" size="small" icon={<Plus aria-hidden />} onClick={() => setDialogOpen(true)}>
                Velg kolonner
              </Button>
            </section>
          ) : (
            <section className="overflow-hidden rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ax-border-neutral-subtle)] p-4">
                <div>
                  <Heading level="2" size="small">
                    Tabell
                  </Heading>
                  <div className="flex flex-wrap items-center gap-2">
                    <BodyShort size="small" className="flex items-center gap-2 text-[var(--ax-text-subtle)]">
                      {loading && <Loader size="xsmall" title="Henter data" />}
                      {loading ? 'Henter data …' : `${numberFormatter.format(resultRows.length)} rader`}
                    </BodyShort>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={showSearch ? 'secondary' : 'tertiary'}
                    size="small"
                    icon={<Search aria-hidden />}
                    aria-pressed={showSearch}
                    onClick={() => {
                      setShowSearch((current) => !current)
                      if (showSearch) {
                        setSearchText('')
                        setPage(1)
                      }
                    }}
                  >
                    Søk
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    icon={<Columns3 aria-hidden />}
                    onClick={() => setDialogOpen(true)}
                  >
                    Endre kolonner
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    icon={<Plus aria-hidden />}
                    disabled={!lastSql}
                    onClick={() => setShowAddToDashboardDialog(true)}
                  >
                    Legg til i dashboard
                  </Button>
                  <ActionMenu>
                    <ActionMenu.Trigger>
                      <Button variant="secondary" size="small" icon={<Download aria-hidden />} disabled={!lastSql}>
                        Eksporter
                      </Button>
                    </ActionMenu.Trigger>
                    <ActionMenu.Content align="end">
                      <ActionMenu.Item onClick={handleDownloadCsv} disabled={sortedRows.length === 0}>
                        Last ned CSV
                      </ActionMenu.Item>
                      <ActionMenu.Item
                        onClick={() => openSqlEditorWithContext({ sql: lastSql, websiteId: selectedWebsite?.id })}
                      >
                        Åpne i SQL-editor
                      </ActionMenu.Item>
                      <ActionMenu.Item onClick={() => setShowMetabaseDialog(true)}>
                        Overfør til Metabase
                      </ActionMenu.Item>
                    </ActionMenu.Content>
                  </ActionMenu>
                </div>
              </div>
              {showSearch && (
                <div className="border-b border-[var(--ax-border-neutral-subtle)] p-4">
                  <TextField
                    label="Søk i tabellen"
                    size="small"
                    value={searchText}
                    onChange={(event) => {
                      setSearchText(event.target.value)
                      setPage(1)
                    }}
                    className="max-w-md"
                  />
                </div>
              )}
              <div className="overflow-x-auto">
                <Table size="small">
                  <Table.Header>
                    <Table.Row>
                      {columns.map((column) => (
                        <Table.HeaderCell
                          key={column.instanceId}
                          className={`${column.kind === 'metric' ? 'min-w-52 text-right' : 'min-w-60 text-left'} align-bottom`}
                          aria-sort={
                            sortColumn === column.instanceId
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            type="button"
                            className={`flex w-full items-start gap-2 px-3 py-2 hover:text-[var(--ax-text-accent)] ${column.kind === 'metric' ? 'justify-end text-right' : 'text-left'}`}
                            onClick={() => handleSort(column)}
                          >
                            <span className="min-w-0">{getColumnLabel(column)}</span>
                            <span className="mt-0.5 shrink-0">{sortIndicator(column)}</span>
                          </button>
                        </Table.HeaderCell>
                      ))}
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {loading || !hasRun ? (
                      Array.from({ length: skeletonBodyRowCount }).map((_, rowIndex) => (
                        <Table.Row key={rowIndex}>
                          {columns.map((column) => (
                            <Table.DataCell
                              key={column.instanceId}
                              className={column.kind === 'metric' ? 'text-right' : undefined}
                            >
                              <Skeleton variant="text" width={column.kind === 'metric' ? '40%' : '70%'} />
                            </Table.DataCell>
                          ))}
                        </Table.Row>
                      ))
                    ) : (
                      <>
                        {visibleRows.map((row, rowIndex) => (
                          <Table.Row key={rowIndex}>
                            {columns.map((column, columnIndex) => (
                              <Table.DataCell
                                key={column.instanceId}
                                className={column.kind === 'metric' ? 'text-right' : undefined}
                              >
                                {formatCell(row[columnAliases[columnIndex]], column)}
                              </Table.DataCell>
                            ))}
                          </Table.Row>
                        ))}
                        {resultRows.length === 0 && (
                          <Table.Row>
                            <Table.DataCell colSpan={columns.length}>Ingen data for valgene.</Table.DataCell>
                          </Table.Row>
                        )}
                      </>
                    )}
                  </Table.Body>
                </Table>
                {!loading && hasRun && pageCount > 1 && (
                  <div className="flex justify-center border-t border-[var(--ax-border-neutral-subtle)] p-4">
                    <Pagination page={page} onPageChange={setPage} count={pageCount} size="small" />
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </AppBlock>
      {dialogOpen && (
        <ColumnDialog
          open
          columns={columns}
          websiteId={selectedWebsite?.id}
          onClose={() => setDialogOpen(false)}
          onApply={(nextColumns) => {
            setColumns(nextColumns)
            setRows([])
            setPage(1)
            setHasRun(false)
            setDialogOpen(false)
          }}
        />
      )}
      <AddToDashboardDialog
        open={showAddToDashboardDialog}
        onClose={() => setShowAddToDashboardDialog(false)}
        graphName=""
        nameLabel="Navn"
        sqlText={dashboardSql}
        graphType="TABLE"
        sourceWebsiteId={selectedWebsite?.id}
        showWebsiteSelector={false}
      />
      <TransferToMetabaseDialog
        open={showMetabaseDialog}
        onClose={() => setShowMetabaseDialog(false)}
        sqlText={lastSql}
        sourceWebsiteId={selectedWebsite?.id}
      />
    </>
  )
}

export default TableBuilder
