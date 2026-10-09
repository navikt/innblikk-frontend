import { useState } from 'react'
import { Box, Select } from '@navikt/ds-react'
import { CohortDateTimeEditor } from '../../cohortmanager/ui/CohortDateTimeEditor.tsx'
import { DEFAULT_TIME_PRESET, matchPreset, presetValue, TIME_PRESETS } from '../utils/time.ts'

interface TimeRangeSelectProps {
  value: string | null
  onChange: (value: string | null) => void
}

export function TimeRangeSelect({ value, onChange }: TimeRangeSelectProps) {
  const preset = matchPreset(value)
  const [custom, setCustom] = useState(() => value !== null && !preset)
  const selectValue = custom ? 'custom' : (preset?.id ?? 'any')

  const handleChange = (next: string) => {
    if (next === 'any') {
      setCustom(false)
      onChange(null)
    } else if (next === 'custom') {
      setCustom(true)
      if (value === null) onChange(presetValue(DEFAULT_TIME_PRESET))
    } else {
      const chosen = TIME_PRESETS.find((p) => p.id === next)
      if (!chosen) return
      setCustom(false)
      onChange(presetValue(chosen))
    }
  }

  return (
    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
      <div style={{ maxWidth: '16rem' }}>
        <Select
          label="Tidsrom"
          hideLabel
          size="small"
          value={selectValue}
          onChange={(e) => handleChange(e.target.value)}
        >
          <option value="any">Når som helst</option>
          {TIME_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Egendefinert …</option>
        </Select>
      </div>
      {custom && value !== null && (
        <Box marginBlock="space-8 space-0" padding="space-12" background="neutral-soft" borderRadius="4">
          <CohortDateTimeEditor value={value} onChange={onChange} hideNotes />
        </Box>
      )}
    </div>
  )
}
