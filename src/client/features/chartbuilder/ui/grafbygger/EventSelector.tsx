import { useState } from 'react'
import {
  RadioGroup,
  Radio,
  Select,
  UNSAFE_Combobox,
  Button,
  Label,
  Skeleton,
  ReadMore,
  Tag,
  VStack,
} from '@navikt/ds-react'
import { XMarkIcon, PlusIcon, CheckmarkIcon } from '@navikt/aksel-icons'
import type { Filter, Parameter } from '../../../../shared/types/chart.ts'

// ─── Local types ─────────────────────────────────────────────────────────────

type Option = { label: string; value: string }
type FilterColumn = { value: string; label: string }
type FilterColumnGroup = { label: string; columns: FilterColumn[] }
type FilterColumns = Record<string, FilterColumnGroup>
type EventTypeId = 'pageviews' | 'custom_events'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Maps "partial-match" operators to their Norwegian description strings. */
const PARTIAL_MATCH_DESCRIPTIONS: Record<string, string> = {
  LIKE: 'Søket vil inneholde verdien uavhengig av posisjon',
  STARTS_WITH: 'Søket vil finne stier som starter med verdien',
  ENDS_WITH: 'Søket vil finne stier som slutter med verdien',
}

/**
 * Same descriptions re-used for the event-name combobox — the phrasing is
 * slightly different so we keep a separate map.
 */
const EVENT_PARTIAL_MATCH_DESCRIPTIONS: Record<string, string> = {
  LIKE: 'Søket vil matche hendelser som inneholder verdien',
  STARTS_WITH: 'Søket vil finne hendelser som starter med verdien',
  ENDS_WITH: 'Søket vil finne hendelser som slutter med verdien',
}

/** Returns the last segment of a dotted param key (e.g. "foo.bar" → "bar"). */
const getParamName = (param: Parameter): string => {
  const parts = param.key.split('.')
  return parts[parts.length - 1]
}

// ─── Shared primitives ────────────────────────────────────────────────────────

/** Outer wrapper card shared by every active row. */
const FilterCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-(--ax-border-neutral-subtle) bg-(--ax-bg-default) px-3 py-3">{children}</div>
)

// ─── SelectableValuesCombobox ─────────────────────────────────────────────────
//
// Unified combobox used for both URL-path and event-name selection.
// Renders a multi-select combobox when operator is "IN", and a single-select
// combobox for all other operators (LIKE, STARTS_WITH, ENDS_WITH, etc.).

interface SelectableValuesComboboxProps {
  operator: string
  options: Option[]
  selectedValues: string[]
  onToggle: (value: string, isSelected: boolean) => void
  multiLabel: string
  multiDescription?: string
  singleLabel: string
  partialMatchDescriptions?: Record<string, string>
}

const SelectableValuesCombobox = ({
  operator,
  options,
  selectedValues,
  onToggle,
  multiLabel,
  multiDescription,
  singleLabel,
  partialMatchDescriptions = PARTIAL_MATCH_DESCRIPTIONS,
}: SelectableValuesComboboxProps) => {
  if (operator === 'IN') {
    return (
      <UNSAFE_Combobox
        label={multiLabel}
        description={multiDescription}
        options={options}
        selectedOptions={selectedValues}
        onToggleSelected={onToggle}
        isMultiSelect
        size="small"
        allowNewValues
      />
    )
  }

  return (
    <UNSAFE_Combobox
      label={singleLabel}
      description={partialMatchDescriptions[operator] ?? null}
      options={options}
      selectedOptions={selectedValues.length > 0 ? [selectedValues[0]] : []}
      onToggleSelected={(option, isSelected) => onToggle(option, isSelected)}
      isMultiSelect={false}
      size="small"
      allowNewValues
    />
  )
}

// ─── PageviewsEditor ──────────────────────────────────────────────────────────

interface PageviewsEditorProps {
  pageViewsMode: 'all' | 'specific' | 'interactive'
  setPageViewsMode: (mode: 'all' | 'specific' | 'interactive') => void
  urlPathOperator: string
  setUrlPathOperator: (op: string) => void
  selectedPaths: string[]
  handlePathsChange: (paths: string[], operator: string, isInteractive?: boolean) => void
  availablePaths: string[]
  OPERATORS: Option[]
}

