import { describe, expect, it } from 'vitest'
import {
  BQ_END_OF_YESTERDAY_SQL,
  BQ_NOW_SQL,
  BQ_START_OF_TODAY_SQL,
  bqLastNDaysSQL,
  getBqRelativePeriodSQL,
} from './bigqueryDateRanges.ts'

const OSLO = `'Europe/Oslo'`

describe('bigqueryDateRanges', () => {
  it('ends rolling day presets at end-of-yesterday, starting N days back at midnight — Oslo-anchored', () => {
    expect(bqLastNDaysSQL(7)).toEqual({
      fromSQL: `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), ${OSLO}), INTERVAL 7 DAY))`,
      toSQL: BQ_END_OF_YESTERDAY_SQL,
    })
    expect(bqLastNDaysSQL(30).fromSQL).toBe(`TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), ${OSLO}), INTERVAL 30 DAY))`)
  })

  it('keeps sub-day relative periods open-ended at now', () => {
    expect(getBqRelativePeriodSQL('30', 'minute')).toEqual({
      fromSQL: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)',
      toSQL: BQ_NOW_SQL,
    })
    expect(getBqRelativePeriodSQL('12', 'hour')).toEqual({
      fromSQL: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 12 HOUR)',
      toSQL: BQ_NOW_SQL,
    })
  })

  it('ends day-and-larger relative periods at end-of-yesterday', () => {
    for (const [amount, unit, expectedFrom] of [
      ['7', 'day', `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), ${OSLO}), INTERVAL 7 DAY))`],
      ['2', 'week', `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), ${OSLO}), INTERVAL 2 WEEK))`],
      ['3', 'month', `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), ${OSLO}), INTERVAL 3 MONTH))`],
      ['2', 'quarter', `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), ${OSLO}), INTERVAL 6 MONTH))`],
      ['1', 'year', `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), ${OSLO}), INTERVAL 1 YEAR))`],
    ] as const) {
      expect(getBqRelativePeriodSQL(amount, unit)).toEqual({ fromSQL: expectedFrom, toSQL: BQ_END_OF_YESTERDAY_SQL })
    }
  })

  it('defaults unknown units to days', () => {
    expect(getBqRelativePeriodSQL('5', 'fortnight')).toEqual(bqLastNDaysSQL('5'))
  })

  it('anchors every day boundary to Europe/Oslo (a UTC bound leaks early hours of the next Oslo day)', () => {
    // Regression: TIMESTAMP('2026-09-28T23:59:59') is UTC — events from
    // 2026-09-29 00:00–01:59 Oslo (UTC+2) slipped under the "yesterday" bound,
    // so "siste 7 dager" charts showed a partial today-row.
    for (const expr of [BQ_START_OF_TODAY_SQL, BQ_END_OF_YESTERDAY_SQL, bqLastNDaysSQL(7).fromSQL]) {
      expect(expr).toContain(OSLO)
    }
    expect(BQ_START_OF_TODAY_SQL).toBe(`TIMESTAMP(DATE(CURRENT_TIMESTAMP(), ${OSLO}))`)
    expect(BQ_NOW_SQL).toBe('CURRENT_TIMESTAMP()')
  })
})
