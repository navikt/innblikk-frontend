import { useMemo, useState } from 'react'
import { UNSAFE_Combobox } from '@navikt/ds-react'
import type { Website } from '../../../shared/types/website.ts'

interface WebsiteSelectProps {
  websites: Website[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const labelOf = (w: Website) => `${w.name} — ${w.domain}`

/** Ranks name-prefix matches above name-substring above domain matches, so «nav» finds the project named Nav first. */
export function WebsiteSelect({ websites, selectedId, onSelect }: WebsiteSelectProps) {
  const [filter, setFilter] = useState('')
  const options = useMemo(() => websites.map((w) => ({ label: labelOf(w), value: w.id })), [websites])
  const selected = websites.find((w) => w.id === selectedId)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return options
    const score = (w: Website) => {
      const name = w.name.toLowerCase()
      if (name.startsWith(q)) return 0
      if (name.includes(q)) return 1
      if (w.domain.toLowerCase().includes(q)) return 2
      return -1
    }
    return websites
      .map((w) => ({ w, s: score(w) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.w.name.localeCompare(b.w.name, 'nb'))
      .map((x) => ({ label: labelOf(x.w), value: x.w.id }))
  }, [websites, options, filter])

  // Aksel's single-select input shows the selection as plain text, so backspace on it never clears; handle it on the wrapper.
  const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Backspace' || !selected) return
    const inputValue = (e.target as HTMLInputElement).value
    if (inputValue === labelOf(selected) || inputValue === filter) {
      onSelect(null)
      setFilter('')
    }
  }

  return (
    <div style={{ maxWidth: 400 }} onKeyDownCapture={handleKeyDownCapture}>
      <UNSAFE_Combobox
        label="Nettsted"
        options={options}
        filteredOptions={filtered}
        selectedOptions={selected ? [{ label: labelOf(selected), value: selected.id }] : []}
        onToggleSelected={(value, isSelected) => onSelect(isSelected ? value : null)}
        value={filter}
        onChange={setFilter}
        placeholder="Søk etter nettsted…"
        clearButton
        isMultiSelect={false}
      />
    </div>
  )
}
