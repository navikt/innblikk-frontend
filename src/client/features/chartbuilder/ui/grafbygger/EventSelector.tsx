import { useState } from 'react'
import { RadioGroup, Radio, Select, UNSAFE_Combobox, Button, Label, Skeleton, ReadMore, Tag } from '@navikt/ds-react'
import { XMarkIcon, PlusIcon, CheckmarkIcon } from '@navikt/aksel-icons'
import type { Filter, Parameter } from '../../../../shared/types/chart.ts'

type Option = { label: string; value: string }

/** Shared wrapper for every active card (event-type cards + generic filter cards). */
const FilterCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-(--ax-border-neutral-subtle) bg-(--ax-bg-default) px-3 py-3">{children}</div>
)

type FilterColumn = { value: string; label: string }
type FilterColumnGroup = { label: string; columns: FilterColumn[] }
type FilterColumns = Record<string, FilterColumnGroup>
type EventTypeId = 'pageviews' | 'custom_events'

interface EventSelectorProps {
  selectedEventTypes: string[]
  handleEventTypeChange: (eventType: string, isChecked: boolean) => void
  pageViewsMode: 'all' | 'specific' | 'interactive'
  setPageViewsMode: (mode: 'all' | 'specific' | 'interactive') => void
  customEventsMode: 'none' | 'all' | 'specific' | 'interactive'
  setCustomEventsMode: (mode: 'none' | 'all' | 'specific' | 'interactive') => void
  urlPathOperator: string
  setUrlPathOperator: (operator: string) => void
  selectedPaths: string[]
  handlePathsChange: (paths: string[], operator: string, isInteractive?: boolean) => void
  eventNameOperator: string
  setEventNameOperator: (operator: string) => void
  customEvents: string[]
  handleCustomEventsChange: (events: string[], operator: string, forceEnable?: boolean) => void
  availablePaths: string[]
  customEventsList: string[]
  filters: Filter[]
  OPERATORS: { value: string; label: string }[]
  eventLookbackDays?: number
  onEventLookbackDaysChange?: (days: number) => void
  onEnableCustomEvents?: (withParams?: boolean) => void
  // Advanced filters props
  parameters?: Parameter[]
  uniqueParameters?: Parameter[]
  FILTER_COLUMNS?: FilterColumns
  EVENT_TYPES?: Option[]
  // Active filter props
  removeFilter: (index: number) => void
  updateFilter: (index: number, updates: Partial<Filter>) => void
  isDateRangeFilter: (filter: Filter) => boolean
  isEventsLoading?: boolean
  addFilterDirectly?: (filter: Filter) => void
  showFilterPanelOnly?: boolean
}

