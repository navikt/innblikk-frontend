import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { Alert, BodyShort, Button, Dialog, Heading, HStack, Select, UNSAFE_Combobox } from '@navikt/ds-react'
import { PlusIcon } from '@navikt/aksel-icons'
import type { Filter, Parameter } from '../../../../shared/types/chart.ts'
import type { Website } from '../../../../shared/types/website.ts'
import { FILTER_COLUMNS, OPERATORS } from '../../../../shared/lib/constants.ts'
import { buildSidegroupSqlCondition } from '../../../../shared/lib/sidegroupSql.ts'
import { useSidegroupsForWebsite } from '../../../sidegroups/hooks/useSidegroupsForWebsite.ts'
import { SidegroupEditor, type SidegroupEditorRef } from '../../../sidegroups/ui/SidegroupEditorPage.tsx'
import type { Sidegroup } from '../../../sidegroups/model/types.ts'
import { CustomEventsEditor, GenericFilterCard } from './EventSelector.tsx'
import { defaultPageFilter, getEventSelection, setEventSelection } from '../../utils/eventSelection.ts'
import FilterCard from './FilterCard.tsx'
import { FILTER_DESCRIPTIONS } from './filterDescriptions.ts'
import FilterTypePicker from './FilterTypePicker.tsx'
import { getChartColumnLabel } from '../../model/columnLabels.ts'
import OptionExplanation from '../../../../shared/ui/DescribedCombobox/OptionExplanation.tsx'
import { getDefaultFilterOperator } from '../../model/filterOperators.ts'

interface NextEventFilterProps {
  filters: Filter[]
  parameters: Parameter[]
  setFilters: React.Dispatch<React.SetStateAction<Filter[]>>
  website?: Website
  availableEvents?: string[]
  onEnableCustomEvents?: (withParams?: boolean) => void
  onDirtyStateChange?: (dirty: boolean) => void
  dateRangeInDays?: number
  onDateRangeInDaysChange?: (days: number) => void
  isEventsLoading?: boolean
  additionalAction?: React.ReactNode
}

