import { useMemo, useState } from 'react'
import { UNSAFE_Combobox } from '@navikt/ds-react'
import type { Website } from '../types/website.ts'
import { DEFAULT_WEBSITE_ID, getWebsiteDisplayName } from '../lib/domain.ts'
import './WebsiteSelect.css'

interface WebsiteSelectProps {
  websites: Website[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  selectedIds?: string[]
  onSelectMultiple?: (ids: string[]) => void
  label?: string
  error?: string
  fullWidth?: boolean
  size?: 'small' | 'medium'
}

const labelOf = getWebsiteDisplayName

/** Ranks name-prefix matches above name-substring above domain matches, so «nav» finds the project named Nav first. */
export function WebsiteSelect({
  websites,
  selectedId,
  onSelect,
  selectedIds,
  onSelectMultiple,
  label = 'Nettsted',
  error,
  fullWidth = false,
  size,
}: WebsiteSelectProps) {
  const [filter, setFilter] = useState('')
  const options = useMemo(() => {
    const counts = new Map<string, number>()
    for (const website of websites) {
      const label = labelOf(website)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...websites]
      .sort(
        (first, second) => Number(second.id === DEFAULT_WEBSITE_ID.prod) - Number(first.id === DEFAULT_WEBSITE_ID.prod),
      )
      .map((website) => {
        const label = labelOf(website)
        return {
          label:
            website.id !== DEFAULT_WEBSITE_ID.prod && (counts.get(label) ?? 0) > 1
              ? `${label} (${website.name})`
              : label,
          value: website.id,
        }
      })
  }, [websites])
  const selected = websites.find((w) => w.id === selectedId)
  const isMultiSelect = selectedIds !== undefined

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return options
    const score = (w: Website) => {
      const name = w.name.toLowerCase()
      if (name.startsWith(q)) return 0
      if (name.includes(q)) return 1
      if (w.domain.toLowerCase().includes(q)) return 2
      if (labelOf(w).toLowerCase().includes(q)) return 2
      return -1
    }
    return websites
      .map((w) => ({ w, s: score(w) }))
      .filter((x) => x.s >= 0)
      .sort(
        (a, b) =>
          Number(b.w.id === DEFAULT_WEBSITE_ID.prod) - Number(a.w.id === DEFAULT_WEBSITE_ID.prod) ||
          a.s - b.s ||
          a.w.name.localeCompare(b.w.name, 'nb'),
      )
      .map((x) => options.find((option) => option.value === x.w.id)!)
  }, [websites, options, filter])

  // Aksel's single-select input shows the selection as plain text, so backspace on it never clears; handle it on the wrapper.
  // Only clear when nothing is being typed, so a search term can still be corrected one character at a time.
  const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isMultiSelect) return
    if (e.key !== 'Backspace' || !selected) return
    const inputValue = (e.target as HTMLInputElement).value
    if (inputValue === labelOf(selected) || (inputValue === '' && filter === '')) {
      onSelect(null)
      setFilter('')
    }
  }

  return (
    <div
      className="website-select-lift"
      style={{ maxWidth: fullWidth ? undefined : 400 }}
      onKeyDownCapture={handleKeyDownCapture}
    >
      <UNSAFE_Combobox
        label={label}
        size={size}
        error={error}
        options={options}
        filteredOptions={filtered}
        selectedOptions={
          isMultiSelect
            ? options.filter((option) => selectedIds.includes(option.value))
            : selected
              ? [{ label: labelOf(selected), value: selected.id }]
              : []
        }
        onToggleSelected={(value, isSelected) => {
          if (isMultiSelect) {
            onSelectMultiple?.(
              isSelected ? [...new Set([...selectedIds, value])] : selectedIds.filter((id) => id !== value),
            )
          } else onSelect(isSelected ? value : null)
        }}
        value={filter}
        onChange={setFilter}
        placeholder="Søk etter nettsted…"
        clearButton
        isMultiSelect={isMultiSelect}
      />
    </div>
  )
}