const EventSelector = ({
  selectedEventTypes,
  handleEventTypeChange,
  pageViewsMode,
  setPageViewsMode,
  customEventsMode,
  setCustomEventsMode,
  urlPathOperator,
  setUrlPathOperator,
  selectedPaths,
  handlePathsChange,
  availablePaths,
  customEventsList,
  OPERATORS,
  eventLookbackDays = 7,
  onEventLookbackDaysChange,
  eventNameOperator,
  setEventNameOperator,
  customEvents,
  handleCustomEventsChange,
  onEnableCustomEvents,
  filters,
  parameters = [],
  uniqueParameters = [],
  FILTER_COLUMNS,
  EVENT_TYPES,
  removeFilter,
  updateFilter,
  isDateRangeFilter,
  isEventsLoading = false,
  addFilterDirectly,
  showFilterPanelOnly = false,
}: EventSelectorProps) => {
  const normalizeUrlPathInput = (input: string): string => {
    const trimmed = input.trim()
    if (!trimmed) return ''

    // Keep dashboard placeholders untouched
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
      return trimmed
    }

    const toPath = (value: string): string => {
      try {
        const parsed = new URL(value)
        return parsed.pathname || '/'
      } catch {
        return value
      }
    }

    if (trimmed.includes('://')) {
      return toPath(trimmed)
    }

    const looksLikeHost = /^[^/\s]+\.[^/\s]+(?:\/.*)?$/.test(trimmed)
    if (looksLikeHost) {
      return toPath(`https://${trimmed}`)
    }

    if (trimmed.startsWith('/')) {
      return trimmed
    }

    return `/${trimmed}`
  }

  const getCleanParamName = (param: Parameter): string => {
    const parts = param.key.split('.')
    return parts[parts.length - 1]
  }

  const getParamDisplayName = (param: Parameter): string => {
    const parts = param.key.split('.')
    return parts[parts.length - 1]
  }

  // Helper function for combobox options
  const getOptionsForColumn = (column: string, customEventsListIn: string[], availablePathsIn: string[]): Option[] => {
    switch (column) {
      case 'event_name':
        return customEventsListIn.map((event) => ({ label: event || '', value: event || '' }))
      case 'url_path':
        return availablePathsIn.map((path) => ({ label: path, value: path }))
      case 'event_type':
        return EVENT_TYPES ?? []
      default:
        return []
    }
  }

  // State for event param filter in "Utvalgte hendelser" mode
  const [selectedEventParam, setSelectedEventParam] = useState<string>('')
  const [eventParamOperator, setEventParamOperator] = useState<string>('=')
  const [eventParamValue, setEventParamValue] = useState<string>('')

  // Track whether user requested params for this session; derive loading state from props
  const [hasRequestedParams, setHasRequestedParams] = useState(false)

  const isParamsLoading = hasRequestedParams && isEventsLoading

  // Filters that are implicitly owned by an active event-type card should not
  // appear in the generic list. These are:
  //   • event_type  – always managed by the card checkboxes
  //   • url_path    – managed by the Sidevisninger card (when pageviews is active)
  //   • event_name  – managed by the Egendefinerte hendelser card (when custom_events is active)
  // We only suppress them when their owning card is actually selected, so that a
  // manually-added filter of the same column (e.g. in filter-only mode) is still shown.
  const isCardOwnedFilter = (filter: Filter): boolean => {
    if (showFilterPanelOnly) return false
    if (filter.column === 'event_type') return selectedEventTypes.length > 0
    if (filter.column === 'url_path') return selectedEventTypes.includes('pageviews')
    if (filter.column === 'event_name') return selectedEventTypes.includes('custom_events')
    return false
  }

  const [openEditors, setOpenEditors] = useState<Record<EventTypeId, boolean>>({
    pageviews: false,
    custom_events: false,
  })

  const selectedEventTypeOrder = (['pageviews', 'custom_events'] as EventTypeId[]).filter((eventType) =>
    selectedEventTypes.includes(eventType),
  )
  const missingEventTypes = (['pageviews', 'custom_events'] as EventTypeId[]).filter(
    (eventType) => !selectedEventTypes.includes(eventType),
  )

  const pageviewsSummary =
    pageViewsMode === 'interactive'
      ? ''
      : pageViewsMode === 'all'
        ? 'Standard: Hele nettsiden'
        : selectedPaths.length > 0
          ? `Låst til ${selectedPaths.length} side${selectedPaths.length === 1 ? '' : 'r'}`
          : 'Låst til bestemte sider'

  const customEventsSummary =
    customEventsMode === 'interactive'
      ? 'Standard: Mottaker velger hendelse i dashboardet'
      : customEventsMode === 'all'
        ? 'Standard: Alle hendelser'
        : customEvents.length > 0
          ? `${customEvents.length} valgt${customEvents.length === 1 ? '' : 'e'} hendelse${customEvents.length === 1 ? '' : 'r'}`
          : 'Velg hendelser'

  const toggleEditor = (eventType: EventTypeId) => {
    setOpenEditors((prev) => ({
      ...prev,
      [eventType]: !prev[eventType],
    }))
  }

  const addEventType = (eventType: EventTypeId) => {
    handleEventTypeChange(eventType, true)

    if (eventType === 'custom_events') {
      if (customEventsMode === 'none') {
        setCustomEventsMode('specific')
      }
      if (onEnableCustomEvents && customEventsList.length === 0) {
        onEnableCustomEvents(false)
      }
    }

    setOpenEditors((prev) => ({
      ...prev,
      [eventType]: true,
    }))
  }

  const removeEventType = (eventType: EventTypeId) => {
    handleEventTypeChange(eventType, false)

    if (eventType === 'custom_events') {
      setCustomEventsMode('none')
      handleCustomEventsChange([], 'IN')
    }

    setOpenEditors((prev) => ({
      ...prev,
      [eventType]: false,
    }))
  }

  /** Fixed options for the event-type combobox */
  // (kept for potential future use)
  // const eventTypeOptions = [
  //   { label: 'Sidevisninger', value: 'pageviews' },
  //   { label: 'Egendefinerte hendelser', value: 'custom_events' },
  // ];

  // Get parameters filtered by selected events
  const filteredParameters = parameters.filter((param) => {
    if (customEvents.length === 0) return true
    const eventName = param.key.includes('.') ? param.key.split('.')[0] : 'Andre'
    return customEvents.some((e) => e.toLowerCase() === eventName.toLowerCase())
  })

  // Get unique filtered parameters
  const filteredUniqueParams = filteredParameters.reduce((acc: Parameter[], param) => {
    const baseName = getCleanParamName(param)
    if (!acc.some((p) => getCleanParamName(p) === baseName)) {
      acc.push(param)
    }
    return acc
  }, [])

  // Handle adding/updating the event param filter
  const handleAddEventParamFilter = (valueOverride?: string) => {
    const value = valueOverride ?? eventParamValue
    if (!selectedEventParam || !value) return

    // Check if a filter for this column already exists
    const existingFilterIndex = filters.findIndex((f) => f.column === selectedEventParam)

    if (existingFilterIndex >= 0) {
      // Update the existing filter
      updateFilter(existingFilterIndex, {
        operator: eventParamOperator,
        value: value,
      })
    } else {
      // Create a new filter
      const newFilter: Filter = {
        column: selectedEventParam,
        operator: eventParamOperator,
        value: value,
      }

      // Use addFilterDirectly if available to directly add to filters
      if (addFilterDirectly) {
        addFilterDirectly(newFilter)
      }
    }

    // Don't reset the form - keep the selection visible so user can see what's applied
  }

  // Handle fetching params for events
  const handleFetchEventParams = () => {
    setHasRequestedParams(true)
    if (onEnableCustomEvents) onEnableCustomEvents(true)
  }

  const pageviewsEditor = (
    <div className="space-y-3">
      <RadioGroup
        legend="Sidevisninger"
        hideLegend
        value={pageViewsMode}
        onChange={(val) => {
          const newMode = val as 'all' | 'specific' | 'interactive'
          setPageViewsMode(newMode)
          handlePathsChange([], 'IN')
          if (newMode === 'interactive') {
            handlePathsChange(['{{url_sti}}'], '=', true)
          }
        }}
        size="small"
      >
        <Radio value="interactive">Side velges via filter i dashboardet</Radio>
        <Radio value="all">Hele nettsiden</Radio>
        <Radio value="specific">Lås til bestemte sider</Radio>
      </RadioGroup>

      {pageViewsMode === 'specific' && (
        <div className="space-y-3 pt-1">
          <div>
            <Select
              label="URL"
              value={urlPathOperator}
              onChange={(e) => {
                const newOperator = e.target.value
                setUrlPathOperator(newOperator)

                if (
                  (newOperator === 'IN' && selectedPaths.length <= 1) ||
                  (urlPathOperator === 'IN' && newOperator !== 'IN')
                ) {
                  const pathValue = selectedPaths.length > 0 ? selectedPaths[0] : ''
                  handlePathsChange(newOperator === 'IN' ? selectedPaths : [pathValue], newOperator)
                } else {
                  handlePathsChange(selectedPaths, newOperator)
                }
              }}
              size="small"
              className="w-full md:w-1/3"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </Select>
          </div>
          {urlPathOperator === 'IN' ? (
            <UNSAFE_Combobox
              label="Velg URL-stier"
              description="Flere stier kan velges for 'er lik' operator"
              options={availablePaths.map((path) => ({
                label: path,
                value: path,
              }))}
              selectedOptions={selectedPaths}
              onToggleSelected={(option: string, isSelected: boolean) => {
                const normalizedPath = normalizeUrlPathInput(option)
                if (normalizedPath) {
                  const newSelection = isSelected
                    ? Array.from(new Set([...selectedPaths, normalizedPath]))
                    : selectedPaths.filter((p) => p !== normalizedPath)
                  handlePathsChange(newSelection, urlPathOperator)
                }
              }}
              isMultiSelect
              size="small"
              allowNewValues
            />
          ) : (
            <UNSAFE_Combobox
              label="Legg til en eller flere URL-stier"
              description={
                urlPathOperator === 'LIKE'
                  ? 'Søket vil inneholde verdien uavhengig av posisjon'
                  : urlPathOperator === 'STARTS_WITH'
                    ? 'Søket vil finne stier som starter med verdien'
                    : urlPathOperator === 'ENDS_WITH'
                      ? 'Søket vil finne stier som slutter med verdien'
                      : null
              }
              options={availablePaths.map((path) => ({
                label: path,
                value: path,
              }))}
              selectedOptions={selectedPaths.length > 0 ? [selectedPaths[0]] : []}
              onToggleSelected={(option: string, isSelected: boolean) => {
                const normalizedPath = normalizeUrlPathInput(option)
                if (normalizedPath) {
                  handlePathsChange(isSelected ? [normalizedPath] : [], urlPathOperator)
                }
              }}
              isMultiSelect={false}
              size="small"
              allowNewValues
            />
          )}
          {selectedPaths.length === 0 && (
            <div className="mt-2 text-xs text-(--ax-text-subtle)">Når tom vises alle sidevisninger</div>
          )}
        </div>
      )}
    </div>
  )

  const customEventsEditor = (
    <div className="space-y-3">
      <RadioGroup
        legend="Egendefinerte hendelser"
        hideLegend
        value={customEventsMode}
        onChange={(val) => {
          const newMode = val as 'all' | 'specific' | 'interactive'

          if (onEnableCustomEvents && customEventsList.length === 0) {
            onEnableCustomEvents(false)
          }

          handleEventTypeChange('custom_events', true)
          setCustomEventsMode(newMode)

          if (newMode === 'interactive') {
            handleCustomEventsChange([], 'IN')
            handleCustomEventsChange(['{{event_name}}'], '=')
          }
        }}
        size="small"
      >
        <Radio value="specific">Utvalgte hendelser</Radio>
        <Radio value="all">Alle hendelser</Radio>
        <Radio value="interactive">Filter der mottaker velger selv i dashboardet</Radio>
      </RadioGroup>

      <div>
        {customEventsMode === 'specific' && (
          <div className="space-y-3 pt-1">
            {isEventsLoading && !isParamsLoading && customEventsList.length === 0 && (
              <div className="mb-4 space-y-3">
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="rectangle" height={40} />
                <Skeleton variant="rectangle" height={40} />
              </div>
            )}
            {customEventsMode === 'specific' && (!isEventsLoading || isParamsLoading) && (
              <>
                <div className="mb-3">
                  <Select
                    label="Hendelsesnavn"
                    value={eventNameOperator}
                    onChange={(e) => {
                      const newOperator = e.target.value
                      setEventNameOperator(newOperator)

                      if (customEvents.length > 0) {
                        if (newOperator === 'IN' || eventNameOperator === 'IN') {
                          handleCustomEventsChange(customEvents, newOperator)
                        }
                      }
                    }}
                    size="small"
                    className="w-full md:w-1/3"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
            {customEventsMode === 'specific' && (!isEventsLoading || isParamsLoading) && (
              <>
                {eventNameOperator === 'IN' ? (
                  <UNSAFE_Combobox
                    label="Velg hendelser"
                    description="Flere hendelser kan velges for 'er lik' operator"
                    options={customEventsList.map((event) => ({
                      label: event,
                      value: event,
                    }))}
                    selectedOptions={customEvents}
                    onToggleSelected={(option: string, isSelected: boolean) => {
                      if (option) {
                        const newSelection = isSelected
                          ? [...customEvents, option]
                          : customEvents.filter((e) => e !== option)
                        handleCustomEventsChange(newSelection, eventNameOperator)
                      }
                    }}
                    isMultiSelect
                    size="small"
                    allowNewValues
                  />
                ) : (
                  <UNSAFE_Combobox
                    label="Velg hendelse"
                    description={
                      eventNameOperator === 'LIKE'
                        ? 'Søket vil matche hendelser som inneholder verdien'
                        : eventNameOperator === 'STARTS_WITH'
                          ? 'Søket vil finne hendelser som starter med verdien'
                          : eventNameOperator === 'ENDS_WITH'
                            ? 'Søket vil finne hendelser som slutter med verdien'
                            : null
                    }
                    options={customEventsList.map((event) => ({
                      label: event,
                      value: event,
                    }))}
                    selectedOptions={customEvents.length > 0 ? [customEvents[0]] : []}
                    onToggleSelected={(option: string, isSelected: boolean) => {
                      if (option) {
                        handleCustomEventsChange(isSelected ? [option] : [], eventNameOperator)
                      }
                    }}
                    isMultiSelect={false}
                    size="small"
                    allowNewValues
                  />
                )}
              </>
            )}

            {customEvents.length > 0 && (
              <div className="mt-6 pt-4 border-t border-(--ax-border-neutral-subtle)">
                {isParamsLoading || isEventsLoading ? (
                  <div className="space-y-3">
                    <Skeleton variant="text" width="50%" />
                    <Skeleton variant="rectangle" height={40} />
                    <div className="flex gap-2">
                      <Skeleton variant="rectangle" height={40} width="33%" />
                      <Skeleton variant="rectangle" height={40} className="flex-1" />
                    </div>
                  </div>
                ) : parameters.length === 0 ? (
                  <>
                    <Label as="p" size="small" className="mb-2">
                      Filtrer på hendelsesdetaljer (valgfritt)
                    </Label>
                    <div className="mt-3">
                      <Button variant="secondary" size="small" onClick={handleFetchEventParams}>
                        Hent hendelsesdetaljer
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <UNSAFE_Combobox
                      label="Velg hendelsesdetaljer (valgfritt)"
                      options={filteredUniqueParams.map((param) => ({
                        label: getParamDisplayName(param),
                        value: `param_${getCleanParamName(param)}`,
                      }))}
                      selectedOptions={selectedEventParam ? [selectedEventParam] : []}
                      onToggleSelected={(option: string, isSelected: boolean) => {
                        if (isSelected && option) {
                          setSelectedEventParam(option)
                          setEventParamValue('')
                        } else {
                          setSelectedEventParam('')
                        }
                      }}
                      isMultiSelect={false}
                      size="small"
                      shouldAutocomplete={false}
                    />

                    {selectedEventParam && (
                      <>
                        <div className="flex gap-2 items-end">
                          <Select
                            label="Operator"
                            value={eventParamOperator}
                            onChange={(e) => setEventParamOperator(e.target.value)}
                            size="small"
                            className="w-1/3"
                          >
                            {OPERATORS.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </Select>

                          <div className="flex-1">
                            <UNSAFE_Combobox
                              label="Verdi"
                              options={[]}
                              selectedOptions={eventParamValue ? [eventParamValue] : []}
                              onToggleSelected={(option: string, isSelected: boolean) => {
                                if (option) {
                                  const newValue = isSelected ? option : ''
                                  setEventParamValue(newValue)
                                  if (isSelected && newValue && selectedEventParam) {
                                    handleAddEventParamFilter(newValue)
                                  }
                                }
                              }}
                              isMultiSelect={false}
                              size="small"
                              allowNewValues
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {customEventsMode === 'interactive' && (
          <div className="flex items-center gap-3 pt-1">
            <span className="flex items-center justify-center w-6 h-6 bg-green-100 rounded-full shrink-0">
              <CheckmarkIcon aria-hidden className="text-green-600" fontSize="1rem" />
            </span>
            <p className="text-(--ax-text-default)">Hendelsesnavn kan velges som filtervalg</p>
          </div>
        )}
      </div>

      <div>
        <ReadMore size="small" header="Utvid søkevindu (standard 7 dager)">
          <div className="mt-2 space-y-2">
            <Select
              label="Hvor langt tilbake hente hendelser"
              size="small"
              value={String(eventLookbackDays)}
              onChange={(e) => {
                const days = Number(e.target.value)
                if (Number.isFinite(days) && onEventLookbackDaysChange) {
                  onEventLookbackDaysChange(days)
                }
              }}
              className="w-full md:w-1/2"
            >
              <option value="7">Siste 7 dager</option>
              <option value="14">Siste 14 dager</option>
              <option value="30">Siste 30 dager</option>
              <option value="60">Siste 60 dager</option>
              <option value="90">Siste 90 dager</option>
              <option value="180">Siste 180 dager</option>
            </Select>
          </div>
        </ReadMore>
      </div>
    </div>
  )

  // Resolve a human-readable column label for the active-filter header
  const getColumnLabel = (column: string): string => {
    if (FILTER_COLUMNS) {
      for (const group of Object.values(FILTER_COLUMNS)) {
        const match = group.columns.find((c) => c.value === column)
        if (match) return match.label
      }
    }
    if (column.startsWith('param_')) {
      const paramName = column.replace('param_', '')
      const match = uniqueParameters.find((p) => getCleanParamName(p) === paramName)
      return match ? getParamDisplayName(match) : paramName
    }
    return column
  }

  return (
    <div className="mb-1 mt-3 space-y-3">
      {/* ── Active event-type cards ───────────────────────────────────────── */}
      {!showFilterPanelOnly &&
        selectedEventTypeOrder.map((eventType) => {
          const isPageviewsRow = eventType === 'pageviews'
          const isEditorOpen = isPageviewsRow || openEditors[eventType]
          const title = isPageviewsRow ? 'Sidevisninger' : 'Egendefinerte hendelser'
          const summary = isPageviewsRow ? pageviewsSummary : customEventsSummary

          return (
            <FilterCard key={eventType}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[170px]">
                  <p className="text-sm font-semibold event-selector-title">{title}</p>
                  {summary && <p className="text-xs event-selector-summary">{summary}</p>}
                </div>

                {!isPageviewsRow && customEventsMode === 'specific' && customEvents.length > 0 && (
                  <Tag variant="neutral" size="xsmall">
                    {customEvents.length} valg
                  </Tag>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-1">
                  {!isPageviewsRow && (
                    <Button variant="tertiary" size="xsmall" onClick={() => toggleEditor(eventType)}>
                      {isEditorOpen ? 'Lukk' : 'Rediger'}
                    </Button>
                  )}
                  <Button
                    variant="tertiary"
                    data-color="danger"
                    size="xsmall"
                    icon={<XMarkIcon aria-hidden />}
                    onClick={() => removeEventType(eventType)}
                  >
                    Fjern
                  </Button>
                </div>
              </div>

              {isEditorOpen && (
                <div className="mt-3 pt-3 border-t border-(--ax-border-neutral-subtle)">
                  {isPageviewsRow ? pageviewsEditor : customEventsEditor}
                </div>
              )}
            </FilterCard>
          )
        })}

      {/* ── Active generic filters ────────────────────────────────────────── */}
      {filters.filter((f) => !isDateRangeFilter(f) && !isCardOwnedFilter(f)).length > 0 &&
        filters.map(
          (filter, index) =>
            !isDateRangeFilter(filter) &&
            !isCardOwnedFilter(filter) && (
              <FilterCard key={index}>
                {/* Filter header row */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-(--ax-text-default) grow">
                    {getColumnLabel(filter.column)}
                  </span>
                  {filter.interactive && (
                    <span className="inline-flex items-center rounded-full bg-[var(--ax-bg-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--ax-text-accent)]">
                      Mottaker velger selv
                    </span>
                  )}
                  <Button
                    variant="tertiary"
                    data-color="danger"
                    size="xsmall"
                    icon={<XMarkIcon aria-hidden />}
                    onClick={() => removeFilter(index)}
                  >
                    Fjern
                  </Button>
                </div>

                {/* Filter controls */}
                <div className="space-y-2">
                  <div className="flex gap-2 items-end flex-wrap">
                    <Select
                      label="Kolonne"
                      value={filter.column}
                      onChange={(e) => updateFilter(index, { column: e.target.value, operator: '=', value: '' })}
                      size="small"
                      className="min-w-[150px]"
                    >
                      <option value="" disabled>
                        Velg kolonne…
                      </option>
                      {FILTER_COLUMNS &&
                        Object.entries(FILTER_COLUMNS).map(([groupKey, group]) => (
                          <optgroup key={groupKey} label={group.label}>
                            {group.columns.map((col) => (
                              <option key={col.value} value={col.value}>
                                {col.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      {parameters.length > 0 && (
                        <optgroup label="Hendelsesdetaljer">
                          {uniqueParameters.map((param) => (
                            <option key={`param_${param.key}`} value={`param_${getCleanParamName(param)}`}>
                              {getParamDisplayName(param)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>

                    {!filter.interactive && (
                      <Button
                        variant="tertiary"
                        size="small"
                        className="mb-1"
                        onClick={() => {
                          const paramName =
                            filter.column === 'url_path'
                              ? 'url_sti'
                              : filter.column === 'event_name'
                                ? 'hendelse'
                                : filter.column.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                          updateFilter(index, {
                            operator: '=',
                            value: `{{${paramName}}}`,
                            metabaseParam: true,
                            interactive: true,
                          })
                        }}
                      >
                        Gjør til filtervalg
                      </Button>
                    )}

                    {filter.column !== 'created_at' && !filter.interactive && (
                      <Select
                        label="Operator"
                        value={filter.operator || '='}
                        onChange={(e) => updateFilter(index, { operator: e.target.value, value: '' })}
                        size="small"
                        className="min-w-[100px]"
                      >
                        {OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>

                  {filter.interactive ? (
                    <div className="bg-[var(--ax-bg-accent-soft)] p-2 rounded text-sm text-[var(--ax-text-default)]">
                      Parameter: <strong>{filter.value?.toString().replace('{{', '').replace('}}', '')}</strong>
                    </div>
                  ) : (
                    !['IS NULL', 'IS NOT NULL'].includes(filter.operator || '') && (
                      <UNSAFE_Combobox
                        label="Verdi"
                        description={null}
                        options={getOptionsForColumn(filter.column, customEventsList, availablePaths)}
                        selectedOptions={
                          Array.isArray(filter.multipleValues)
                            ? filter.multipleValues.map((v) => v || '')
                            : filter.value
                              ? [filter.value]
                              : []
                        }
                        onToggleSelected={(option: string, isSelected: boolean) => {
                          if (option) {
                            const currentValues = Array.isArray(filter.multipleValues)
                              ? filter.multipleValues
                              : filter.value
                                ? [filter.value]
                                : []
                            const newValues = isSelected
                              ? [...new Set([...currentValues, option])]
                              : currentValues.filter((val) => val !== option)

                            updateFilter(index, {
                              operator: newValues.length > 1 ? 'IN' : filter.operator,
                              multipleValues: newValues.length > 0 ? newValues : undefined,
                              value: newValues.length > 0 ? newValues[0] : '',
                            })
                          }
                        }}
                        isMultiSelect={true}
                        size="small"
                        allowNewValues={filter.column !== 'event_type'}
                        shouldAutocomplete={false}
                      />
                    )
                  )}
                </div>
              </FilterCard>
            ),
        )}

      {/* ── Add buttons – always last ─────────────────────────────────────── */}
      {!showFilterPanelOnly &&
        missingEventTypes.map((eventType) => {
          const isPageviews = eventType === 'pageviews'
          return (
            <button
              key={eventType}
              type="button"
              onClick={() => addEventType(eventType)}
              aria-label={isPageviews ? 'Legg til sidevisninger' : 'Legg til egendefinerte hendelser'}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-(--ax-border-neutral-subtle) bg-transparent px-3 py-3 text-left hover:border-(--ax-border-neutral) hover:bg-(--ax-bg-default) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ax-border-accent)"
            >
              <PlusIcon aria-hidden fontSize="1.375rem" className="shrink-0 text-(--ax-text-subtle)" />
              <p className="text-sm font-semibold text-(--ax-text-subtle)">
                {isPageviews ? 'Legg til sidevisninger' : 'Legg til egendefinerte hendelser'}
              </p>
            </button>
          )
        })}

      <button
        type="button"
        onClick={() => addFilterDirectly?.({ column: '', operator: '=', value: '' })}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-(--ax-border-neutral-subtle) bg-transparent px-3 py-3 text-left hover:border-(--ax-border-neutral) hover:bg-(--ax-bg-default) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ax-border-accent)"
      >
        <PlusIcon aria-hidden fontSize="1.375rem" className="shrink-0 text-(--ax-text-subtle)" />
        <p className="text-sm font-semibold text-(--ax-text-subtle)">Legg til filter</p>
      </button>
    </div>
  )
}

export default EventSelector