const normalizeUrlPath = (input: string): string => {
  const trimmed = input.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) return trimmed

  const toPathname = (value: string): string => {
    try {
      return new URL(value).pathname || '/'
    } catch {
      return value
    }
  }

  if (trimmed.includes('://')) return toPathname(trimmed)

  const looksLikeHost = /^[^/\s]+\.[^/\s]+(?:\/.*)?$/.test(trimmed)
  if (looksLikeHost) return toPathname(`https://${trimmed}`)

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const PageviewsEditor = ({
  pageViewsMode,
  setPageViewsMode,
  urlPathOperator,
  setUrlPathOperator,
  selectedPaths,
  handlePathsChange,
  availablePaths,
  OPERATORS,
}: PageviewsEditorProps) => {
  const handleModeChange = (val: string) => {
    const newMode = val as 'all' | 'specific' | 'interactive'
    setPageViewsMode(newMode)
    handlePathsChange([], 'IN')
    if (newMode === 'interactive') {
      handlePathsChange(['{{url_sti}}'], '=', true)
    }
  }

  const handleOperatorChange = (newOperator: string) => {
    setUrlPathOperator(newOperator)

    const switchingToMulti = newOperator === 'IN' && selectedPaths.length <= 1
    const switchingFromMulti = urlPathOperator === 'IN' && newOperator !== 'IN'

    if (switchingToMulti || switchingFromMulti) {
      const pathValue = selectedPaths.length > 0 ? selectedPaths[0] : ''
      handlePathsChange(newOperator === 'IN' ? selectedPaths : [pathValue], newOperator)
    } else {
      handlePathsChange(selectedPaths, newOperator)
    }
  }

  const handlePathToggle = (option: string, isSelected: boolean) => {
    const normalizedPath = normalizeUrlPath(option)
    if (!normalizedPath) return

    if (urlPathOperator === 'IN') {
      const newSelection = isSelected
        ? Array.from(new Set([...selectedPaths, normalizedPath]))
        : selectedPaths.filter((p) => p !== normalizedPath)
      handlePathsChange(newSelection, urlPathOperator)
    } else {
      handlePathsChange(isSelected ? [normalizedPath] : [], urlPathOperator)
    }
  }

  return (
    <div className="space-y-3">
      <RadioGroup legend="Sidevisninger" hideLegend value={pageViewsMode} onChange={handleModeChange} size="small">
        <Radio value="interactive">Side velges via filter i dashboardet</Radio>
        <Radio value="all">Hele nettsiden</Radio>
        <Radio value="specific">Lås til bestemte sider</Radio>
      </RadioGroup>

      {pageViewsMode === 'specific' && (
        <div className="space-y-3 pt-1">
          <Select
            label="URL"
            value={urlPathOperator}
            onChange={(e) => handleOperatorChange(e.target.value)}
            size="small"
            className="w-full md:w-1/3"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </Select>

          <SelectableValuesCombobox
            operator={urlPathOperator}
            options={availablePaths.map((p) => ({ label: p, value: p }))}
            selectedValues={selectedPaths}
            onToggle={handlePathToggle}
            multiLabel="Velg URL-stier"
            multiDescription="Flere stier kan velges for 'er lik' operator"
            singleLabel="Legg til en eller flere URL-stier"
            partialMatchDescriptions={PARTIAL_MATCH_DESCRIPTIONS}
          />

          {selectedPaths.length === 0 && (
            <p className="mt-2 text-xs text-(--ax-text-subtle)">Når tom vises alle sidevisninger</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EventParamFilter ─────────────────────────────────────────────────────────
//
// The optional "filter on event details" section inside CustomEventsEditor.

interface EventParamFilterProps {
  filters: Filter[]
  parameters: Parameter[]
  uniqueParameters: Parameter[]
  filteredUniqueParams: Parameter[]
  isLoading: boolean
  OPERATORS: Option[]
  updateFilter: (index: number, updates: Partial<Filter>) => void
  addFilterDirectly?: (filter: Filter) => void
  onFetchParams: () => void
}

const EventParamFilter = ({
  filters,
  parameters,
  filteredUniqueParams,
  isLoading,
  OPERATORS,
  updateFilter,
  addFilterDirectly,
  onFetchParams,
}: EventParamFilterProps) => {
  const [selectedEventParam, setSelectedEventParam] = useState<string>('')
  const [eventParamOperator, setEventParamOperator] = useState<string>('=')
  const [eventParamValue, setEventParamValue] = useState<string>('')

  const handleAddFilter = (valueOverride?: string) => {
    const value = valueOverride ?? eventParamValue
    if (!selectedEventParam || !value) return

    const existingIndex = filters.findIndex((f) => f.column === selectedEventParam)
    if (existingIndex >= 0) {
      updateFilter(existingIndex, { operator: eventParamOperator, value })
    } else if (addFilterDirectly) {
      addFilterDirectly({ column: selectedEventParam, operator: eventParamOperator, value })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="rectangle" height={40} />
        <div className="flex gap-2">
          <Skeleton variant="rectangle" height={40} width="33%" />
          <Skeleton variant="rectangle" height={40} className="flex-1" />
        </div>
      </div>
    )
  }

  if (parameters.length === 0) {
    return (
      <>
        <Label as="p" size="small" className="mb-2">
          Filtrer på hendelsesdetaljer (valgfritt)
        </Label>
        <div className="mt-3">
          <Button variant="secondary" size="small" onClick={onFetchParams}>
            Hent hendelsesdetaljer
          </Button>
        </div>
      </>
    )
  }

  return (
    <div className="space-y-3">
      <UNSAFE_Combobox
        label="Velg hendelsesdetaljer (valgfritt)"
        options={filteredUniqueParams.map((param) => ({
          label: getParamName(param),
          value: `param_${getParamName(param)}`,
        }))}
        selectedOptions={selectedEventParam ? [selectedEventParam] : []}
        onToggleSelected={(option, isSelected) => {
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
        <div className="flex items-end gap-2">
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
              onToggleSelected={(option, isSelected) => {
                if (option) {
                  const newValue = isSelected ? option : ''
                  setEventParamValue(newValue)
                  if (isSelected && newValue && selectedEventParam) {
                    handleAddFilter(newValue)
                  }
                }
              }}
              isMultiSelect={false}
              size="small"
              allowNewValues
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CustomEventsEditor ───────────────────────────────────────────────────────

interface CustomEventsEditorProps {
  customEventsMode: 'none' | 'all' | 'specific' | 'interactive'
  setCustomEventsMode: (mode: 'none' | 'all' | 'specific' | 'interactive') => void
  eventNameOperator: string
  setEventNameOperator: (op: string) => void
  customEvents: string[]
  customEventsList: string[]
  handleCustomEventsChange: (events: string[], operator: string, forceEnable?: boolean) => void
  handleEventTypeChange: (eventType: string, isChecked: boolean) => void
  onEnableCustomEvents?: (withParams?: boolean) => void
  eventLookbackDays: number
  onEventLookbackDaysChange?: (days: number) => void
  isEventsLoading: boolean
  // EventParamFilter passthrough
  filters: Filter[]
  parameters: Parameter[]
  uniqueParameters: Parameter[]
  OPERATORS: Option[]
  updateFilter: (index: number, updates: Partial<Filter>) => void
  addFilterDirectly?: (filter: Filter) => void
}

const CustomEventsEditor = ({
  customEventsMode,
  setCustomEventsMode,
  eventNameOperator,
  setEventNameOperator,
  customEvents,
  customEventsList,
  handleCustomEventsChange,
  handleEventTypeChange,
  onEnableCustomEvents,
  eventLookbackDays,
  onEventLookbackDaysChange,
  isEventsLoading,
  filters,
  parameters,
  uniqueParameters,
  OPERATORS,
  updateFilter,
  addFilterDirectly,
}: CustomEventsEditorProps) => {
  const [hasRequestedParams, setHasRequestedParams] = useState(false)
  const isParamsLoading = hasRequestedParams && isEventsLoading

  const filteredParameters = parameters.filter((param) => {
    if (customEvents.length === 0) return true
    const eventName = param.key.includes('.') ? param.key.split('.')[0] : 'Andre'
    return customEvents.some((e) => e.toLowerCase() === eventName.toLowerCase())
  })

  const filteredUniqueParams = filteredParameters.reduce<Parameter[]>((acc, param) => {
    const name = getParamName(param)
    if (!acc.some((p) => getParamName(p) === name)) acc.push(param)
    return acc
  }, [])

  const handleModeChange = (val: string) => {
    const newMode = val as 'all' | 'specific' | 'interactive'

    if (onEnableCustomEvents && customEventsList.length === 0) onEnableCustomEvents(false)

    handleEventTypeChange('custom_events', true)
    setCustomEventsMode(newMode)

    if (newMode === 'interactive') {
      handleCustomEventsChange([], 'IN')
      handleCustomEventsChange(['{{event_name}}'], '=')
    }
  }

  const handleEventToggle = (option: string, isSelected: boolean) => {
    if (!option) return
    if (eventNameOperator === 'IN') {
      const newSelection = isSelected ? [...customEvents, option] : customEvents.filter((e) => e !== option)
      handleCustomEventsChange(newSelection, eventNameOperator)
    } else {
      handleCustomEventsChange(isSelected ? [option] : [], eventNameOperator)
    }
  }

  const showLoading = isEventsLoading && !isParamsLoading && customEventsList.length === 0
  const showSpecificContent = !isEventsLoading || isParamsLoading

  return (
    <div className="space-y-3">
      <RadioGroup legend="Egne hendelser" hideLegend value={customEventsMode} onChange={handleModeChange} size="small">
        <Radio value="specific">Utvalgte hendelser</Radio>
        <Radio value="all">Alle hendelser</Radio>
        <Radio value="interactive">Filter der mottaker velger selv i dashboardet</Radio>
      </RadioGroup>

      {customEventsMode === 'specific' && (
        <div className="space-y-3 pt-1">
          {showLoading && (
            <div className="mb-4 space-y-3">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="rectangle" height={40} />
              <Skeleton variant="rectangle" height={40} />
            </div>
          )}

          {showSpecificContent && (
            <Select
              label="Hendelsesnavn"
              value={eventNameOperator}
              onChange={(e) => {
                const newOperator = e.target.value
                setEventNameOperator(newOperator)
                if (customEvents.length > 0) {
                  handleCustomEventsChange(customEvents, newOperator)
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
          )}

          {showSpecificContent && (
            <SelectableValuesCombobox
              operator={eventNameOperator}
              options={customEventsList.map((event) => ({ label: event, value: event }))}
              selectedValues={customEvents}
              onToggle={handleEventToggle}
              multiLabel="Velg hendelser"
              multiDescription="Flere hendelser kan velges for 'er lik' operator"
              singleLabel="Velg hendelse"
              partialMatchDescriptions={EVENT_PARTIAL_MATCH_DESCRIPTIONS}
            />
          )}

          {customEvents.length > 0 && (
            <div className="mt-6 border-t border-(--ax-border-neutral-subtle) pt-4">
              <EventParamFilter
                filters={filters}
                parameters={parameters}
                uniqueParameters={uniqueParameters}
                filteredUniqueParams={filteredUniqueParams}
                isLoading={isParamsLoading || isEventsLoading}
                OPERATORS={OPERATORS}
                updateFilter={updateFilter}
                addFilterDirectly={addFilterDirectly}
                onFetchParams={() => {
                  setHasRequestedParams(true)
                  onEnableCustomEvents?.(true)
                }}
              />
            </div>
          )}
        </div>
      )}

      {customEventsMode === 'interactive' && (
        <div className="flex items-center gap-3 pt-1">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100">
            <CheckmarkIcon aria-hidden className="text-green-600" fontSize="1rem" />
          </span>
          <p className="text-(--ax-text-default)">Hendelsesnavn kan velges som filtervalg</p>
        </div>
      )}

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
  )
}

// ─── EventTypeCard ────────────────────────────────────────────────────────────

interface EventTypeCardProps {
  eventType: EventTypeId
  isEditorOpen: boolean
  onToggleEditor: () => void
  onRemove: () => void
  summary: string
  customEventsMode?: 'none' | 'all' | 'specific' | 'interactive'
  customEventsCount?: number
  editor: React.ReactNode
}

const EventTypeCard = ({
  eventType,
  isEditorOpen,
  onToggleEditor,
  onRemove,
  summary,
  customEventsMode,
  customEventsCount = 0,
  editor,
}: EventTypeCardProps) => {
  const isPageviews = eventType === 'pageviews'
  const title = isPageviews ? 'Sidevisninger' : 'Egne hendelser'

  return (
    <FilterCard>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[170px]">
          <p className="text-sm font-semibold event-selector-title">{title}</p>
          {summary && <p className="text-xs event-selector-summary">{summary}</p>}
        </div>

        {!isPageviews && customEventsMode === 'specific' && customEventsCount > 0 && (
          <Tag variant="neutral" size="xsmall">
            {customEventsCount} valg
          </Tag>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!isPageviews && (
            <Button variant="tertiary" size="xsmall" onClick={onToggleEditor}>
              {isEditorOpen ? 'Lukk' : 'Rediger'}
            </Button>
          )}
          <Button
            variant="tertiary"
            data-color="danger"
            size="xsmall"
            icon={<XMarkIcon aria-hidden />}
            onClick={onRemove}
          >
            Fjern
          </Button>
        </div>
      </div>

      {isEditorOpen && <div className="mt-3 border-t border-(--ax-border-neutral-subtle) pt-3">{editor}</div>}
    </FilterCard>
  )
}

// ─── GenericFilterCard ────────────────────────────────────────────────────────

/** Maps a filter column key to a human-friendly param name for the interactive template. */
const toParamName = (column: string): string => {
  if (column === 'url_path') return 'url_sti'
  if (column === 'event_name') return 'hendelse'
  return column.toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

interface GenericFilterCardProps {
  filter: Filter
  index: number
  columnLabel: string
  OPERATORS: Option[]
  FILTER_COLUMNS?: FilterColumns
  parameters: Parameter[]
  uniqueParameters: Parameter[]
  customEventsList: string[]
  availablePaths: string[]
  EVENT_TYPES?: Option[]
  removeFilter: (index: number) => void
  updateFilter: (index: number, updates: Partial<Filter>) => void
}

const GenericFilterCard = ({
  filter,
  index,
  columnLabel,
  OPERATORS,
  FILTER_COLUMNS,
  parameters,
  uniqueParameters,
  customEventsList,
  availablePaths,
  EVENT_TYPES,
  removeFilter,
  updateFilter,
}: GenericFilterCardProps) => {
  const getOptionsForColumn = (column: string): Option[] => {
    switch (column) {
      case 'event_name':
        return customEventsList.map((event) => ({ label: event || '', value: event || '' }))
      case 'url_path':
        return availablePaths.map((path) => ({ label: path, value: path }))
      case 'event_type':
        return EVENT_TYPES ?? []
      default:
        return []
    }
  }

  const currentValues: string[] = Array.isArray(filter.multipleValues)
    ? filter.multipleValues
    : filter.value
      ? [filter.value]
      : []

  const handleValueToggle = (option: string, isSelected: boolean) => {
    if (!option) return
    const newValues = isSelected ? [...new Set([...currentValues, option])] : currentValues.filter((v) => v !== option)

    updateFilter(index, {
      operator: newValues.length > 1 ? 'IN' : filter.operator,
      multipleValues: newValues.length > 0 ? newValues : undefined,
      value: newValues.length > 0 ? newValues[0] : '',
    })
  }

  const makeInteractive = () => {
    updateFilter(index, {
      operator: '=',
      value: `{{${toParamName(filter.column)}}}`,
      metabaseParam: true,
      interactive: true,
    })
  }

  return (
    <FilterCard>
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="grow text-xs font-semibold text-(--ax-text-default)">{columnLabel}</span>
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

      {/* Controls */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
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
                  <option key={`param_${param.key}`} value={`param_${getParamName(param)}`}>
                    {getParamName(param)}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>

          {!filter.interactive && (
            <Button variant="tertiary" size="small" className="mb-1" onClick={makeInteractive}>
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
          <div className="rounded bg-[var(--ax-bg-accent-soft)] p-2 text-sm text-[var(--ax-text-default)]">
            Parameter: <strong>{filter.value?.toString().replace('{{', '').replace('}}', '')}</strong>
          </div>
        ) : (
          !['IS NULL', 'IS NOT NULL'].includes(filter.operator || '') && (
            <UNSAFE_Combobox
              label="Verdi"
              description={null}
              options={getOptionsForColumn(filter.column)}
              selectedOptions={currentValues}
              onToggleSelected={handleValueToggle}
              isMultiSelect={true}
              size="small"
              allowNewValues={filter.column !== 'event_type'}
              shouldAutocomplete={false}
            />
          )
        )}
      </div>
    </FilterCard>
  )
}

// ─── EventSelector ────────────────────────────────────────────────────────────

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
  OPERATORS: Option[]
  eventLookbackDays?: number
  onEventLookbackDaysChange?: (days: number) => void
  onEnableCustomEvents?: (withParams?: boolean) => void
  parameters?: Parameter[]
  uniqueParameters?: Parameter[]
  FILTER_COLUMNS?: FilterColumns
  EVENT_TYPES?: Option[]
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
  const [openEditors, setOpenEditors] = useState<Record<EventTypeId, boolean>>({
    pageviews: false,
    custom_events: false,
  })

  const toggleEditor = (eventType: EventTypeId) =>
    setOpenEditors((prev) => ({ ...prev, [eventType]: !prev[eventType] }))

  const addEventType = (eventType: EventTypeId) => {
    handleEventTypeChange(eventType, true)

    if (eventType === 'custom_events') {
      if (onEnableCustomEvents && customEventsList.length === 0) onEnableCustomEvents(false)
    }

    setOpenEditors((prev) => ({ ...prev, [eventType]: true }))
  }

  const removeEventType = (eventType: EventTypeId) => {
    handleEventTypeChange(eventType, false)
    setOpenEditors((prev) => ({ ...prev, [eventType]: false }))
  }

  // Filters that are managed by an event-type card (event_type, url_path,
  // event_name) are never shown in the generic list — the cards own them.
  const isCardOwnedFilter = (filter: Filter): boolean => {
    if (showFilterPanelOnly) return false
    if (filter.column === 'event_type') return true
    if (filter.column === 'url_path') return selectedEventTypes.includes('pageviews')
    if (filter.column === 'event_name') return selectedEventTypes.includes('custom_events')
    return false
  }

  const getColumnLabel = (column: string): string => {
    if (FILTER_COLUMNS) {
      for (const group of Object.values(FILTER_COLUMNS)) {
        const match = group.columns.find((c) => c.value === column)
        if (match) return match.label
      }
    }
    if (column.startsWith('param_')) {
      const paramName = column.replace('param_', '')
      const match = uniqueParameters.find((p) => getParamName(p) === paramName)
      return match ? getParamName(match) : paramName
    }
    return column
  }

  const pageviewsSummary: string = (() => {
    if (pageViewsMode === 'interactive') return ''
    if (pageViewsMode === 'all') return 'Standard: Hele nettsiden'
    if (selectedPaths.length > 0) return `Låst til ${selectedPaths.length} side${selectedPaths.length === 1 ? '' : 'r'}`
    return 'Låst til bestemte sider'
  })()

  const customEventsSummary: string = (() => {
    if (customEventsMode === 'interactive') return 'Standard: Mottaker velger hendelse i dashboardet'
    if (customEventsMode === 'all') return 'Standard: Alle hendelser'
    if (customEvents.length > 0)
      return `${customEvents.length} valgt${customEvents.length === 1 ? '' : 'e'} hendelse${customEvents.length === 1 ? '' : 'r'}`
    return 'Velg hendelser'
  })()

  const selectedEventTypeOrder = (['pageviews', 'custom_events'] as EventTypeId[]).filter((id) =>
    selectedEventTypes.includes(id),
  )

  const visibleFilters = filters.filter((f) => !isDateRangeFilter(f) && !isCardOwnedFilter(f))

  return (
    <div className="mb-1 mt-3 space-y-3">
      {/* ── Active event-type cards ─────────────────────────────────────── */}
      {!showFilterPanelOnly &&
        selectedEventTypeOrder.map((eventType) => {
          const isPageviews = eventType === 'pageviews'
          const isEditorOpen = isPageviews || openEditors[eventType]
          const summary = isPageviews ? pageviewsSummary : customEventsSummary

          const editor = isPageviews ? (
            <PageviewsEditor
              pageViewsMode={pageViewsMode}
              setPageViewsMode={setPageViewsMode}
              urlPathOperator={urlPathOperator}
              setUrlPathOperator={setUrlPathOperator}
              selectedPaths={selectedPaths}
              handlePathsChange={handlePathsChange}
              availablePaths={availablePaths}
              OPERATORS={OPERATORS}
            />
          ) : (
            <CustomEventsEditor
              customEventsMode={customEventsMode}
              setCustomEventsMode={setCustomEventsMode}
              eventNameOperator={eventNameOperator}
              setEventNameOperator={setEventNameOperator}
              customEvents={customEvents}
              customEventsList={customEventsList}
              handleCustomEventsChange={handleCustomEventsChange}
              handleEventTypeChange={handleEventTypeChange}
              onEnableCustomEvents={onEnableCustomEvents}
              eventLookbackDays={eventLookbackDays}
              onEventLookbackDaysChange={onEventLookbackDaysChange}
              isEventsLoading={isEventsLoading}
              filters={filters}
              parameters={parameters}
              uniqueParameters={uniqueParameters}
              OPERATORS={OPERATORS}
              updateFilter={updateFilter}
              addFilterDirectly={addFilterDirectly}
            />
          )

          return (
            <EventTypeCard
              key={eventType}
              eventType={eventType}
              isEditorOpen={isEditorOpen}
              onToggleEditor={() => toggleEditor(eventType)}
              onRemove={() => removeEventType(eventType)}
              summary={summary}
              customEventsMode={customEventsMode}
              customEventsCount={customEvents.length}
              editor={editor}
            />
          )
        })}

      {/* ── Active generic filters ──────────────────────────────────────── */}
      {visibleFilters.map((filter) => {
        const index = filters.indexOf(filter)
        return (
          <GenericFilterCard
            key={index}
            filter={filter}
            index={index}
            columnLabel={getColumnLabel(filter.column)}
            OPERATORS={OPERATORS}
            FILTER_COLUMNS={FILTER_COLUMNS}
            parameters={parameters}
            uniqueParameters={uniqueParameters}
            customEventsList={customEventsList}
            availablePaths={availablePaths}
            EVENT_TYPES={EVENT_TYPES}
            removeFilter={removeFilter}
            updateFilter={updateFilter}
          />
        )
      })}

      {/* ── Add buttons ─────────────────────────────────────────────────── */}
      {(!showFilterPanelOnly &&
        (!selectedEventTypes.includes('pageviews') || !selectedEventTypes.includes('custom_events'))) ||
      addFilterDirectly ? (
        <div>
          {!showFilterPanelOnly &&
            (!selectedEventTypes.includes('pageviews') || !selectedEventTypes.includes('custom_events')) && (
              <div className="mb-3">
                <VStack gap="space-6" align={'start'}>
                  {!selectedEventTypes.includes('pageviews') && (
                    <Button
                      variant="secondary"
                      size="small"
                      style={{ backgroundColor: 'var(--inn-bg-white-soft)' }}
                      icon={<PlusIcon aria-hidden />}
                      onClick={() => addEventType('pageviews')}
                    >
                      Sidevisninger
                    </Button>
                  )}
                  {!selectedEventTypes.includes('custom_events') && (
                    <Button
                      variant="secondary"
                      size="small"
                      style={{ backgroundColor: 'var(--inn-bg-white-soft)' }}
                      icon={<PlusIcon aria-hidden />}
                      onClick={() => addEventType('custom_events')}
                    >
                      Egne hendelser
                    </Button>
                  )}
                </VStack>
                <div className="mt-3 border-t border-(--ax-border-subtle)" />
              </div>
            )}

          <Button
            variant="tertiary"
            size="small"
            icon={<PlusIcon aria-hidden />}
            onClick={() => addFilterDirectly?.({ column: '', operator: '=', value: '' })}
          >
            Egendefinert filter
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default EventSelector
