import { useMemo, useState } from 'react'
import { Chips, TextField } from '@navikt/ds-react'
import { CANVAS_ILLUSTRATION_OPTIONS } from './CanvasIllustrationRegistry.ts'

type CanvasIllustrationPickerProps = {
  selectedPath: string
  onSelectPath: (path: string) => void
}

const formatIllustrationLabelParts = (label: string): { title: string; subtitle: string | null } => {
  const [titleRaw, ...rest] = label.split(' - ')
  const title = titleRaw.trim()
  const subtitleRaw = rest.join(' - ').trim()
  if (!subtitleRaw) return { title, subtitle: null }
  const subtitle = subtitleRaw
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' • ')
  return { title, subtitle: subtitle || null }
}

const CanvasIllustrationPicker = ({ selectedPath, onSelectPath }: CanvasIllustrationPickerProps) => {
  const [searchValue, setSearchValue] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [personFilter, setPersonFilter] = useState<string>('all')

  const categoryOptions = useMemo(
    () =>
      [...new Set(CANVAS_ILLUSTRATION_OPTIONS.map((option) => option.category))].sort((a, b) =>
        a.localeCompare(b, 'nb-NO'),
      ),
    [],
  )

  const personOptions = useMemo(() => {
    if (categoryFilter === 'all') return []
    const fromCategory = CANVAS_ILLUSTRATION_OPTIONS.filter((option) => option.category === categoryFilter)
    const persons = fromCategory
      .map((option) => option.subCategory.split(' / ')[0]?.trim() ?? '')
      .filter((value) => Boolean(value) && value !== 'Generelt')
    return [...new Set(persons)].sort((a, b) => a.localeCompare(b, 'nb-NO'))
  }, [categoryFilter])

  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return CANVAS_ILLUSTRATION_OPTIONS.filter((option) => {
      const matchesCategory = categoryFilter === 'all' ? true : option.category === categoryFilter
      if (!matchesCategory) return false
      const matchesPerson =
        personFilter === 'all' ? true : (option.subCategory.split(' / ')[0]?.trim() ?? '') === personFilter
      if (!matchesPerson) return false
      if (!query) return true
      return (
        option.label.toLowerCase().includes(query) ||
        option.fileName.toLowerCase().includes(query) ||
        option.category.toLowerCase().includes(query) ||
        option.subCategory.toLowerCase().includes(query)
      )
    })
  }, [searchValue, categoryFilter, personFilter])

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, typeof filteredOptions>()
    for (const option of filteredOptions) {
      const key = `${option.category}|||${option.subCategory}`
      const current = groups.get(key) ?? []
      current.push(option)
      groups.set(key, current)
    }

    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'nb-NO'))
      .map(([key, options]) => {
        const [category, subCategory] = key.split('|||')
        return {
          key,
          category,
          subCategory,
          options,
        }
      })
  }, [filteredOptions])

  return (
    <div className="space-y-3">
      <TextField
        size="small"
        label="Søk i Nav-illustrasjoner"
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--ax-text-subtle)]">Kategori:</span>
        <Chips size="small">
          <Chips.Toggle
            selected={categoryFilter === 'all'}
            onClick={() => {
              setCategoryFilter('all')
              setPersonFilter('all')
            }}
          >
            Alle
          </Chips.Toggle>
          {categoryOptions.map((category) => (
            <Chips.Toggle
              key={category}
              selected={categoryFilter === category}
              onClick={() => {
                setCategoryFilter(category)
                setPersonFilter('all')
              }}
            >
              {category}
            </Chips.Toggle>
          ))}
        </Chips>
      </div>
      {personOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--ax-text-subtle)]">Person:</span>
          <Chips size="small">
            <Chips.Toggle selected={personFilter === 'all'} onClick={() => setPersonFilter('all')}>
              Alle
            </Chips.Toggle>
            {personOptions.map((person) => (
              <Chips.Toggle key={person} selected={personFilter === person} onClick={() => setPersonFilter(person)}>
                {person}
              </Chips.Toggle>
            ))}
          </Chips>
        </div>
      )}
      <div className="max-h-[380px] space-y-3 overflow-auto pr-1">
        {groupedOptions.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="text-xs font-semibold text-[var(--ax-text-subtle)]">
              {group.category} / {group.subCategory}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.options.map((option) => {
                const isSelected = option.path === selectedPath
                const formattedLabel = formatIllustrationLabelParts(option.label)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectPath(option.path)}
                    className={`flex min-h-[72px] items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-[var(--ax-border-accent)] bg-[var(--ax-bg-accent-soft)]'
                        : 'border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] hover:bg-[var(--ax-bg-neutral-soft)]'
                    }`}
                    aria-pressed={isSelected}
                    title={option.label}
                  >
                    <img
                      src={option.path}
                      alt={option.label}
                      className="h-12 w-12 shrink-0 rounded object-contain bg-white"
                      loading="lazy"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-[var(--ax-text-default)]">
                        {formattedLabel.title}
                      </span>
                      {formattedLabel.subtitle && (
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--ax-text-subtle)]">
                          {formattedLabel.subtitle}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default CanvasIllustrationPicker