const NextEventFilter = forwardRef(
  (
    {
      filters,
      parameters,
      setFilters,
      website,
      availableEvents = [],
      onEnableCustomEvents,
      onDirtyStateChange,
      dateRangeInDays = 7,
      onDateRangeInDaysChange,
      isEventsLoading = false,
      additionalAction,
    }: NextEventFilterProps,
    ref,
  ) => {
    const initialized = useRef(false)
    const websiteId = website?.id
    const eventInputRef = useRef<HTMLInputElement>(null)
    const nudgeTitleId = useId()
    const [validationAttempted, setValidationAttempted] = useState(false)
    const [addingFilter, setAddingFilter] = useState(false)
    const [showEventOptions, setShowEventOptions] = useState(false)
    const [customMode, setCustomMode] = useState<'none' | 'all' | 'specific' | 'interactive' | null>(null)
    const [eventOperator, setEventOperator] = useState('IN')
    const [eventSearch, setEventSearch] = useState('')
    const [creatingSidegroupIndex, setCreatingSidegroupIndex] = useState<number | null>(null)
    const [createdSidegroups, setCreatedSidegroups] = useState<Sidegroup[]>([])
    const sidegroupEditorRef = useRef<SidegroupEditorRef>(null)
    const sidegroupTriggerRef = useRef<HTMLButtonElement>(null)
    const selection = getEventSelection(filters)
    const names = selection.names
    const paths = filters.find((filter) => filter.column === 'url_path')
    const {
      sidegroups,
      loading: groupsLoading,
      error: groupsError,
    } = useSidegroupsForWebsite(paths?.rawExpression ? websiteId : undefined)
    const selectableSidegroups = [
      ...sidegroups,
      ...createdSidegroups.filter((group) => !sidegroups.some((item) => String(item.id) === String(group.id))),
    ]
    const customEventsList = Array.from(
      new Set(availableEvents.filter((event) => event && !event.startsWith('/') && !/^pageview/i.test(event))),
    ).sort((a, b) => a.localeCompare(b, 'nb'))
    const availablePaths = availableEvents.filter((event) => event?.startsWith('/'))
    const uniqueParameters = parameters.filter(
      (param, index) =>
        parameters.findIndex((other) => other.key.split('.').pop() === param.key.split('.').pop()) === index,
    )
    const isAdvanced = Boolean(names && (names.interactive || !['IN', '='].includes(names.operator ?? '')))
    const customValues = names?.multipleValues ?? (names?.value ? [names.value] : [])
    const selectedValues = [
      ...(selection.pageviews ? ['pageviews'] : []),
      ...(selection.custom
        ? isAdvanced
          ? ['advanced']
          : names
            ? customValues.map((name) => `event:${name}`)
            : ['all-custom']
        : []),
    ]
    const eventOptions = [
      { label: 'Sidevisninger', value: 'pageviews' },
      ...Array.from(new Set([...customEventsList, ...(!isAdvanced ? customValues : [])])).map((event) => ({
        label: event,
        value: `event:${event}`,
      })),
      ...(selection.custom && !names ? [{ label: 'Alle egne hendelser', value: 'all-custom' }] : []),
      ...(isAdvanced ? [{ label: 'Eget hendelsesutvalg', value: 'advanced' }] : []),
    ]
    const normalizedEventSearch = eventSearch.trim().toLocaleLowerCase('nb')
    const filterChoices = [
      { label: getChartColumnLabel('url_path'), value: 'url_path' },
      { label: getChartColumnLabel('url_query'), value: 'url_query' },
      { label: 'Sidegruppe', value: 'sidegroup' },
      ...Object.values(FILTER_COLUMNS)
        .flatMap((group) => group.columns)
        .filter(
          (column) =>
            !['event_type', 'event_name', 'url_path', 'url_query', 'url_fullpath', 'created_at'].includes(column.value),
        ),
      ...uniqueParameters.map((param) => ({
        label: param.key.split('.').pop() ?? param.key,
        value: `param_${param.key.split('.').pop()}`,
      })),
      { label: 'Hendelsesutvalg (avansert)', value: 'event-options' },
    ].map((option) => ({ ...option, label: getChartColumnLabel(option.value, option.label) }))
    const filterOptions = filterChoices.map((option) => ({
      value: option.value,
      label: option.label,
      description: FILTER_DESCRIPTIONS[option.value]?.description ?? 'Egenskap som sendes med hendelsen',
      example: FILTER_DESCRIPTIONS[option.value]?.example,
    }))
    const visibleFilters = filters.filter(
      (filter) =>
        !['event_type', 'event_name', 'created_at'].includes(filter.column) &&
        !(
          filter.column === 'url_path' &&
          filter.interactive &&
          filter.value === '{{url_sti}}' &&
          !filter.showInFilterEditor
        ),
    )

    useEffect(() => {
      if (initialized.current) return
      initialized.current = true
      setFilters((previous) =>
        previous.some((filter) => filter.column === 'event_type' || filter.column === 'event_name')
          ? previous
          : [...setEventSelection(previous, false, false), ...(paths ? [] : [defaultPageFilter])],
      )
    }, [paths, setFilters])

    const dirty = selectedValues.length > 0 || visibleFilters.length > 0
    useEffect(() => onDirtyStateChange?.(dirty), [dirty, onDirtyStateChange])

    const updateSelection = (pageviews: boolean, custom: boolean, eventNames?: Filter) => {
      if (pageviews || custom) setValidationAttempted(false)
      setFilters((previous) => setEventSelection(previous, pageviews, custom, eventNames))
    }
    const updateNames = (events: string[], operator: string) =>
      updateSelection(
        selection.pageviews,
        true,
        events.length
          ? {
              column: 'event_name',
              operator,
              value: events[0],
              multipleValues: operator === 'IN' ? events : undefined,
              ...(events[0].startsWith('{{') ? { interactive: true, metabaseParam: true } : {}),
            }
          : undefined,
      )
    const updateFilter = (index: number, updates: Partial<Filter>) => {
      setFilters((previous) =>
        previous.map((filter, i) =>
          i === index
            ? {
                ...filter,
                ...(updates.operator ? { multipleValues: undefined } : {}),
                ...updates,
              }
            : filter,
        ),
      )
    }
    const removeFilter = (index: number) => setFilters((previous) => previous.filter((_, i) => i !== index))
    const resetFilters = () => {
      setFilters((previous) => [
        ...setEventSelection(
          previous.filter((filter) => filter.column === 'created_at'),
          false,
          false,
        ),
        defaultPageFilter,
      ])
      setAddingFilter(false)
      setShowEventOptions(false)
      setCustomMode(null)
      setEventOperator('IN')
      setEventSearch('')
      setValidationAttempted(false)
    }
    useImperativeHandle(ref, () => ({
      resetFilters,
      enableCustomEvents: () => updateSelection(selection.pageviews, true, names),
      validateSelection: () => {
        const valid = selectedValues.length > 0
        setValidationAttempted(!valid)
        if (!valid) eventInputRef.current?.focus()
        return valid
      },
    }))

    return (
      <div className="space-y-3 min-w-0">
        <UNSAFE_Combobox
          ref={eventInputRef}
          label="Hendelser"
          hideLabel
          size="small"
          description={
            validationAttempted && !selectedValues.length ? 'Velg sidevisninger eller en egen hendelse.' : undefined
          }
          options={eventOptions}
          filteredOptions={eventOptions.filter((option) =>
            option.label.toLocaleLowerCase('nb').includes(normalizedEventSearch),
          )}
          selectedOptions={eventOptions.filter((option) => selectedValues.includes(option.value))}
          value={eventSearch}
          onChange={setEventSearch}
          allowNewValues={
            Boolean(normalizedEventSearch) &&
            !eventOptions.some((option) => option.label.toLocaleLowerCase('nb') === normalizedEventSearch)
          }
          isMultiSelect
          shouldAutocomplete={false}
          isLoading={isEventsLoading}
          onFocus={() => onEnableCustomEvents?.(false)}
          onToggleSelected={(value, selected, isCustomOption) => {
            setCustomMode(null)
            setEventSearch('')
            if (!isCustomOption && value === 'pageviews') {
              updateSelection(selected, selection.custom, names)
            } else if (!isCustomOption && (value === 'all-custom' || value === 'advanced')) {
              updateSelection(selection.pageviews, selected)
            } else {
              const event = isCustomOption ? value.trim() : value.slice('event:'.length)
              const values = selected
                ? Array.from(new Set([...(isAdvanced ? [] : customValues), event]))
                : customValues.filter((name) => name !== event)
              updateSelection(
                selection.pageviews,
                values.length > 0,
                values.length
                  ? { column: 'event_name', operator: 'IN', value: values[0], multipleValues: values }
                  : undefined,
              )
            }
          }}
        />
        {validationAttempted && selectedValues.length === 0 && (
          <Alert variant="info" size="small" role="status" aria-labelledby={nudgeTitleId}>
            <div className="flex flex-col items-start gap-3">
              <Heading level="2" size="xsmall" id={nudgeTitleId}>
                Hva vil du måle?
              </Heading>
              <BodyShort>Velg sidevisninger eller en egen hendelse.</BodyShort>
              <Button
                type="button"
                size="small"
                variant="secondary"
                onClick={() => {
                  setCustomMode(null)
                  setEventSearch('')
                  updateSelection(true, false)
                  eventInputRef.current?.focus()
                }}
              >
                Bruk sidevisninger
              </Button>
            </div>
          </Alert>
        )}
        <HStack gap="space-24" align="start" wrap>
          <FilterTypePicker
            open={addingFilter}
            onOpenChange={setAddingFilter}
            options={filterOptions}
            onRequestOptions={() => onEnableCustomEvents?.(true)}
            onSelect={(value) => {
              if (value === 'event-options') setShowEventOptions(true)
              else {
                setFilters((previous) => [
                  ...previous.filter((filter) =>
                    value === 'url_path' || value === 'sidegroup' ? filter.column !== 'url_path' : true,
                  ),
                  value === 'sidegroup'
                    ? { column: 'url_path', rawExpression: 'TRUE' }
                    : { column: value, operator: getDefaultFilterOperator(value), value: '' },
                ])
              }
              onEnableCustomEvents?.(value.startsWith('param_'))
            }}
          />
          {additionalAction}
        </HStack>
        {visibleFilters.map((filter) => {
          const index = filters.indexOf(filter)
          if (filter.column === 'url_path' && filter.rawExpression) {
            return (
              <FilterCard
                key={index}
                title="Sidegruppe"
                removeLabel="Fjern sidegruppefilter"
                onRemove={() => removeFilter(index)}
              >
                <div className="space-y-2">
                  <OptionExplanation {...FILTER_DESCRIPTIONS.sidegroup} />
                  {groupsError && (
                    <Alert size="small" variant="error">
                      Kunne ikke hente sidegrupper. Du kan fortsatt opprette en ny.
                    </Alert>
                  )}
                  <Select
                    label="Sidegruppe"
                    hideLabel
                    size="small"
                    disabled={groupsLoading}
                    value={filter.multipleValues?.[0] ?? ''}
                    onChange={(event) => {
                      const group = selectableSidegroups.find((item) => String(item.id) === event.target.value)
                      if (group)
                        updateFilter(index, {
                          rawExpression: buildSidegroupSqlCondition(group, 'url_path'),
                          multipleValues: [String(group.id)],
                          customColumn: group.name,
                        })
                    }}
                  >
                    <option value="" disabled>
                      {groupsLoading ? 'Henter sidegrupper…' : 'Velg sidegruppe'}
                    </option>
                    {filter.multipleValues?.[0] &&
                      !selectableSidegroups.some((group) => String(group.id) === filter.multipleValues?.[0]) && (
                        <option value={filter.multipleValues[0]}>{filter.customColumn ?? 'Lagret sidegruppe'}</option>
                      )}
                    {selectableSidegroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </Select>
                  {website && (
                    <Button
                      type="button"
                      variant="tertiary"
                      size="small"
                      icon={<PlusIcon aria-hidden />}
                      onClick={(event) => {
                        sidegroupTriggerRef.current = event.currentTarget
                        setCreatingSidegroupIndex(index)
                      }}
                    >
                      Opprett sidegruppe
                    </Button>
                  )}
                </div>
              </FilterCard>
            )
          }
          return (
            <GenericFilterCard
              key={index}
              websiteId={websiteId}
              compact
              explanation={
                filterOptions.find((option) => option.value === filter.column) ?? FILTER_DESCRIPTIONS[filter.column]
              }
              filter={filter}
              index={index}
              columnLabel={getChartColumnLabel(
                filter.column,
                filterChoices.find((option) => option.value === filter.column)?.label ??
                  Object.values(FILTER_COLUMNS)
                    .flatMap((group) => group.columns)
                    .find((column) => column.value === filter.column)?.label ??
                  filter.column,
              )}
              OPERATORS={OPERATORS}
              parameters={parameters}
              uniqueParameters={uniqueParameters}
              customEventsList={customEventsList}
              availablePaths={availablePaths}
              removeFilter={removeFilter}
              updateFilter={updateFilter}
            />
          )
        })}
        {(showEventOptions || isAdvanced) && (
          <FilterCard
            title="Hendelsesutvalg (avansert)"
            onRemove={() => {
              setShowEventOptions(false)
              setCustomMode(null)
              updateSelection(selection.pageviews, selection.custom)
            }}
          >
            <div className="mb-2">
              <OptionExplanation {...FILTER_DESCRIPTIONS['event-options']} />
            </div>
            <CustomEventsEditor
              websiteId={websiteId}
              customEventsMode={
                customMode ??
                (!selection.custom ? 'none' : names?.interactive ? 'interactive' : names ? 'specific' : 'all')
              }
              setCustomEventsMode={(mode) => {
                setCustomMode(mode)
                if (mode === 'all') updateSelection(selection.pageviews, true)
                if (mode === 'specific') updateNames(customValues, eventOperator)
              }}
              eventNameOperator={names?.operator ?? eventOperator}
              setEventNameOperator={(operator) => {
                setEventOperator(operator)
                updateNames(customValues, operator)
              }}
              customEvents={customValues}
              customEventsList={customEventsList}
              handleCustomEventsChange={updateNames}
              handleEventTypeChange={(_, checked) => updateSelection(selection.pageviews, checked, names)}
              onEnableCustomEvents={onEnableCustomEvents}
              eventLookbackDays={dateRangeInDays}
              onEventLookbackDaysChange={onDateRangeInDaysChange}
              isEventsLoading={isEventsLoading}
              filters={filters}
              parameters={parameters}
              uniqueParameters={uniqueParameters}
              OPERATORS={OPERATORS}
              updateFilter={updateFilter}
              addFilterDirectly={(filter) => setFilters((previous) => [...previous, filter])}
            />
          </FilterCard>
        )}
        <Dialog
          open={creatingSidegroupIndex !== null}
          onOpenChange={(open) => {
            if (!open) sidegroupEditorRef.current?.requestClose()
          }}
        >
          <Dialog.Popup
            width="large"
            initialFocusTo={() => sidegroupEditorRef.current?.getInitialFocus()}
            returnFocusTo={sidegroupTriggerRef}
          >
            <Dialog.Header>
              <Dialog.Title>Ny sidegruppe</Dialog.Title>
              <Dialog.Description>Gjelder {website?.name}.</Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              {creatingSidegroupIndex !== null && website && (
                <SidegroupEditor
                  ref={sidegroupEditorRef}
                  website={website}
                  onSaved={(group) => {
                    setCreatedSidegroups((previous) => [...previous, group])
                    updateFilter(creatingSidegroupIndex, {
                      rawExpression: buildSidegroupSqlCondition(group, 'url_path'),
                      multipleValues: [String(group.id)],
                      customColumn: group.name,
                    })
                    setCreatingSidegroupIndex(null)
                  }}
                  onCancel={() => setCreatingSidegroupIndex(null)}
                />
              )}
            </Dialog.Body>
          </Dialog.Popup>
        </Dialog>
      </div>
    )
  },
)

export default NextEventFilter
