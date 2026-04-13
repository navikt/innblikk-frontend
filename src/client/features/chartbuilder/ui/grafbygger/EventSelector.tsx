import { useState } from 'react'
import {
  RadioGroup,
  Radio,
  Select,
  UNSAFE_Combobox,
  Tabs,
  Button,
  Label,
  Skeleton,
  ReadMore,
  Tag,
} from '@navikt/ds-react'
import type { Filter, Parameter } from '../../../../shared/types/chart.ts'
import AlertWithCloseButton from './AlertWithCloseButton.tsx'

type Option = { label: string; value: string }

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
  stagingFilter?: Filter | null
  setStagingFilter?: (filter: Filter | null) => void
  addFilter?: (column: string) => void
  commitStagingFilter?: () => void
  parameters?: Parameter[]
  uniqueParameters?: Parameter[]
  stagingAlertInfo?: { show: boolean; message: string }
  handleStagingAlertClose?: () => void
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
  stagingFilter,
  setStagingFilter,
  addFilter,
  commitStagingFilter,
  parameters = [],
  uniqueParameters = [],
  stagingAlertInfo,
  handleStagingAlertClose,
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
  const [showActiveFilters, setShowActiveFilters] = useState(false)

  const isParamsLoading = hasRequestedParams && isEventsLoading
  const hasActivatedEventType = showFilterPanelOnly || selectedEventTypes.length > 0
  const activeFilterCount = filters.filter((f) => !isDateRangeFilter(f)).length
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
        <div className="bg-(--ax-bg-default) p-4 rounded border">
          <div className="mb-3">
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
          <div className="bg-(--ax-bg-default) p-4 rounded border">
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
          <div className="bg-(--ax-bg-default) p-4 rounded border">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <span className="flex items-center justify-center w-6 h-6 bg-green-100 rounded-full">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-600">
                    <path
                      d="M13.3 4.3L6 11.6L2.7 8.3C2.3 7.9 1.7 7.9 1.3 8.3C0.9 8.7 0.9 9.3 1.3 9.7L5.3 13.7C5.5 13.9 5.7 14 6 14C6.3 14 6.5 13.9 6.7 13.7L14.7 5.7C15.1 5.3 15.1 4.7 14.7 4.3C14.3 3.9 13.7 3.9 13.3 4.3Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </div>
              <div>
                <p className="text-(--ax-text-default)">Hendelsesnavn kan velges som filtervalg</p>
              </div>
            </div>
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

  return (
    <div className="mb-1">
      <div className="mt-3">
        <div className="space-y-4">
          {!showFilterPanelOnly && (
            <div className="space-y-3">
              {selectedEventTypeOrder.map((eventType) => {
                const isPageviewsRow = eventType === 'pageviews'
                const isEditorOpen = isPageviewsRow || openEditors[eventType]
                const title = isPageviewsRow ? 'Sidevisninger' : 'Egendefinerte hendelser'
                const summary = isPageviewsRow ? pageviewsSummary : customEventsSummary

                return (
                  <div
                    key={eventType}
                    className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-3 py-3"
                  >
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
                        <Button variant="tertiary" size="xsmall" onClick={() => setShowActiveFilters((prev) => !prev)}>
                          Filter
                        </Button>
                        {!isPageviewsRow && (
                          <Button variant="tertiary" size="xsmall" onClick={() => toggleEditor(eventType)}>
                            {isEditorOpen ? 'Lukk' : 'Rediger'}
                          </Button>
                        )}
                        <Button variant="tertiary-neutral" size="xsmall" onClick={() => removeEventType(eventType)}>
                          Fjern
                        </Button>
                      </div>
                    </div>

                    {isEditorOpen && (
                      <div className="mt-3 rounded-md bg-[var(--ax-bg-default)] p-3">
                        {isPageviewsRow ? pageviewsEditor : customEventsEditor}
                      </div>
                    )}
                  </div>
                )
              })}

              {missingEventTypes.length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-col gap-2">
                    {missingEventTypes.map((eventType) => {
                      const isPageviews = eventType === 'pageviews'
                      return (
                        <button
                          key={eventType}
                          type="button"
                          onClick={() => addEventType(eventType)}
                          aria-label={isPageviews ? 'Legg til sidevisninger' : 'Legg til egendefinerte hendelser'}
                          className="block w-full cursor-pointer rounded-md border-1 border-dashed border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-3 py-3 text-left hover:border-(--ax-border-neutral) hover:bg-[var(--ax-bg-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ax-border-accent)"
                        >
                          <p className="text-sm font-semibold" style={{ color: 'var(--ax-text-subtle)' }}>
                            {isPageviews ? '+ Legg til sidevisninger' : '+ Legg til egendefinerte hendelser'}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(showFilterPanelOnly || showActiveFilters) && (
        <div className="mt-4">
          <div className={showFilterPanelOnly ? undefined : 'bg-(--ax-bg-default) p-4 rounded-md border shadow-inner'}>
            <Tabs defaultValue="flere_valg" size="small">
              {!showFilterPanelOnly && (
                <Tabs.List>
                  <Tabs.Tab value="flere_valg" label="Filtre" />
                  <Tabs.Tab value="active_filters" label={`Aktive filtre (${activeFilterCount})`} />
                </Tabs.List>
              )}

              <Tabs.Panel value="flere_valg" className={showFilterPanelOnly ? 'pt-1' : 'pt-6'}>
                <div className="mb-4">
                  {hasActivatedEventType && (
                    <div
                      className={`flex gap-2 items-center bg-[var(--ax-bg-default)] p-3 rounded-md border border-[var(--ax-border-neutral-subtle)] ${showFilterPanelOnly ? 'mb-6' : 'mt-3 mb-6'}`}
                    >
                      <Select
                        label="Legg til filtre"
                        onChange={(e) => {
                          const val = e.target.value
                          if (val) {
                            if (
                              !showFilterPanelOnly &&
                              (val === 'event_name' || val === '_custom_param_') &&
                              customEventsMode === 'none'
                            ) {
                              setCustomEventsMode('all')
                              handleEventTypeChange('custom_events', true)
                            }

                            if (val === '_custom_param_' && onEnableCustomEvents) {
                              onEnableCustomEvents(true)
                            }

                            if (addFilter) {
                              addFilter(val)
                            }
                            ;(e.target as HTMLSelectElement).value = ''
                          }
                        }}
                        size="small"
                        className="grow"
                      >
                        <option value="">Velg filter...</option>
                        {FILTER_COLUMNS &&
                          Object.entries(FILTER_COLUMNS).map(([groupKey, group]) => (
                            <optgroup key={groupKey} label={group.label}>
                              {group.columns
                                .filter((col) => col.value !== 'created_at')
                                .flatMap((col) => [
                                  <option key={col.value} value={col.value}>
                                    {col.label}
                                  </option>,
                                  ...(col.value === 'event_name'
                                    ? [
                                        <option key={`${col.value}_custom_param_`} value="_custom_param_">
                                          Hendelsesdetaljer
                                        </option>,
                                      ]
                                    : []),
                                ])}
                            </optgroup>
                          ))}
                      </Select>
                    </div>
                  )}

                  {!hasActivatedEventType && (
                    <div className="mt-3 mb-6 text-sm text-(--ax-text-subtle)">
                      Aktiver en hendelsestype for å legge til filtre.
                    </div>
                  )}

                  {hasActivatedEventType && stagingAlertInfo?.show && (
                    <div className="mb-4 mt-4">
                      <AlertWithCloseButton variant="success" onClose={handleStagingAlertClose}>
                        {stagingAlertInfo.message}
                      </AlertWithCloseButton>
                    </div>
                  )}

                  {hasActivatedEventType && stagingFilter && setStagingFilter && (
                    <div className="mt-3 bg-(--ax-bg-default) p-4 rounded-md border shadow-sm">
                      <div className="flex-1">
                        <div className="grid gap-4">
                          {/* Column Selector */}
                          <div>
                            <Select
                              label="Kolonne"
                              value={
                                stagingFilter.column.startsWith('param_') ? stagingFilter.column : stagingFilter.column
                              }
                              onChange={(e) =>
                                setStagingFilter({ ...stagingFilter, column: e.target.value, operator: '=', value: '' })
                              }
                              size="small"
                            >
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
                                <>
                                  <option value="_custom_param_">Hendelsesdetaljer</option>
                                  {/* Keep the current parameter in the list if it's selected, so the Select shows the right label */}
                                  {stagingFilter.column.startsWith('param_') &&
                                    (() => {
                                      const selectedParam = uniqueParameters.find(
                                        (p) => `param_${getCleanParamName(p)}` === stagingFilter.column,
                                      )
                                      return (
                                        <option value={stagingFilter.column}>
                                          {selectedParam
                                            ? getParamDisplayName(selectedParam)
                                            : stagingFilter.column.replace('param_', '')}
                                        </option>
                                      )
                                    })()}
                                </>
                              )}
                            </Select>
                          </div>

                          {/* Parameter Selector (Visible when 'Hendelsesdata...' is selected) */}
                          {stagingFilter.column === '_custom_param_' && (
                            <div>
                              {isEventsLoading ? (
                                <div className="space-y-2">
                                  <Skeleton variant="text" width="30%" />
                                  <Skeleton variant="rectangle" height={40} />
                                </div>
                              ) : parameters.length === 0 ? (
                                <div className="flex flex-col gap-2">
                                  <p className="text-sm text-(--ax-text-subtle)">
                                    Fant ingen hendelsesdetaljer. Du må hente data før du kan filtrere.
                                  </p>
                                  <Button
                                    variant="secondary"
                                    size="small"
                                    onClick={() => onEnableCustomEvents && onEnableCustomEvents(true)}
                                    type="button"
                                  >
                                    Hent hendelsesdetaljer
                                  </Button>
                                </div>
                              ) : (
                                <UNSAFE_Combobox
                                  label="Velg hendelsesdetalj"
                                  description="Søk etter hendelsesdetaljen du vil filtrere på"
                                  options={uniqueParameters.map((param) => ({
                                    label: getParamDisplayName(param),
                                    value: `param_${getCleanParamName(param)}`,
                                  }))}
                                  selectedOptions={[]}
                                  onToggleSelected={(option, isSelected) => {
                                    if (isSelected && option) {
                                      setStagingFilter({
                                        ...stagingFilter,
                                        column: option, // This will switch the view to the standard operator/value selectors
                                        operator: '=',
                                        value: '',
                                      })
                                    }
                                  }}
                                  isMultiSelect={false}
                                  size="small"
                                  shouldAutocomplete={true}
                                />
                              )}
                            </div>
                          )}

                          {/* Operator and Value Selectors (Visible when a valid column is selected) */}
                          {stagingFilter.column !== '_custom_param_' && (
                            <div className="flex gap-2 items-end">
                              {stagingFilter.column !== 'created_at' && !stagingFilter.interactive && (
                                <Select
                                  label="Operator"
                                  value={stagingFilter.operator || '='}
                                  onChange={(e) => setStagingFilter({ ...stagingFilter, operator: e.target.value })}
                                  size="small"
                                  className="w-1/3"
                                >
                                  <option value="INTERACTIVE">Mottaker velger selv</option>
                                  {OPERATORS.map((op) => (
                                    <option key={op.value} value={op.value}>
                                      {op.label}
                                    </option>
                                  ))}
                                </Select>
                              )}

                              <div className="flex-1">
                                {/* Interactive Filter Info */}
                                {stagingFilter.operator === 'INTERACTIVE' && (
                                  <div className="mt-0 bg-blue-50 p-2 rounded text-sm h-full flex flex-col justify-center">
                                    <p className="font-medium text-xs">Mottaker velger selv</p>
                                    <p className="text-xs text-(--ax-text-subtle) truncate">
                                      Param:{' '}
                                      {stagingFilter.column === 'url_path'
                                        ? 'url_sti'
                                        : stagingFilter.column === 'event_name'
                                          ? 'hendelse'
                                          : stagingFilter.column.toLowerCase().replace(/[^a-z0-9_]/g, '_')}
                                    </p>
                                  </div>
                                )}

                                {/* Value Input/Select */}
                                {!['IS NULL', 'IS NOT NULL', 'INTERACTIVE'].includes(stagingFilter.operator || '') && (
                                  <>
                                    {stagingFilter.column === 'event_type' && EVENT_TYPES ? (
                                      <Select
                                        label="Verdi"
                                        value={stagingFilter.value || ''}
                                        onChange={(e) => setStagingFilter({ ...stagingFilter, value: e.target.value })}
                                        size="small"
                                      >
                                        <option value="">Velg hendelsestype</option>
                                        {EVENT_TYPES.map((type) => (
                                          <option key={type.value} value={type.value}>
                                            {type.label}
                                          </option>
                                        ))}
                                      </Select>
                                    ) : (
                                      <UNSAFE_Combobox
                                        label="Verdi"
                                        description={null}
                                        options={getOptionsForColumn(
                                          stagingFilter.column,
                                          customEventsList,
                                          availablePaths,
                                        )}
                                        selectedOptions={
                                          stagingFilter.multipleValues?.map((v) => v || '') ||
                                          (stagingFilter.value ? [stagingFilter.value] : [])
                                        }
                                        onToggleSelected={(option: string, isSelected: boolean) => {
                                          if (option) {
                                            const currentValues =
                                              stagingFilter.multipleValues ||
                                              (stagingFilter.value ? [stagingFilter.value] : [])
                                            const newValues = isSelected
                                              ? [...new Set([...currentValues, option])]
                                              : currentValues.filter((val) => val !== option)

                                            setStagingFilter({
                                              ...stagingFilter,
                                              operator: newValues.length > 1 ? 'IN' : stagingFilter.operator,
                                              multipleValues: newValues.length > 0 ? newValues : undefined,
                                              value: newValues.length > 0 ? newValues[0] : '',
                                            })
                                          }
                                        }}
                                        isMultiSelect={true}
                                        size="small"
                                        allowNewValues={stagingFilter.column !== 'event_type'}
                                        shouldAutocomplete={false}
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          variant="primary"
                          size="small"
                          onClick={() => commitStagingFilter?.()}
                          disabled={
                            !stagingFilter.operator ||
                            (!['IS NULL', 'IS NOT NULL', 'INTERACTIVE'].includes(stagingFilter.operator) &&
                              !stagingFilter.value)
                          }
                        >
                          Legg til filter
                        </Button>
                        <Button variant="tertiary" size="small" onClick={() => setStagingFilter(null)}>
                          Avbryt
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Tabs.Panel>

              {!showFilterPanelOnly && (
                <Tabs.Panel value="active_filters" className="pt-6">
                  {filters.length === 0 && (
                    <div className="text-sm text-(--ax-text-subtle)">
                      Ingen aktive filtre. Legg til et filter for å få mer spesifikke data.
                    </div>
                  )}

                  {filters.length > 0 && (
                    <div className="space-y-3">
                      {filters.map(
                        (filter, index) =>
                          !isDateRangeFilter(filter) && (
                            <div
                              key={index}
                              className="bg-(--ax-bg-default) p-3 rounded border border-(--ax-border-neutral)"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 space-y-2">
                                  <div className="flex gap-2 items-end flex-wrap">
                                    <Select
                                      label="Kolonne"
                                      value={filter.column}
                                      onChange={(e) =>
                                        updateFilter(index, { column: e.target.value, operator: '=', value: '' })
                                      }
                                      size="small"
                                      className="min-w-[150px]"
                                    >
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
                                            <option
                                              key={`param_${param.key}`}
                                              value={`param_${getCleanParamName(param)}`}
                                            >
                                              {getParamDisplayName(param)}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                    </Select>

                                    {filter.interactive ? (
                                      <div className="mb-1">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--ax-bg-accent-soft)] text-[var(--ax-text-accent)]">
                                          Mottaker velger selv
                                        </span>
                                      </div>
                                    ) : (
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
                                      Parameter:{' '}
                                      <strong>{filter.value?.toString().replace('{{', '').replace('}}', '')}</strong>
                                    </div>
                                  ) : (
                                    !['IS NULL', 'IS NOT NULL'].includes(filter.operator || '') && (
                                      <div>
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
                                      </div>
                                    )
                                  )}
                                </div>
                                <Button
                                  variant="tertiary-neutral"
                                  size="small"
                                  onClick={() => removeFilter(index)}
                                  className="mt-6"
                                >
                                  Fjern
                                </Button>
                              </div>
                            </div>
                          ),
                      )}
                    </div>
                  )}
                </Tabs.Panel>
              )}
            </Tabs>

            {showFilterPanelOnly && (
              <div className="pt-3">
                {filters.length > 0 && (
                  <div className="space-y-3">
                    {filters.map(
                      (filter, index) =>
                        !isDateRangeFilter(filter) && (
                          <div
                            key={index}
                            className="bg-(--ax-bg-default) p-3 rounded border border-(--ax-border-neutral)"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <div className="flex gap-2 items-end flex-wrap">
                                  <Select
                                    label="Kolonne"
                                    value={filter.column}
                                    onChange={(e) =>
                                      updateFilter(index, { column: e.target.value, operator: '=', value: '' })
                                    }
                                    size="small"
                                    className="min-w-[150px]"
                                  >
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
                                          <option
                                            key={`param_${param.key}`}
                                            value={`param_${getCleanParamName(param)}`}
                                          >
                                            {getParamDisplayName(param)}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </Select>

                                  {filter.interactive ? (
                                    <div className="mb-1">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--ax-bg-accent-soft)] text-[var(--ax-text-accent)]">
                                        Mottaker velger selv
                                      </span>
                                    </div>
                                  ) : (
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
                                    Parameter:{' '}
                                    <strong>{filter.value?.toString().replace('{{', '').replace('}}', '')}</strong>
                                  </div>
                                ) : (
                                  !['IS NULL', 'IS NOT NULL'].includes(filter.operator || '') && (
                                    <div>
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
                                    </div>
                                  )
                                )}
                              </div>
                              <Button
                                variant="tertiary-neutral"
                                size="small"
                                onClick={() => removeFilter(index)}
                                className="mt-6"
                              >
                                Fjern
                              </Button>
                            </div>
                          </div>
                        ),
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default EventSelector
