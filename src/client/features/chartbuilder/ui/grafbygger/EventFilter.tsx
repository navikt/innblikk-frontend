import { useMemo, useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { Filter, Parameter } from '../../../../shared/types/chart.ts'
import { FILTER_COLUMNS, OPERATORS } from '../../../../shared/lib/constants.ts'
import EventSelector from './EventSelector.tsx'

// Event type options for the dropdown
const EVENT_TYPES = [
  { label: 'Sidevisninger', value: '1' },
  { label: 'Egendefinerte hendelser', value: '2' },
]

// Modified interface to receive date range info
interface ChartFiltersProps {
  filters: Filter[]
  parameters: Parameter[]
  setFilters: (filters: Filter[]) => void
  onDirtyStateChange?: (isDirty: boolean) => void
  availableEvents?: string[]
  onEnableCustomEvents?: (withParams?: boolean) => void
  dateRangeInDays?: number
  onDateRangeInDaysChange?: (days: number) => void

  isEventsLoading?: boolean
  mode?: 'full' | 'filter-only'
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Remove all filters by column name from an array. */
const withoutColumn = (filters: Filter[], ...columns: string[]): Filter[] =>
  filters.filter((f) => !columns.includes(f.column))

/** Build the event_type filter for the current combination of active types. */
const buildEventTypeFilter = (pageviewsActive: boolean, customEventsActive: boolean): Filter | null => {
  if (pageviewsActive && customEventsActive) {
    return { column: 'event_type', operator: 'IN', value: '1', multipleValues: ['1', '2'] }
  }
  if (pageviewsActive) return { column: 'event_type', operator: '=', value: '1' }
  if (customEventsActive) return { column: 'event_type', operator: '=', value: '2' }
  return null
}

const DEFAULT_URL_STI_FILTER: Filter = {
  column: 'url_path',
  operator: '=',
  value: '{{url_sti}}',
  interactive: true,
  metabaseParam: true,
}

// ──────────────────────────────────────────────────────────────────────────────

const EventFilter = forwardRef(
  (
    {
      filters,
      parameters,
      setFilters,
      onDirtyStateChange,
      availableEvents = [],
      onEnableCustomEvents,
      dateRangeInDays = 7,
      onDateRangeInDaysChange,
      isEventsLoading = false,
      mode = 'full',
    }: ChartFiltersProps,
    ref,
  ) => {
    // ── Pageviews state (all belongs together) ───────────────────────────────
    const [pageviewsActive, setPageviewsActive] = useState<boolean>(mode !== 'filter-only')
    const [pageViewsMode, setPageViewsMode] = useState<'all' | 'specific' | 'interactive'>('interactive')
    const [selectedPaths, setSelectedPaths] = useState<string[]>([])
    const [urlPathOperator, setUrlPathOperator] = useState<string>('IN')

    // ── Custom events state (all belongs together) ───────────────────────────
    const [customEventsActive, setCustomEventsActive] = useState<boolean>(false)
    const [customEventsMode, setCustomEventsMode] = useState<'none' | 'all' | 'specific' | 'interactive'>('none')
    const [customEvents, setCustomEvents] = useState<string[]>([])
    const [eventNameOperator, setEventNameOperator] = useState<string>('IN')

    const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const didInitPageviewsRef = useRef<boolean>(false)

    // ── Derived lists ────────────────────────────────────────────────────────

    const customEventsList = useMemo(() => {
      return availableEvents
        .filter((event) => event != null)
        .filter((event) => !event.toLowerCase().startsWith('pageview') && !event.includes('/'))
    }, [availableEvents])

    const availablePaths = useMemo(() => {
      const paths = new Set<string>()
      availableEvents.forEach((event) => {
        if (event == null) return
        if (event.startsWith('/')) paths.add(event)
      })
      return Array.from(paths).sort((a, b) => a.localeCompare(b))
    }, [availableEvents])

    // ── Generic filter helpers ───────────────────────────────────────────────

    const removeFilter = (index: number) => {
      setFilters(filters.filter((_, i) => i !== index))
    }

    const updateFilter = (index: number, updates: Partial<Filter>) => {
      setFilters(filters.map((filter, i) => (i === index ? { ...filter, ...updates } : filter)))
    }

    const addFilterDirectly = (filter: Filter) => {
      setFilters([...filters, filter])
    }

    const isDateRangeFilter = (filter: Filter): boolean => {
      return filter.column === 'created_at' && ['>=', '<='].includes(filter.operator || '')
    }

    // ── Pageviews toggle ─────────────────────────────────────────────────────
    //
    // Activating pageviews: adds event_type + url_path filters atomically.
    // Deactivating pageviews: removes both atomically — no out-of-sync possible.

    const activatePageviews = () => {
      setPageviewsActive(true)
      setPageViewsMode('interactive')
      setSelectedPaths([])

      const base = withoutColumn(filters, 'event_type', 'url_path')
      const eventTypeFilter = buildEventTypeFilter(true, customEventsActive)
      const next: Filter[] = eventTypeFilter ? [...base, eventTypeFilter] : [...base]
      next.push(DEFAULT_URL_STI_FILTER)
      setFilters(next)
    }

    const deactivatePageviews = () => {
      setPageviewsActive(false)
      setPageViewsMode('interactive')
      setSelectedPaths([])
      setUrlPathOperator('IN')

      // Remove event_type AND url_path together — they travel as a unit.
      const base = withoutColumn(filters, 'event_type', 'url_path')
      const eventTypeFilter = buildEventTypeFilter(false, customEventsActive)
      setFilters(eventTypeFilter ? [...base, eventTypeFilter] : base)
    }

    // ── Custom events toggle ─────────────────────────────────────────────────
    //
    // Same principle: activating/deactivating owns its own filter mutations.

    const activateCustomEvents = () => {
      setCustomEventsActive(true)
      if (customEventsMode === 'none') setCustomEventsMode('specific')

      const base = withoutColumn(filters, 'event_type')
      const eventTypeFilter = buildEventTypeFilter(pageviewsActive, true)
      setFilters(eventTypeFilter ? [...base, eventTypeFilter] : base)
    }

    const deactivateCustomEvents = () => {
      setCustomEventsActive(false)
      setCustomEventsMode('none')
      setCustomEvents([])
      setEventNameOperator('IN')

      // Remove event_type AND event_name together.
      const base = withoutColumn(filters, 'event_type', 'event_name')
      const eventTypeFilter = buildEventTypeFilter(pageviewsActive, false)
      setFilters(eventTypeFilter ? [...base, eventTypeFilter] : base)
    }

    // ── handleEventTypeChange — shim for EventSelector / CustomEventsEditor ──
    //
    // EventSelector and its sub-components still call handleEventTypeChange(id, bool).
    // We keep this shim so we don't have to touch every call site right now.

    const handleEventTypeChange = (eventType: string, isChecked: boolean) => {
      if (eventType === 'pageviews') {
        if (isChecked) {
          activatePageviews()
        } else {
          deactivatePageviews()
        }
      } else if (eventType === 'custom_events') {
        if (isChecked) {
          activateCustomEvents()
        } else {
          deactivateCustomEvents()
        }
      }
    }

    // ── URL-path change (while pageviews is active) ──────────────────────────

    const handlePathsChange = (paths: string[], operator: string = urlPathOperator, isInteractive = false) => {
      setSelectedPaths(paths)
      setUrlPathOperator(operator)

      const filtersWithoutPaths = withoutColumn(filters, 'url_path')

      if (paths.length === 0) {
        setFilters(filtersWithoutPaths)
        return
      }

      if (operator === 'IN') {
        setFilters([
          ...filtersWithoutPaths,
          {
            column: 'url_path',
            operator: 'IN',
            value: paths[0],
            multipleValues: paths,
            interactive: false,
            metabaseParam: false,
          },
        ])
      } else {
        setFilters([
          ...filtersWithoutPaths,
          {
            column: 'url_path',
            operator,
            value: paths[0],
            interactive: isInteractive,
            metabaseParam: isInteractive,
          },
        ])
      }
    }

    // ── Custom events change (while custom events is active) ─────────────────

    const handleCustomEventsChange = (
      selectedEvents: string[],
      operator: string = eventNameOperator,
      forceEnable: boolean = false,
    ) => {
      setCustomEvents(selectedEvents)
      setEventNameOperator(operator)

      const baseFilters = withoutColumn(filters, 'event_name')

      if (selectedEvents.length > 0 || forceEnable) {
        // Auto-correct event_type if it's currently pageviews-only
        const pageviewFilterIndex = baseFilters.findIndex(
          (f) => f.column === 'event_type' && f.value === '1' && f.operator === '=',
        )
        if (pageviewFilterIndex >= 0) {
          baseFilters[pageviewFilterIndex] = {
            column: 'event_type',
            operator: 'IN',
            value: '1',
            multipleValues: ['1', '2'],
          }
          setCustomEventsActive(true)
          if (customEventsMode === 'none' && !forceEnable) setCustomEventsMode('specific')
        } else if (!baseFilters.some((f) => f.column === 'event_type')) {
          baseFilters.push({ column: 'event_type', operator: '=', value: '2' })
          setCustomEventsActive(true)
          if (customEventsMode === 'none' && !forceEnable) setCustomEventsMode('specific')
        }
      }

      if (selectedEvents.length === 0) {
        setFilters(baseFilters)
        return
      }

      if (operator === 'IN') {
        setFilters([
          ...baseFilters,
          { column: 'event_name', operator: 'IN', value: selectedEvents[0], multipleValues: selectedEvents },
        ])
      } else {
        setFilters([...baseFilters, { column: 'event_name', operator, value: selectedEvents[0] }])
      }
    }

    // ── Sync operator state from incoming filters (e.g. loaded from saved config) ─

    useEffect(() => {
      const urlPathFilter = filters.find((f) => f.column === 'url_path')
      if (urlPathFilter?.operator) setUrlPathOperator(urlPathFilter.operator)
    }, [filters])

    useEffect(() => {
      const eventNameFilter = filters.find((f) => f.column === 'event_name')
      if (eventNameFilter?.operator) setEventNameOperator(eventNameFilter.operator)
    }, [filters])

    // ── One-time initialisation of the default url_sti filter ────────────────
    //
    // On first load, if there is no url_path filter yet but pageviews is active,
    // push the interactive {{url_sti}} default. Runs only once (guarded by ref).

    useEffect(() => {
      if (mode !== 'full') return
      if (didInitPageviewsRef.current) return

      const hasUrlPathFilter = filters.some((f) => f.column === 'url_path')
      const hasEventTypeFilter = filters.some((f) => f.column === 'event_type')
      const hasPageviewsEnabled =
        !hasEventTypeFilter ||
        filters.some((f) => f.column === 'event_type' && (f.value === '1' || f.multipleValues?.includes('1')))

      if (!hasUrlPathFilter && hasPageviewsEnabled) {
        didInitPageviewsRef.current = true
        const timer = setTimeout(() => {
          const nextFilters = [...filters]
          if (!hasEventTypeFilter) {
            nextFilters.push({ column: 'event_type', operator: '=', value: '1' })
          }
          nextFilters.push(DEFAULT_URL_STI_FILTER)
          setFilters(nextFilters)
        }, 0)
        return () => clearTimeout(timer)
      }

      didInitPageviewsRef.current = true
    }, [mode, filters, setFilters])

    // ── Dirty-state tracking ─────────────────────────────────────────────────

    useEffect(() => {
      if (!onDirtyStateChange) return

      const isDefaultUiState =
        mode === 'full' &&
        pageviewsActive &&
        !customEventsActive &&
        pageViewsMode === 'interactive' &&
        customEventsMode === 'none'

      onDirtyStateChange(!isDefaultUiState)
    }, [mode, pageviewsActive, customEventsActive, pageViewsMode, customEventsMode, onDirtyStateChange])

    // ── Unique parameters ────────────────────────────────────────────────────

    const uniqueParameters = useMemo(() => {
      const seen = new Set<string>()
      return parameters.filter((param) => {
        const cleanName = param.key.split('.').pop() || ''
        if (seen.has(cleanName)) return false
        seen.add(cleanName)
        return true
      })
    }, [parameters])

    // ── Reset ────────────────────────────────────────────────────────────────

    const resetFilters = (silent = false) => {
      setFilters([])

      if (mode === 'filter-only') {
        setPageviewsActive(false)
        setCustomEventsActive(false)
        setCustomEvents([])
        setSelectedPaths([])
        setPageViewsMode('interactive')
        setCustomEventsMode('none')
        return
      }

      setPageviewsActive(true)
      setCustomEventsActive(false)
      setCustomEvents([])
      setSelectedPaths([])
      setPageViewsMode('interactive')
      setCustomEventsMode('none')

      setTimeout(() => {
        setFilters([{ column: 'event_type', operator: '=', value: '1' }, DEFAULT_URL_STI_FILTER])
      }, 0)

      if (!silent) {
        if (alertTimeoutRef.current) {
          clearTimeout(alertTimeoutRef.current)
          alertTimeoutRef.current = null
        }
      }
    }

    // Clear timeouts when component unmounts
    useEffect(() => {
      return () => {
        if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current)
      }
    }, [])

    // Expose resetFilters method through ref
    useImperativeHandle(
      ref,
      () => ({
        resetFilters,
        enableCustomEvents: () => {
          if (mode === 'filter-only') return
          if (!customEventsActive) activateCustomEvents()
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [mode, customEventsActive],
    )

    // ── Derive selectedEventTypes for EventSelector (backward-compat) ────────
    //
    // EventSelector still expects a string[] for rendering the active cards.

    const selectedEventTypes = [
      ...(pageviewsActive ? ['pageviews'] : []),
      ...(customEventsActive ? ['custom_events'] : []),
    ]

    return (
      <section>
        <div className="space-y-6 relative">
          <div>
            <EventSelector
              selectedEventTypes={selectedEventTypes}
              handleEventTypeChange={handleEventTypeChange}
              pageViewsMode={pageViewsMode}
              setPageViewsMode={setPageViewsMode}
              customEventsMode={customEventsMode}
              setCustomEventsMode={setCustomEventsMode}
              urlPathOperator={urlPathOperator}
              setUrlPathOperator={setUrlPathOperator}
              selectedPaths={selectedPaths}
              handlePathsChange={handlePathsChange}
              eventNameOperator={eventNameOperator}
              setEventNameOperator={setEventNameOperator}
              customEvents={customEvents}
              handleCustomEventsChange={handleCustomEventsChange}
              availablePaths={availablePaths}
              customEventsList={customEventsList}
              filters={filters}
              OPERATORS={OPERATORS}
              onEnableCustomEvents={onEnableCustomEvents}
              eventLookbackDays={dateRangeInDays}
              onEventLookbackDaysChange={onDateRangeInDaysChange}
              parameters={parameters}
              uniqueParameters={uniqueParameters}
              FILTER_COLUMNS={FILTER_COLUMNS}
              EVENT_TYPES={EVENT_TYPES}
              removeFilter={removeFilter}
              updateFilter={updateFilter}
              isDateRangeFilter={isDateRangeFilter}
              isEventsLoading={isEventsLoading}
              addFilterDirectly={addFilterDirectly}
              showFilterPanelOnly={mode === 'filter-only'}
            />
          </div>
        </div>
      </section>
    )
  },
)

export default EventFilter
