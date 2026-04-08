import { useMemo, useState } from 'react'
import { TextField } from '@navikt/ds-react'
import { CANVAS_ICON_OPTIONS } from './CanvasIconRegistry.ts'

type CanvasIconPickerProps = {
  selectedIconId: string
  onSelectIcon: (iconId: string) => void
}

const CanvasIconPicker = ({ selectedIconId, onSelectIcon }: CanvasIconPickerProps) => {
  const [searchValue, setSearchValue] = useState('')

  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    if (!query) return CANVAS_ICON_OPTIONS
    return CANVAS_ICON_OPTIONS.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.id.toLowerCase().includes(query) ||
        option.keywords.toLowerCase().includes(query),
    )
  }, [searchValue])

  return (
    <div className="space-y-3">
      <TextField
        size="small"
        label="Søk ikon"
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
      />
      <div className="grid max-h-[300px] grid-cols-2 gap-2 overflow-auto pr-1 sm:grid-cols-3">
        {filteredOptions.map((option) => {
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
    </div>
  )
}

export default CanvasIconPicker
