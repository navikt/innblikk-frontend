import { Button, Select, Tag, TextField, UNSAFE_Combobox } from '@navikt/ds-react'
import { PencilIcon } from '@navikt/aksel-icons'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import type { Filter, Parameter, SegmentDefinition as ChartSegmentDefinition } from '../../../../shared/types/chart.ts'
import { OPERATORS } from '../../../../shared/lib/constants.ts'
import EventFilter from './EventFilter.tsx'

interface SegmentDefinition {
  id: number
  name: string
}

interface SegmentByRef {
  resetSegments: (silent?: boolean) => void
}

interface SegmentByProps {
  parameters: Parameter[]
  availableEvents: string[]
  dateRangeInDays: number
  onDateRangeInDaysChange: (days: number) => void
  onEnableCustomEvents?: (withParams?: boolean) => void
  isEventsLoading?: boolean
  onSegmentsChange?: (segments: ChartSegmentDefinition[]) => void
}

interface PerformedSelection {
  operator: 'IN' | '=' | '!=' | 'LIKE' | 'STARTS_WITH' | 'ENDS_WITH'
  events: string[]
}

const INITIAL_SEGMENT: SegmentDefinition = {
  id: 1,
  name: 'Alle brukere',
}

const SegmentBy = forwardRef<SegmentByRef, SegmentByProps>(
  (
    {
      parameters,
      availableEvents,
      dateRangeInDays,
      onDateRangeInDaysChange,
      onEnableCustomEvents,
      isEventsLoading = false,
      onSegmentsChange,
    },
    ref,
  ) => {
    const [segments, setSegments] = useState<SegmentDefinition[]>([INITIAL_SEGMENT])
    const [nextSegmentId, setNextSegmentId] = useState<number>(2)
    const [segmentFilters, setSegmentFilters] = useState<Record<number, Filter[]>>({
      1: [],
    })
    const [showFilterBuilder, setShowFilterBuilder] = useState<Record<number, boolean>>({
      1: false,
    })
    const [showPerformedBuilder, setShowPerformedBuilder] = useState<Record<number, boolean>>({})
    const [performedSelections, setPerformedSelections] = useState<Record<number, PerformedSelection>>({
      1: { operator: 'IN', events: [] },
    })
    const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null)
    const [editingSegmentName, setEditingSegmentName] = useState<string>('')

    const customEventsList = useMemo(() => {
      return availableEvents
        .filter((event) => event != null)
        .filter((event) => !event.toLowerCase().startsWith('pageview') && !event.includes('/'))
    }, [availableEvents])

    const performedOperators = useMemo(
      () => [
        { label: 'er lik', value: 'IN' },
        ...OPERATORS.filter((operator) => ['=', '!=', 'LIKE', 'STARTS_WITH', 'ENDS_WITH'].includes(operator.value)),
      ],
      [],
    )

    const resetSegments = (_silent = false) => {
      setSegments([INITIAL_SEGMENT])
      setNextSegmentId(2)
      setSegmentFilters({ 1: [] })
      setShowFilterBuilder({ 1: false })
      setShowPerformedBuilder({})
      setPerformedSelections({ 1: { operator: 'IN', events: [] } })
      setEditingSegmentId(null)
      setEditingSegmentName('')
    }

    useImperativeHandle(ref, () => ({
      resetSegments,
    }))

    const addSegment = () => {
      const segmentId = nextSegmentId

      setSegments((prev) => [
        ...prev,
        {
          id: segmentId,
          name: `Segment ${segmentId}`,
        },
      ])

      setSegmentFilters((prev) => ({
        ...prev,
        [segmentId]: [],
      }))
      setShowFilterBuilder((prev) => ({
        ...prev,
        [segmentId]: false,
      }))
      setPerformedSelections((prev) => ({
        ...prev,
        [segmentId]: { operator: 'IN', events: [] },
      }))

      setNextSegmentId((prev) => prev + 1)
    }

    const removeSegment = (segmentId: number) => {
      setSegments((prev) => {
        if (prev.length <= 1) return prev
        return prev.filter((segment) => segment.id !== segmentId)
      })

      setSegmentFilters((prev) => {
        const { [segmentId]: _removed, ...rest } = prev
        return rest
      })
      setShowFilterBuilder((prev) => {
        const { [segmentId]: _removed, ...rest } = prev
        return rest
      })
      setShowPerformedBuilder((prev) => {
        const { [segmentId]: _removed, ...rest } = prev
        return rest
      })
      setPerformedSelections((prev) => {
        const { [segmentId]: _removed, ...rest } = prev
        return rest
      })
      if (editingSegmentId === segmentId) {
        setEditingSegmentId(null)
        setEditingSegmentName('')
      }
    }

    const startEditingSegmentName = (segment: SegmentDefinition) => {
      setEditingSegmentId(segment.id)
      setEditingSegmentName(segment.name)
    }

    const saveSegmentName = (segmentId: number) => {
      const nextName = editingSegmentName.trim() || `Segment ${segmentId}`
      setSegments((prev) =>
        prev.map((segment) => (segment.id === segmentId ? { ...segment, name: nextName } : segment)),
      )
      setEditingSegmentId(null)
      setEditingSegmentName('')
    }

    const setFiltersForSegment = (segmentId: number, filters: Filter[]) => {
      setSegmentFilters((prev) => ({
        ...prev,
        [segmentId]: filters,
      }))
    }

    const getActiveFilterCount = (segmentId: number): number => {
      const filters = segmentFilters[segmentId] || []
      return filters.filter(
        (filter) => !(filter.column === 'created_at' && ['>=', '<='].includes(filter.operator || '')),
      ).length
    }

    const getSelectedPerformedCount = (segmentId: number): number => {
      return performedSelections[segmentId]?.events?.length || 0
    }

    const togglePerformedBuilder = (segmentId: number) => {
      setShowPerformedBuilder((prev) => ({
        ...prev,
        [segmentId]: !prev[segmentId],
      }))
    }

    const clearPerformedSelection = (segmentId: number) => {
      setPerformedSelections((prev) => ({
        ...prev,
        [segmentId]: { operator: 'IN', events: [] },
      }))
      setShowPerformedBuilder((prev) => ({
        ...prev,
        [segmentId]: false,
      }))
    }

    const toggleFilterBuilder = (segmentId: number) => {
      setShowFilterBuilder((prev) => ({
        ...prev,
        [segmentId]: !prev[segmentId],
      }))
    }

    const updatePerformedSelection = (segmentId: number, updates: Partial<PerformedSelection>) => {
      setPerformedSelections((prev) => {
        const current = prev[segmentId] || { operator: 'IN', events: [] }
        return {
          ...prev,
          [segmentId]: { ...current, ...updates },
        }
      })
    }

    useEffect(() => {
      if (!onSegmentsChange) return

      const payload: ChartSegmentDefinition[] = segments.map((segment) => {
        const performedSelection = performedSelections[segment.id]
        const hasPerformedSelection = (performedSelection?.events?.length || 0) > 0

        return {
          id: segment.id,
          name: segment.name,
          filters: segmentFilters[segment.id] || [],
          performed: hasPerformedSelection ? performedSelection : null,
        }
      })

      onSegmentsChange(payload)
    }, [segments, segmentFilters, performedSelections, onSegmentsChange])

    return (
      <div className="space-y-3">
        <div className="space-y-2">
          {segments.map((segment, index) => (
            <div
              key={segment.id}
              className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {segments.length > 1 && (
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded bg-blue-700 px-2 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                )}

                {editingSegmentId === segment.id ? (
                  <div className="min-w-[170px] max-w-[280px]">
                    <TextField
                      label="Segmentnavn"
                      hideLabel
                      size="small"
                      value={editingSegmentName}
                      onChange={(e) => setEditingSegmentName(e.target.value)}
                      onBlur={() => saveSegmentName(segment.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveSegmentName(segment.id)
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setEditingSegmentId(null)
                          setEditingSegmentName('')
                        }
                      }}
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Rediger navn for ${segment.name}`}
                    onClick={() => startEditingSegmentName(segment)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--ax-bg-neutral-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ax-border-accent)"
                  >
                    <span className="text-sm font-semibold" style={{ color: 'var(--ax-text-subtle)' }}>
                      {segment.name}
                    </span>
                    <PencilIcon aria-hidden fontSize="1rem" style={{ color: 'var(--ax-text-subtle)' }} />
                  </button>
                )}

                {getActiveFilterCount(segment.id) > 0 && (
                  <Tag variant="neutral" size="xsmall">
                    {getActiveFilterCount(segment.id)} {getActiveFilterCount(segment.id) === 1 ? 'filter' : 'filtre'}
                  </Tag>
                )}
                {getSelectedPerformedCount(segment.id) > 0 && (
                  <Tag variant="neutral" size="xsmall">
                    {getSelectedPerformedCount(segment.id)}{' '}
                    {getSelectedPerformedCount(segment.id) === 1 ? 'handling' : 'handlinger'}
                  </Tag>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-1">
                  {(() => {
                    const isFilterBuilderOpen = showFilterBuilder[segment.id] === true
                    const filterLabel = isFilterBuilderOpen ? 'Lukk filter' : 'Filter'
                    const isPerformedBuilderOpen = showPerformedBuilder[segment.id] === true
                    const performedLabel = isPerformedBuilderOpen ? 'Lukk handling' : 'Handling'

                    return (
                      <>
                        <Button variant="tertiary" size="xsmall" onClick={() => toggleFilterBuilder(segment.id)}>
                          {filterLabel}
                        </Button>
                        <Button variant="tertiary" size="xsmall" onClick={() => togglePerformedBuilder(segment.id)}>
                          {performedLabel}
                        </Button>
                      </>
                    )
                  })()}

                  {segments.length > 1 && (
                    <Button variant="tertiary-neutral" size="xsmall" onClick={() => removeSegment(segment.id)}>
                      Fjern
                    </Button>
                  )}
                </div>
              </div>

              {showFilterBuilder[segment.id] && (
                <div className="mt-3">
                  <EventFilter
                    mode="filter-only"
                    filters={segmentFilters[segment.id] || []}
                    parameters={parameters}
                    setFilters={(nextFilters) => setFiltersForSegment(segment.id, nextFilters)}
                    availableEvents={availableEvents}
                    onEnableCustomEvents={onEnableCustomEvents}
                    dateRangeInDays={dateRangeInDays}
                    onDateRangeInDaysChange={onDateRangeInDaysChange}
                    isEventsLoading={isEventsLoading}
                  />
                </div>
              )}

              {showPerformedBuilder[segment.id] && (
                <div className="mt-3 rounded-md border bg-[var(--ax-bg-default)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-(--ax-text-default)">Utvalgte hendelser</p>
                    <Button
                      variant="tertiary-neutral"
                      size="xsmall"
                      onClick={() => clearPerformedSelection(segment.id)}
                    >
                      Fjern
                    </Button>
                  </div>

                  <div className="mt-3 space-y-3">
                    <Select
                      label="Hendelsesnavn"
                      value={(performedSelections[segment.id]?.operator || 'IN') as string}
                      onChange={(e) => {
                        const nextOperator = e.target.value as PerformedSelection['operator']
                        const currentEvents = performedSelections[segment.id]?.events || []
                        updatePerformedSelection(segment.id, {
                          operator: nextOperator,
                          events: nextOperator === 'IN' ? currentEvents : currentEvents.slice(0, 1),
                        })
                      }}
                      size="small"
                      className="w-full md:w-1/3"
                    >
                      {performedOperators.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </Select>

                    {(performedSelections[segment.id]?.operator || 'IN') === 'IN' ? (
                      <UNSAFE_Combobox
                        label="Velg hendelser"
                        description="Flere hendelser kan velges for 'er lik' operator"
                        options={customEventsList.map((event) => ({
                          label: event,
                          value: event,
                        }))}
                        selectedOptions={performedSelections[segment.id]?.events || []}
                        onToggleSelected={(option: string, isSelected: boolean) => {
                          if (!option) return
                          const current = performedSelections[segment.id]?.events || []
                          const nextEvents = isSelected
                            ? [...current, option]
                            : current.filter((event) => event !== option)
                          updatePerformedSelection(segment.id, { events: [...new Set(nextEvents)] })
                        }}
                        isMultiSelect
                        size="small"
                        allowNewValues
                      />
                    ) : (
                      <UNSAFE_Combobox
                        label="Velg hendelse"
                        description={
                          (performedSelections[segment.id]?.operator || 'IN') === 'LIKE'
                            ? 'Søket vil matche hendelser som inneholder verdien'
                            : (performedSelections[segment.id]?.operator || 'IN') === 'STARTS_WITH'
                              ? 'Søket vil finne hendelser som starter med verdien'
                              : (performedSelections[segment.id]?.operator || 'IN') === 'ENDS_WITH'
                                ? 'Søket vil finne hendelser som slutter med verdien'
                                : null
                        }
                        options={customEventsList.map((event) => ({
                          label: event,
                          value: event,
                        }))}
                        selectedOptions={(performedSelections[segment.id]?.events || []).slice(0, 1)}
                        onToggleSelected={(option: string, isSelected: boolean) => {
                          if (!option) return
                          updatePerformedSelection(segment.id, {
                            events: isSelected ? [option] : [],
                          })
                        }}
                        isMultiSelect={false}
                        size="small"
                        allowNewValues
                      />
                    )}

                    {isEventsLoading && customEventsList.length === 0 && (
                      <div className="text-xs text-(--ax-text-subtle)">Laster hendelser...</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSegment}
          aria-label="Legg til segment"
          className="block w-full cursor-pointer rounded-md border-1 border-dashed border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-3 py-3 text-left hover:border-(--ax-border-neutral) hover:bg-[var(--ax-bg-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ax-border-accent)"
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--ax-text-subtle)' }}>
            + Legg til segment
          </p>
        </button>
      </div>
    )
  },
)

SegmentBy.displayName = 'SegmentBy'

export type { SegmentByRef }
export default SegmentBy
