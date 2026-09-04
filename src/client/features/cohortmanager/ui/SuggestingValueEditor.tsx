import { useEffect, useMemo } from 'react'
import { BodyShort, UNSAFE_Combobox } from '@navikt/ds-react'
import { columnValuesSuggestions } from '../hooks/useColumnValueSuggestions.ts'
import type { SuggestibleColumn } from '../api/columnValuesApi.ts'

const { useColumnValueSuggestions } = columnValuesSuggestions

/**
 * Country codes (ISO alpha-2 from dbip GeoIP) are cryptic raw values, so the
 * label gets the full treatment: flag emoji (regional indicator symbols) +
 * nb-NO-localized region name + the raw code in parentheses — never emoji
 * alone (screen readers read the indicators letter-by-letter, and two flags
 * can look alike at combobox size).
 */
const regionNames = new Intl.DisplayNames('nb-NO', { type: 'region' })

export function countryFlagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return ''
  const base = 0x1f1e6 - 65 // regional indicator 'A' minus ASCII 'A'
  return String.fromCodePoint(base + code.toUpperCase().charCodeAt(0), base + code.toUpperCase().charCodeAt(1))
}

export function toSuggestionOptions(column: string, values: string[]): { label: string; value: string }[] {
  return values.map((value) => {
    if (column === 'country') {
      const flag = countryFlagEmoji(value)
      const name = regionNames.of(value.toUpperCase()) ?? value
      return { label: `${flag ? `${flag} ` : ''}${name} (${value.toUpperCase()})`, value }
    }
    return { label: value, value }
  })
}

interface SuggestingValueEditorProps {
  websiteId: string | undefined
  column: SuggestibleColumn
  /** Scope for event_data_value — the chosen event-data key. */
  suggestionKey?: string
  /** Scope event_data_key/event_data_value suggestions to one event name (see DetailInlineEditor). */
  eventName?: string
  value: string
  onChange: (value: string) => void
  /** IN_SET/NOT_IN_SET store a JSON string-array as the value. */
  multi?: boolean
  label: string
  disabled?: boolean
  placeholder?: string
  className?: string
  /** Hide the visible label (still read by screen readers) — set when the field/operator siblings in the same row also hide theirs, so position alone conveys meaning. */
  hideLabel?: boolean
}

/**
 * A value input that autocompletes from real data (see column-values endpoint)
 * while never blocking free text — allowNewValues keeps case-sensitivity as
 * the user's escape hatch, and total fetch failure degrades to a plain text
 * entry with an inline note rather than disabling anything.
 */
export function SuggestingValueEditor({
  websiteId,
  column,
  suggestionKey,
  eventName,
  value,
  onChange,
  multi = false,
  label,
  disabled = false,
  placeholder,
  className,
  hideLabel = false,
}: SuggestingValueEditorProps) {
  const { values, scannedDays, failed, load } = useColumnValueSuggestions(websiteId, column, suggestionKey, eventName)

  // Fetch fires on mount-with-field-picked (the parent mounts this editor
  // when the user picks the field), not on combobox focus. Skip entirely
  // while disabled: a disabled editor (e.g. «Verdi» before a «Detalj» key is
  // chosen) has nothing meaningful to fetch — event_data_value even 400s
  // server-side without a key — so firing anyway just produced a confusing
  // "Kunne ikke hente forslag" note on a field the user can't interact with
  // yet. Re-fires once the editor becomes enabled (key picked): `load` is
  // re-memoized per (websiteId, column, key) in the hook, so this effect
  // reruns then too.
  useEffect(() => {
    if (disabled) return
    load()
  }, [disabled, load])

  const options = useMemo(() => toSuggestionOptions(column, values), [column, values])

  const selected: string[] = useMemo(() => {
    if (!multi) return value ? [value] : []
    try {
      const parsed: unknown = JSON.parse(value || '[]')
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }, [multi, value])

  const handleToggle = (option: string, isSelected: boolean) => {
    if (multi) {
      const next = isSelected ? [...selected, option] : selected.filter((v) => v !== option)
      onChange(JSON.stringify(next))
    } else {
      onChange(isSelected ? option : '')
    }
  }

  // Free-text commit: allowNewValues only toggles typed text into a real
  // value when the dropdown is open; on blur it may be closed, so commit the
  // leftover typed value ourselves (single-select only — multi keeps chips).
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (multi) return
    const typed = e.target.value.trim()
    if (typed && typed !== value) onChange(typed)
  }

  const showScannedDaysNote = !disabled && scannedDays !== null && scannedDays < 30

  return (
    <div className={`cohort-suggesting-value${className ? ` ${className}` : ''}`}>
      <UNSAFE_Combobox
        label={label}
        hideLabel={hideLabel}
        size="small"
        options={options}
        selectedOptions={selected}
        onToggleSelected={handleToggle}
        onBlur={handleBlur}
        isMultiSelect={multi}
        allowNewValues
        disabled={disabled}
        placeholder={placeholder}
      />
      {showScannedDaysNote && (
        <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
          Forslag fra siste {scannedDays} dager
        </BodyShort>
      )}
      {failed && !disabled && (
        <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
          Kunne ikke hente forslag — du kan fortsatt skrive verdien manuelt
        </BodyShort>
      )}
    </div>
  )
}
