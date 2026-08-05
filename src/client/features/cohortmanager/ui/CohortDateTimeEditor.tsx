import { useEffect, useState } from 'react'
import { Tabs, TextField, Select, DatePicker, Button, BodyShort, Alert } from '@navikt/ds-react'
import { format } from 'date-fns'
import type { ValueEditorProps } from 'react-querybuilder'
import {
  isRelativeDateTimeValue,
  type RelativeDateTimeValue,
  type CohortDateRangeValue,
} from '../utils/cohortSqlResolver.ts'

type RelativeUnit = RelativeDateTimeValue['unit']

const RELATIVE_UNITS: { value: RelativeUnit; label: string }[] = [
  { value: 'minute', label: 'minutter' },
  { value: 'hour', label: 'timer' },
  { value: 'day', label: 'dager' },
  { value: 'week', label: 'uker' },
  { value: 'month', label: 'måneder' },
  { value: 'year', label: 'år' },
]

function relative(anchor: string, offset: number, unit: RelativeUnit = 'day'): string {
  return JSON.stringify({ mode: 'relative', anchor, offset, unit } satisfies RelativeDateTimeValue)
}

/** "Ofte brukt" presets — ported 1:1 from /grafbygger's DYNAMIC_DATE_RANGES (DateRangeSelector.tsx), just expressed as {from, to} RelativeDateTimeValue pairs instead of raw BigQuery SQL strings. */
const PRESETS: { label: string; from: string; to: string }[] = [
  { label: 'Siste 7 dager', from: relative('now', -7, 'day'), to: relative('now', 0) },
  { label: 'Siste 30 dager', from: relative('now', -30, 'day'), to: relative('now', 0) },
  { label: 'I dag', from: relative('startOfDay', 0), to: relative('now', 0) },
  { label: 'I går', from: relative('startOfDay', -1, 'day'), to: relative('startOfDay', 0) },
  { label: 'Denne uken', from: relative('startOfWeek', 0), to: relative('now', 0) },
  { label: 'Forrige uke', from: relative('startOfWeek', -1, 'week'), to: relative('startOfWeek', 0) },
  { label: 'Denne måneden', from: relative('startOfMonth', 0), to: relative('now', 0) },
  { label: 'Forrige måned', from: relative('startOfMonth', -1, 'month'), to: relative('startOfMonth', 0) },
  { label: 'I år', from: relative('startOfYear', 0), to: relative('now', 0) },
  { label: 'I fjor', from: relative('startOfYear', -1, 'year'), to: relative('startOfYear', 0) },
]

type Mode = 'frequent' | 'relative' | 'fixed'

function parseRange(raw: string): CohortDateRangeValue | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CohortDateRangeValue).from === 'string' &&
      typeof (parsed as CohortDateRangeValue).to === 'string'
    ) {
      return parsed as CohortDateRangeValue
    }
    return null
  } catch {
    return null
  }
}

/** Reads a bound's relative offset+unit, if it's a "N units ago" shape (anchor 'now', as produced by the Relativ tab). */
function parseRelativeAmount(raw: string | undefined): { amount: number; unit: RelativeUnit } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isRelativeDateTimeValue(parsed) && parsed.anchor === 'now') {
      return { amount: Math.abs(parsed.offset), unit: parsed.unit }
    }
    return null
  } catch {
    return null
  }
}

function toDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  // Only fixed-date bounds (plain ISO strings, not RelativeDateTimeValue JSON) render into the DatePicker.
  try {
    JSON.parse(raw)
    return undefined
  } catch {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
}

function inferInitialMode(raw: string): Mode {
  const range = parseRange(raw)
  if (!range) return 'frequent'
  if (parseRelativeAmount(range.from)) return 'relative'
  if (toDate(range.from) || toDate(range.to)) return 'fixed'
  return 'frequent'
}

export interface CohortDateTimeEditorProps {
  /** Raw RQB rule value — a JSON `{from, to}` string (CohortDateRangeValue), or empty for a not-yet-configured row. */
  value: string
  onChange: (value: string) => void
}

/**
 * Value editor for the "Tidspunkt" (`created_at`) BETWEEN condition — the
 * *only* operator this field supports (see ComparisonOperator.BETWEEN), so
 * no operator dropdown is rendered for this field at all (see
 * CohortEditor.tsx's AkselOperatorSelector/StepConditionsEditor, both of
 * which hide the operator select when field === 'created_at'). A cohort
 * "tidspunkt" filter is inherently a period, not two independent bounds.
 *
 * Mirrors /grafbygger's "overstyr tidsperiode" DateRangeSelector 1:1 — same
 * three tabs, same preset set, same relative/fixed semantics — just
 * producing one {from, to} JSON value instead of two chartbuilder Filters.
 */
