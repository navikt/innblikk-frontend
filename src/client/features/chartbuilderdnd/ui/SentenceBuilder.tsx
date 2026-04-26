import { Accordion, BodyShort, Button, Heading, Select, TextField } from '@navikt/ds-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import PeriodPicker from '../../analysis/ui/PeriodPicker'
import { FILTER_COLUMNS as SHARED_FILTER_COLUMNS, OPERATORS as SHARED_OPERATORS } from '../../../shared/lib/constants'
import type { SentenceFilter, SlotType, TokenOption } from '../model/types'
import { findTokenById } from '../utils/tokenUtils'

type SentenceBuilderProps = {
  zoneTokenIds: Array<string | null>
  tokens: TokenOption[]
  filters: SentenceFilter[]
  onDrop: (zoneIndex: number, tokenId: string | null) => void
  onSelectToken: (zoneIndex: number, tokenId: string) => void
  onClearZone: (zoneIndex: number) => void
  onAddFilter: (filter: Omit<SentenceFilter, 'id'>) => void
  onRemoveFilter: (id: string) => void
  onReset: () => void
  period: string
  onPeriodChange: (period: string) => void
  customStartDate: Date | undefined
  onCustomStartDateChange: (date: Date | undefined) => void
  customEndDate: Date | undefined
  onCustomEndDateChange: (date: Date | undefined) => void
  showHeader?: boolean
}

type SentenceSlotProps = {
  zoneIndex: number
  valueLabel: string | null
  currentTokenId: string | null
  onDrop: (zoneIndex: number, tokenId: string | null) => void
  canClear?: boolean
  compactMenu?: boolean
  selectedTimeResolution?: TimeResolutionValue
  onTimeResolutionChange?: (value: TimeResolutionValue) => void
}

type FollowupCategory = 'group' | 'filter'
type GroupingSection = { key: string; title: string; options: TokenOption[] }
type TimeResolutionValue = 'total' | 'day' | 'week' | 'month'

const SLOT_COUNT = 5
const FILTERABLE_COLUMN_VALUES = new Set<SentenceFilter['column']>([
  'event_name',
  'event_type',
  'event_id',
  'url_path',
  'url_query',
  'url_fullpath',
  'page_title',
  'referrer_domain',
  'referrer_path',
  'referrer_query',
  'referrer_fullpath',
  'referrer_fullurl',
  'browser',
  'os',
  'device',
  'screen',
  'language',
  'country',
  'session_id',
  'visit_id',
  'visit_duration',
])

const SHARED_TO_SENTENCE_OPERATOR: Partial<Record<string, SentenceFilter['operator']>> = {
  '=': 'equals',
  '!=': 'not_equals',
  LIKE: 'contains',
  STARTS_WITH: 'starts_with',
}

const FILTER_COLUMNS: Array<{ value: SentenceFilter['column']; label: string }> = Object.values(SHARED_FILTER_COLUMNS)
  .flatMap((group) => group.columns)
  .filter((column): column is { value: SentenceFilter['column']; label: string } =>
    FILTERABLE_COLUMN_VALUES.has(column.value as SentenceFilter['column']),
  )

const FILTER_OPERATORS: Array<{ value: SentenceFilter['operator']; label: string }> = SHARED_OPERATORS.map(
  (operator) => ({
    sharedValue: operator.value,
    label: operator.label,
    value: SHARED_TO_SENTENCE_OPERATOR[operator.value],
  }),
)
  .filter(
    (operator): operator is { sharedValue: string; label: string; value: SentenceFilter['operator'] } =>
      operator.value !== undefined,
  )
  .map(({ value, label }) => ({ value, label }))

const tokenButtonClass =
  'w-full rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-3 py-2 text-left text-sm hover:border-[var(--ax-border-accent)] hover:bg-[var(--ax-bg-accent-soft)]'
const actionMenuItemClass =
  'w-full rounded-sm px-2 py-1.5 text-left text-sm text-[var(--ax-text-default)] hover:bg-[var(--ax-bg-neutral-soft)]'

const MENU_ITEM_SELECTOR = '[data-sentence-menu-item="true"]'

