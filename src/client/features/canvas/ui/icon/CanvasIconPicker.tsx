import { useMemo, useState } from 'react'
import { Chips, TextField } from '@navikt/ds-react'
import { CANVAS_ICON_OPTIONS } from './CanvasIconRegistry.ts'

type CanvasIconPickerProps = {
  selectedIconId: string
  onSelectIcon: (iconId: string) => void
}

const CanvasIconPicker = ({ selectedIconId, onSelectIcon }: CanvasIconPickerProps) => {
  const [searchValue, setSearchValue] = useState('')
  const [variantFilter, setVariantFilter] = useState<'all' | 'Stroke' | 'Fill'>('all')

  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return CANVAS_ICON_OPTIONS.filter((option) => {
      const matchesVariant = variantFilter === 'all' ? true : option.variant === variantFilter
      if (!matchesVariant) return false
      if (!query) return true
      return (
        option.label.toLowerCase().includes(query) ||
        option.id.toLowerCase().includes(query) ||
        option.keywords.toLowerCase().includes(query)
      )
    })
  }, [searchValue, variantFilter])

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
        label="Søk i Aksel-ikoner"
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--ax-text-subtle)]">Variant:</span>
        <Chips size="small">
          {(
            [
              { value: 'all', label: 'Alle' },
              { value: 'Stroke', label: 'Strek' },
              { value: 'Fill', label: 'Fylt' },
            ] as const
          ).map((item) => (
            <Chips.Toggle
              key={item.value}
              selected={variantFilter === item.value}
              onClick={() => setVariantFilter(item.value)}
            >
              {item.label}
            </Chips.Toggle>
          ))}
        </Chips>
      </div>
      <div className="max-h-[360px] space-y-3 overflow-auto pr-1">
        {groupedOptions.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="text-xs font-semibold text-[var(--ax-text-subtle)]">
              {group.category} / {group.subCategory}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.options.map((option) => {
                const isSelected = option.id === selectedIconId
                const Icon = option.Icon
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectIcon(option.id)}
                    className={`flex min-h-[78px] flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-center transition-colors ${
                      isSelected
                        ? 'border-[var(--ax-border-accent)] bg-[var(--ax-bg-accent-soft)]'
                        : 'border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] hover:bg-[var(--ax-bg-neutral-soft)]'
                    }`}
                    aria-pressed={isSelected}
                    title={option.label}
                  >
                    <Icon fontSize="1.5rem" aria-hidden="true" />
                    <span className="text-xs text-[var(--ax-text-default)]">{option.label}</span>
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

export default CanvasIconPicker