export function CohortDateTimeEditor({ value, onChange }: CohortDateTimeEditorProps) {
  const [mode, setMode] = useState<Mode>(() => inferInitialMode(value))

  const range = parseRange(value)
  const relativeAmount = parseRelativeAmount(range?.from)

  const apply = (from: string, to: string) => onChange(JSON.stringify({ from, to } satisfies CohortDateRangeValue))

  // The calendar's in-progress range selection (click 1 sets `from`, click 2
  // sets `to`) is kept as local state, separate from the persisted `value` —
  // committing every single click straight to `value` (and deriving
  // `selected` back from it) collapses the picker into a same-day range on
  // the very first click, since the round-trip immediately reports a
  // "complete" range and the calendar has no notion of "still picking".
  // Only calling `apply()` once both dates are chosen (mirroring
  // /grafbygger's DateRangeSelector) avoids that. Resynced from `value`
  // when it changes from elsewhere (e.g. a preset applied on another tab).
  const [pendingRange, setPendingRange] = useState<{ from: Date | undefined; to?: Date }>(() => ({
    from: toDate(range?.from),
    to: toDate(range?.to),
  }))

  useEffect(() => {
    setPendingRange({ from: toDate(range?.from), to: toDate(range?.to) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="cohort-datetime-editor">
      <Alert variant="info" size="small">
        Dette bestemmer <strong>når noen må ha vært aktiv for å telle som medlem</strong> av brukergruppen — det
        begrenser <strong>ikke</strong> hvilke av deres andre hendelser som vises når brukergruppen brukes i en graf. En
        bruker som kvalifiserer via en hendelse i denne perioden, telles fortsatt med all sin aktivitet i grafens egen
        tidsperiode (som settes uavhengig, under «Overstyr tidsperiode» i grafbyggeren).
      </Alert>

      <Tabs value={mode} onChange={(v) => setMode(v as Mode)} size="small">
        <Tabs.List>
          <Tabs.Tab value="frequent" label="Ofte brukt" />
          <Tabs.Tab value="relative" label="Relativ" />
          <Tabs.Tab value="fixed" label="Bestemt periode" />
        </Tabs.List>

        <Tabs.Panel value="frequent" className="pt-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="xsmall"
                variant={range?.from === preset.from && range?.to === preset.to ? 'primary' : 'secondary'}
                onClick={() => apply(preset.from, preset.to)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="relative" className="pt-3">
          <div className="flex items-end gap-3">
            <BodyShort size="small">Siste</BodyShort>
            <TextField
              label="Antall"
              hideLabel
              type="number"
              min={1}
              size="small"
              className="w-20"
              value={relativeAmount?.amount ?? ''}
              onChange={(e) => {
                const amount = Number(e.target.value) || 0
                const unit = relativeAmount?.unit ?? 'day'
                apply(relative('now', -amount, unit), relative('now', 0))
              }}
            />
            <Select
              label="Periode"
              hideLabel
              size="small"
              value={relativeAmount?.unit ?? 'day'}
              onChange={(e) => {
                const unit = e.target.value as RelativeUnit
                apply(relative('now', -(relativeAmount?.amount ?? 1), unit), relative('now', 0))
              }}
            >
              {RELATIVE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </div>
          <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)', marginTop: 8 }}>
            Regnes ut på nytt hver gang brukergruppen evalueres — glidende vindu, ikke en fast dato.
          </BodyShort>
        </Tabs.Panel>

        <Tabs.Panel value="fixed" className="pt-3">
          <DatePicker
            mode="range"
            selected={pendingRange}
            onSelect={(selected) => {
              setPendingRange(selected ?? { from: undefined })
              if (selected?.from && selected?.to) {
                apply(
                  `${format(selected.from, 'yyyy-MM-dd')}T00:00:00`,
                  `${format(selected.to, 'yyyy-MM-dd')}T23:59:59`,
                )
              }
            }}
          >
            <div className="flex flex-wrap items-end gap-4">
              <DatePicker.Input
                label="Fra dato"
                id="cohort-datetime-from"
                size="small"
                value={pendingRange.from ? format(pendingRange.from, 'dd.MM.yyyy') : ''}
              />
              <DatePicker.Input
                label="Til dato"
                id="cohort-datetime-to"
                size="small"
                value={pendingRange.to ? format(pendingRange.to, 'dd.MM.yyyy') : ''}
              />
            </div>
          </DatePicker>
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}

/** Thin RQB `valueEditor` adapter over CohortDateTimeEditor — used for the top-level QueryBuilder's `created_at` rows. */
export function CohortDateTimeValueEditor(props: ValueEditorProps) {
  return <CohortDateTimeEditor value={(props.value as string) || ''} onChange={(v) => props.handleOnChange(v)} />
}
