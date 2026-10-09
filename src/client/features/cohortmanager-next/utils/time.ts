import { isRelativeDateTimeValue, type RelativeDateTimeValue } from '../../cohortmanager/utils/cohortSqlResolver.ts'

type Unit = RelativeDateTimeValue['unit']

function relative(anchor: string, offset: number, unit: Unit = 'day'): string {
  return JSON.stringify({ mode: 'relative', anchor, offset, unit } satisfies RelativeDateTimeValue)
}

export interface TimePreset {
  id: string
  label: string
  /** Reads naturally after a verb phrase: «har gjort noe …». */
  phrase: string
  from: string
  to: string
}

export const TIME_PRESETS: TimePreset[] = [
  {
    id: 'h24',
    label: 'Siste 24 timer',
    phrase: 'i løpet av siste 24 timer',
    from: relative('now', -24, 'hour'),
    to: relative('now', 0),
  },
  {
    id: 'd7',
    label: 'Siste 7 dager',
    phrase: 'i løpet av siste 7 dager',
    from: relative('now', -7),
    to: relative('now', 0),
  },
  {
    id: 'd30',
    label: 'Siste 30 dager',
    phrase: 'i løpet av siste 30 dager',
    from: relative('now', -30),
    to: relative('now', 0),
  },
  {
    id: 'd90',
    label: 'Siste 90 dager',
    phrase: 'i løpet av siste 90 dager',
    from: relative('now', -90),
    to: relative('now', 0),
  },
  { id: 'today', label: 'I dag', phrase: 'i dag', from: relative('startOfDay', 0), to: relative('now', 0) },
  { id: 'yesterday', label: 'I går', phrase: 'i går', from: relative('startOfDay', -1), to: relative('startOfDay', 0) },
  {
    id: 'thisWeek',
    label: 'Denne uken',
    phrase: 'denne uken',
    from: relative('startOfWeek', 0),
    to: relative('now', 0),
  },
  {
    id: 'lastWeek',
    label: 'Forrige uke',
    phrase: 'forrige uke',
    from: relative('startOfWeek', -1, 'week'),
    to: relative('startOfWeek', 0),
  },
  {
    id: 'thisMonth',
    label: 'Denne måneden',
    phrase: 'denne måneden',
    from: relative('startOfMonth', 0),
    to: relative('now', 0),
  },
  {
    id: 'lastMonth',
    label: 'Forrige måned',
    phrase: 'forrige måned',
    from: relative('startOfMonth', -1, 'month'),
    to: relative('startOfMonth', 0),
  },
  { id: 'thisYear', label: 'I år', phrase: 'i år', from: relative('startOfYear', 0), to: relative('now', 0) },
]

export const DEFAULT_TIME_PRESET = TIME_PRESETS.find((p) => p.id === 'd30') as TimePreset

export function presetValue(preset: TimePreset): string {
  return JSON.stringify({ from: preset.from, to: preset.to })
}

function parseRange(raw: string): { from: string; to: string } | null {
  try {
    const parsed = JSON.parse(raw) as { from?: unknown; to?: unknown } | null
    if (parsed && typeof parsed.from === 'string' && typeof parsed.to === 'string') {
      return { from: parsed.from, to: parsed.to }
    }
  } catch {
    // not a range
  }
  return null
}

export function matchPreset(raw: string | null): TimePreset | undefined {
  if (!raw) return undefined
  const range = parseRange(raw)
  if (!range) return undefined
  return TIME_PRESETS.find((p) => p.from === range.from && p.to === range.to)
}

const UNIT_FORMS: Record<Unit, [string, string]> = {
  minute: ['minutt', 'minutter'],
  hour: ['time', 'timer'],
  day: ['dag', 'dager'],
  week: ['uke', 'uker'],
  month: ['måned', 'måneder'],
  year: ['år', 'år'],
}

function formatBound(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = raw
  }
  if (isRelativeDateTimeValue(parsed)) {
    if (parsed.anchor === 'now' && parsed.offset === 0) return 'nå'
    const amount = Math.abs(parsed.offset)
    const unit = UNIT_FORMS[parsed.unit][amount === 1 ? 0 : 1]
    return `${amount} ${unit} ${parsed.offset < 0 ? 'før' : 'etter'} ${parsed.anchor === 'now' ? 'nå' : 'periodestart'}`
  }
  const date = new Date(typeof parsed === 'string' ? parsed : raw)
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('nb-NO')
}

/** Norwegian phrase for a stored time range; empty string for «når som helst». */
export function describeTime(raw: string | null): string {
  if (!raw) return ''
  const preset = matchPreset(raw)
  if (preset) return preset.phrase
  const range = parseRange(raw)
  if (!range) return ''

  try {
    const from = JSON.parse(range.from) as unknown
    const to = JSON.parse(range.to) as unknown
    if (
      isRelativeDateTimeValue(from) &&
      from.anchor === 'now' &&
      from.offset < 0 &&
      isRelativeDateTimeValue(to) &&
      to.anchor === 'now' &&
      to.offset === 0
    ) {
      const amount = Math.abs(from.offset)
      return `i løpet av siste ${amount} ${UNIT_FORMS[from.unit][amount === 1 ? 0 : 1]}`
    }
  } catch {
    // fixed dates — fall through
  }
  return `fra ${formatBound(range.from)} til ${formatBound(range.to)}`
}