const SentenceSlot = ({
  zoneIndex,
  valueLabel,
  currentTokenId,
  onDrop,
  canClear = true,
  compactMenu = false,
  selectedTimeResolution,
  onTimeResolutionChange,
  onSelectToken,
  onClearZone,
  filters,
  onAddFilter,
  onRemoveFilter,
  tokens,
}: SentenceSlotProps & {
  onSelectToken: (zoneIndex: number, tokenId: string) => void
  onClearZone: (zoneIndex: number) => void
  filters: SentenceFilter[]
  onAddFilter: (filter: Omit<SentenceFilter, 'id'>) => void
  onRemoveFilter: (id: string) => void
  tokens: TokenOption[]
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [followupCategory, setFollowupCategory] = useState<FollowupCategory | null>(null)
  const [groupSearch, setGroupSearch] = useState('')
  const [filterColumn, setFilterColumn] = useState<SentenceFilter['column']>('event_name')
  const [filterOperator, setFilterOperator] = useState<SentenceFilter['operator']>('equals')
  const [filterValue, setFilterValue] = useState<string>('')
  const [metricMode, setMetricMode] = useState<'count' | 'share'>('count')
  const slotRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const groupSearchInputRef = useRef<HTMLInputElement>(null)
  const typeaheadBufferRef = useRef('')
  const typeaheadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeMenu = () => {
    setMenuOpen(false)
    setFollowupCategory(null)
    setGroupSearch('')
  }
  const slotWidthClass =
    zoneIndex === 0 ? 'min-w-[120px] max-w-[220px]' : valueLabel ? 'min-w-[120px]' : 'min-w-[170px]'
  const isMetricSlot = zoneIndex === 0

  const metricOptions = useMemo(() => tokens.filter((token) => token.slot === 'metric'), [tokens])

  const groupingSections = useMemo<GroupingSection[]>(() => {
    if (zoneIndex === 0 || followupCategory !== 'group') return []

    const findToken = (slot: SlotType, value: string) =>
      tokens.find((token) => token.slot === slot && token.value === value) ?? null

    const dynamicSections = Object.entries(SHARED_FILTER_COLUMNS)
      .map(([key, group]) => ({
        key,
        title: group.label,
        options: group.columns
          .map((column) => findToken('groupBy', column.value))
          .filter((token): token is TokenOption => token !== null),
      }))
      .filter((section) => section.options.length > 0)

    const sections: GroupingSection[] = []
    sections.push(...dynamicSections)

    const query = groupSearch.trim().toLowerCase()
    if (!query) return sections

    return sections
      .map((section) => ({
        ...section,
        options: section.options.filter((token) => token.label.toLowerCase().includes(query)),
      }))
      .filter((section) => section.options.length > 0)
  }, [tokens, zoneIndex, followupCategory, groupSearch])

  useEffect(() => {
    if (!menuOpen) return

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!slotRef.current?.contains(target)) {
        closeMenu()
      }
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown, true)
    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return

    const frame = requestAnimationFrame(() => {
      if (followupCategory === 'group') {
        groupSearchInputRef.current?.focus()
        return
      }

      const items = menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)
      items?.[0]?.focus()
    })

    return () => cancelAnimationFrame(frame)
  }, [menuOpen, followupCategory])

  useEffect(() => {
    return () => {
      if (typeaheadTimeoutRef.current) {
        clearTimeout(typeaheadTimeoutRef.current)
      }
    }
  }, [])

  const openMenu = () => {
    setMenuOpen(true)
  }

  const focusAndOpenNextSlot = () => {
    const nextTrigger = document.querySelector<HTMLButtonElement>(`[data-sentence-slot-trigger="${zoneIndex + 1}"]`)
    if (!nextTrigger) return
    nextTrigger.focus()
    nextTrigger.click()
  }

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    const isTextInputTarget =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    if (isTextInputTarget) return

    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [])
    if (items.length === 0) return

    const currentIndex = items.findIndex((item) => item === document.activeElement)
    const moveFocus = (nextIndex: number) => {
      const normalizedIndex = (nextIndex + items.length) % items.length
      items[normalizedIndex]?.focus()
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(currentIndex === -1 ? 0 : currentIndex + 1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      moveFocus(items.length - 1)
      return
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const typedChar = event.key.toLowerCase()
      typeaheadBufferRef.current += typedChar

      if (typeaheadTimeoutRef.current) {
        clearTimeout(typeaheadTimeoutRef.current)
      }
      typeaheadTimeoutRef.current = setTimeout(() => {
        typeaheadBufferRef.current = ''
      }, 500)

      const query = typeaheadBufferRef.current
      const matchedIndex = items.findIndex((item) => item.textContent?.trim().toLowerCase().startsWith(query))
      if (matchedIndex !== -1) {
        event.preventDefault()
        moveFocus(matchedIndex)
      }
    }
  }

  const selectTokenAndClose = (tokenId: string) => {
    onSelectToken(zoneIndex, tokenId)
    closeMenu()
    requestAnimationFrame(() => {
      focusAndOpenNextSlot()
    })
  }

  return (
    <div ref={slotRef} className="relative inline-block">
      {isMetricSlot ? (
        <div className="flex items-center gap-3">
          <div className="w-[112px]">
            <Select
              label=""
              hideLabel
              size="small"
              value={metricMode}
              onChange={(event) => setMetricMode(event.target.value as 'count' | 'share')}
            >
              <option value="count">Antall</option>
              <option value="share">Andel</option>
            </Select>
          </div>
          <div className="w-[160px]">
            <Select
              label=""
              hideLabel
              size="small"
              value={currentTokenId ?? ''}
              onChange={(event) => {
                if (!event.target.value) return
                onSelectToken(zoneIndex, event.target.value)
              }}
            >
              <option value="" disabled>
                Velg måltall
              </option>
              {metricOptions.map((token) => (
                <option key={token.id} value={token.id}>
                  {token.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[140px]">
            <Select
              label=""
              hideLabel
              size="small"
              value={selectedTimeResolution ?? 'total'}
              onChange={(event) => onTimeResolutionChange?.(event.target.value as TimeResolutionValue)}
            >
              <option value="total">Totalt</option>
              <option value="day">Per dag</option>
              <option value="week">Per uke</option>
              <option value="month">Per måned</option>
            </Select>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`inline-flex min-h-8 items-center px-1 ${slotWidthClass} ${
              valueLabel ? 'border-b border-dashed border-[var(--ax-border-neutral-strong)]' : ''
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              const tokenId = event.dataTransfer.getData('text/token-id') || null
              onDrop(zoneIndex, tokenId)
            }}
          >
            {valueLabel ? (
              <div className="inline-flex items-center gap-2">
                <button
                  data-sentence-slot-trigger={zoneIndex}
                  type="button"
                  className="truncate text-sm hover:underline"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  title="Endre valg"
                >
                  {valueLabel}
                </button>
                {canClear && (
                  <button
                    type="button"
                    className="text-sm text-[var(--ax-text-subtle)] hover:text-[var(--ax-text-default)]"
                    onClick={() => {
                      onClearZone(zoneIndex)
                      closeMenu()
                    }}
                    title="Fjern valg"
                    aria-label="Fjern valg"
                  >
                    ×
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-start">
                <Button
                  data-sentence-slot-trigger={zoneIndex}
                  type="button"
                  size="small"
                  variant="secondary"
                  onClick={() => (menuOpen ? closeMenu() : openMenu())}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      openMenu()
                    }
                  }}
                >
                  + {zoneIndex === 0 ? 'velg hva du vil se' : 'legg til'}
                </Button>
                {zoneIndex !== 0 && (
                  <p className="mt-2 pl-1 text-xs leading-5 text-[var(--ax-text-subtle)] opacity-80">
                    Grupper, filtrer og mer
                  </p>
                )}
              </div>
            )}
          </div>
          {menuOpen && (
            <div
              ref={menuRef}
              onKeyDown={handleMenuKeyDown}
              className={`absolute left-0 top-9 z-10 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] shadow-md ${
                zoneIndex !== 0 && followupCategory === null ? 'p-1.5' : 'p-4'
              } ${
                zoneIndex !== 0 && followupCategory === null ? 'w-[240px]' : compactMenu ? 'w-[300px]' : 'w-[360px]'
              }`}
            >
              {followupCategory !== null && (
                <div className="pb-3">
                  <Heading size="xsmall" level="3" className="m-0">
                    {followupCategory === null
                      ? ''
                      : followupCategory === 'group'
                        ? 'Hvordan vil du gruppere?'
                        : 'Hvordan vil du filtrere?'}
                  </Heading>
                </div>
              )}

              {zoneIndex !== 0 && followupCategory === null ? (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    data-sentence-menu-item="true"
                    className={actionMenuItemClass}
                    onClick={() => setFollowupCategory('group')}
                  >
                    Grupper etter
                  </button>
                  <button
                    type="button"
                    data-sentence-menu-item="true"
                    className={actionMenuItemClass}
                    onClick={() => setFollowupCategory('filter')}
                  >
                    Filtrer etter
                  </button>
                </div>
              ) : followupCategory === 'filter' ? (
                <div className="space-y-3">
                  <div className="pb-2">
                    <button
                      type="button"
                      data-sentence-menu-item="true"
                      className="text-sm text-[var(--ax-text-accent)] hover:underline"
                      onClick={() => setFollowupCategory(null)}
                    >
                      ← Tilbake
                    </button>
                  </div>
                  <div className="grid gap-2">
                    <Select
                      label="Felt"
                      size="small"
                      value={filterColumn}
                      onChange={(event) => setFilterColumn(event.target.value as SentenceFilter['column'])}
                    >
                      {Object.entries(SHARED_FILTER_COLUMNS).map(([groupKey, group]) => {
                        const groupColumns = group.columns.filter((column) =>
                          FILTERABLE_COLUMN_VALUES.has(column.value as SentenceFilter['column']),
                        )
                        if (groupColumns.length === 0) return null

                        return (
                          <optgroup key={groupKey} label={group.label}>
                            {groupColumns.map((column) => (
                              <option key={column.value} value={column.value}>
                                {column.label}
                              </option>
                            ))}
                          </optgroup>
                        )
                      })}
                    </Select>
                    <Select
                      label="Operator"
                      size="small"
                      value={filterOperator}
                      onChange={(event) => setFilterOperator(event.target.value as SentenceFilter['operator'])}
                    >
                      {FILTER_OPERATORS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                    <TextField
                      label="Verdi"
                      size="small"
                      value={filterValue}
                      onChange={(event) => setFilterValue(event.target.value)}
                    />
                    <Button
                      size="small"
                      variant="secondary"
                      data-sentence-menu-item="true"
                      disabled={filterValue.trim().length === 0}
                      onClick={() => {
                        if (filterValue.trim().length === 0) return
                        onAddFilter({
                          column: filterColumn,
                          operator: filterOperator,
                          value: filterValue.trim(),
                        })
                        setFilterValue('')
                        closeMenu()
                      }}
                    >
                      + legg til filter
                    </Button>
                  </div>
                  {filters.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {filters.map((filter) => (
                        <div
                          key={filter.id}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--ax-border-neutral-subtle)] px-3 py-1"
                        >
                          <BodyShort size="small">
                            {FILTER_COLUMNS.find((item) => item.value === filter.column)?.label ?? filter.column}{' '}
                            {FILTER_OPERATORS.find((item) => item.value === filter.operator)?.label ?? filter.operator}{' '}
                            {filter.value}
                          </BodyShort>
                          <button
                            type="button"
                            className="text-sm text-[var(--ax-text-subtle)] hover:text-[var(--ax-text-default)]"
                            onClick={() => onRemoveFilter(filter.id)}
                            aria-label="Fjern filter"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : zoneIndex === 0 ? (
                <div>
                  {/*<div className="pb-3">
                <Heading size="xsmall" level="4" className="m-0">
                  Antall...
                </Heading>
              </div>*/}
                  <div className="grid gap-2">
                    {metricOptions.map((token) => (
                      <button
                        key={token.id}
                        type="button"
                        data-sentence-menu-item="true"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/token-id', token.id)
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                        onClick={() => selectTokenAndClose(token.id)}
                        className={tokenButtonClass}
                      >
                        {token.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="pb-2">
                    <button
                      type="button"
                      data-sentence-menu-item="true"
                      className="text-sm text-[var(--ax-text-accent)] hover:underline"
                      onClick={() => setFollowupCategory(null)}
                    >
                      ← Tilbake
                    </button>
                  </div>
                  <TextField
                    ref={groupSearchInputRef}
                    label="Søk i grupperinger"
                    size="small"
                    value={groupSearch}
                    onChange={(event) => setGroupSearch(event.target.value)}
                  />
                  {groupingSections.length > 0 ? (
                    <Accordion size="small">
                      {groupingSections.map((section) => (
                        <Accordion.Item key={section.key} open={groupSearch.trim().length > 0 ? true : undefined}>
                          <Accordion.Header>{section.title}</Accordion.Header>
                          <Accordion.Content>
                            <div className="grid gap-2 pb-1">
                              {section.options.map((token) => (
                                <button
                                  key={token.id}
                                  type="button"
                                  data-sentence-menu-item="true"
                                  draggable
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData('text/token-id', token.id)
                                    event.dataTransfer.effectAllowed = 'move'
                                  }}
                                  onClick={() => selectTokenAndClose(token.id)}
                                  className={tokenButtonClass}
                                >
                                  {token.label}
                                </button>
                              ))}
                            </div>
                          </Accordion.Content>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  ) : (
                    <BodyShort size="small" textColor="subtle">
                      Ingen grupperinger matcher søket.
                    </BodyShort>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function SentenceBuilder({
  zoneTokenIds,
  tokens,
  filters,
  onDrop,
  onSelectToken,
  onClearZone,
  onAddFilter,
  onRemoveFilter,
  onReset,
  period,
  onPeriodChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  showHeader = true,
}: SentenceBuilderProps) {
  const formatSentenceLabel = (token: TokenOption): string => {
    return token.label
  }

  const sentenceLabels = Array.from({ length: SLOT_COUNT }, (_, index): string | null => {
    const tokenId = zoneTokenIds[index]
    if (!tokenId) return null
    const token = findTokenById(tokens, tokenId)
    return token ? formatSentenceLabel(token) : null
  })
  const filledIndexes = sentenceLabels
    .map((label, index) => ({ label, index }))
    .filter((item): item is { label: string; index: number } => item.label !== null)
    .map((item) => item.index)
  const emptyIndexes = sentenceLabels
    .map((label, index) => ({ label, index }))
    .filter((item) => item.label === null)
    .map((item) => item.index)
  const addSlotIndex = emptyIndexes[0] ?? null
  const filledTokensByIndex = filledIndexes
    .map((index) => {
      const tokenId = zoneTokenIds[index]
      if (!tokenId) return null
      const token = findTokenById(tokens, tokenId)
      return token ? { index, token } : null
    })
    .filter((item): item is { index: number; token: TokenOption } => item !== null)
  const groupingEntries = filledTokensByIndex.filter((item) => item.token.slot === 'groupBy')
  const timeBucketEntry = filledTokensByIndex.find((item) => item.token.slot === 'timeBucket') ?? null
  const groupSlotIndexes = groupingEntries.map((entry) => entry.index)
  const timeBucketSlotIndex = timeBucketEntry?.index ?? null
  const timeBucketTokenOptions = useMemo(
    () =>
      ['day', 'week', 'month']
        .map((value) => tokens.find((token) => token.slot === 'timeBucket' && token.value === value))
        .filter((token): token is TokenOption => token !== undefined),
    [tokens],
  )
  const selectedTimeResolution: TimeResolutionValue =
    timeBucketEntry?.token.value === 'day' ||
    timeBucketEntry?.token.value === 'week' ||
    timeBucketEntry?.token.value === 'month'
      ? (timeBucketEntry.token.value as TimeResolutionValue)
      : 'total'
  const inlineFilledIndexes = filledIndexes.filter(
    (index) => !groupSlotIndexes.includes(index) && index !== timeBucketSlotIndex,
  )
  const handleTimeResolutionChange = (nextValue: TimeResolutionValue) => {
    if (nextValue === 'total') {
      if (timeBucketSlotIndex !== null) {
        onClearZone(timeBucketSlotIndex)
      }
      return
    }
    const targetToken = timeBucketTokenOptions.find((token) => token.value === nextValue)
    if (!targetToken) return
    const targetZoneIndex = timeBucketSlotIndex ?? 1
    onSelectToken(targetZoneIndex, targetToken.id)
  }
  const getFilterColumnLabel = (column: SentenceFilter['column']): string =>
    FILTER_COLUMNS.find((item) => item.value === column)?.label ?? column
  const getFilterOperatorLabel = (operator: SentenceFilter['operator']): string =>
    FILTER_OPERATORS.find((item) => item.value === operator)?.label ?? operator
  const isCompactState = filledIndexes.length <= 2 && groupingEntries.length === 0 && filters.length === 0

  return (
    <section
      className={
        showHeader
          ? 'space-y-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4'
          : 'space-y-3'
      }
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <Heading size="small" level="2">
            Hva vil du se?
          </Heading>
          <Button size="small" variant="tertiary" onClick={onReset}>
            Nullstill
          </Button>
        </div>
      )}
      <div
        className={`min-h-24 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-4 py-5 ${
          isCompactState ? 'max-w-[680px]' : ''
        }`}
      >
        <div>
          <div className="pb-2">
            <BodyShort size="small" textColor="subtle">
              Vis
            </BodyShort>
          </div>
          <div className="flex flex-wrap items-start gap-4 pt-1">
            {inlineFilledIndexes.map((index) => (
              <SentenceSlot
                key={index}
                zoneIndex={index}
                valueLabel={sentenceLabels[index]}
                currentTokenId={zoneTokenIds[index]}
                onDrop={onDrop}
                canClear={index !== 0}
                onSelectToken={onSelectToken}
                onClearZone={onClearZone}
                filters={filters}
                onAddFilter={onAddFilter}
                onRemoveFilter={onRemoveFilter}
                tokens={tokens}
                compactMenu={isCompactState}
                selectedTimeResolution={selectedTimeResolution}
                onTimeResolutionChange={handleTimeResolutionChange}
              />
            ))}
          </div>
        </div>
        {filters.length > 0 && (
          <div className="mt-5">
            <div className="pb-2">
              <BodyShort size="small" textColor="subtle">
                Filtrer etter
              </BodyShort>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {filters.map((filter) => (
                <div
                  key={filter.id}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--ax-border-neutral-subtle)] px-3 py-1"
                >
                  <BodyShort size="small">
                    {getFilterColumnLabel(filter.column)} {getFilterOperatorLabel(filter.operator)} {filter.value}
                  </BodyShort>
                  <button
                    type="button"
                    className="text-sm text-[var(--ax-text-subtle)] hover:text-[var(--ax-text-default)]"
                    onClick={() => onRemoveFilter(filter.id)}
                    aria-label="Fjern filter"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {groupingEntries.length > 0 && (
          <div className="mt-5">
            <div className="pb-2">
              <BodyShort size="small" textColor="subtle">
                Grupper etter
              </BodyShort>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {groupingEntries.map((entry) => (
                <div
                  key={`group-${entry.index}-${entry.token.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--ax-border-neutral-subtle)] px-3 py-1"
                >
                  <BodyShort size="small">{formatSentenceLabel(entry.token)}</BodyShort>
                  <button
                    type="button"
                    className="text-sm text-[var(--ax-text-subtle)] hover:text-[var(--ax-text-default)]"
                    onClick={() => onClearZone(entry.index)}
                    aria-label="Fjern gruppering"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-5">
          <div className="pb-2">
            <BodyShort size="small" textColor="subtle">
              Tidsperiode
            </BodyShort>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <PeriodPicker
              period={period}
              onPeriodChange={onPeriodChange}
              hideLabel={true}
              startDate={customStartDate}
              onStartDateChange={onCustomStartDateChange}
              endDate={customEndDate}
              onEndDateChange={onCustomEndDateChange}
              className="w-[180px] min-w-0"
            />
          </div>
        </div>
        {addSlotIndex !== null && (
          <div className="mt-5 border-t border-dashed border-[var(--ax-border-neutral-subtle)] pt-3">
            <SentenceSlot
              key={addSlotIndex}
              zoneIndex={addSlotIndex}
              valueLabel={sentenceLabels[addSlotIndex]}
              currentTokenId={zoneTokenIds[addSlotIndex]}
              onDrop={onDrop}
              canClear={addSlotIndex !== 0}
              onSelectToken={onSelectToken}
              onClearZone={onClearZone}
              filters={filters}
              onAddFilter={onAddFilter}
              onRemoveFilter={onRemoveFilter}
              tokens={tokens}
              compactMenu={isCompactState}
              selectedTimeResolution={selectedTimeResolution}
              onTimeResolutionChange={handleTimeResolutionChange}
            />
          </div>
        )}
      </div>
      {/* {sentenceLabels[0] === null && (
        <Alert variant="info" size="small">
          Tips: Start med et måltall, som &quot;Sidevisninger&quot;.
        </Alert>
      )}*/}
    </section>
  )
}
