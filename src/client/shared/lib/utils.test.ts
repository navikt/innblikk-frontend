import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDateRangeFromPeriod } from './utils.ts'

describe('getDateRangeFromPeriod', () => {
  afterEach(() => vi.useRealTimers())

  it('uses the seven completed days before today for last_7_days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0))

    const range = getDateRangeFromPeriod('last_7_days')

    expect(range?.startDate).toEqual(new Date(2026, 8, 21, 0, 0, 0, 0))
    expect(range?.endDate).toEqual(new Date(2026, 8, 27, 23, 59, 59, 999))
  })

  it('uses the 28 completed days before today for last_28_days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0))

    const range = getDateRangeFromPeriod('last_28_days')

    expect(range?.startDate).toEqual(new Date(2026, 7, 31, 0, 0, 0, 0))
    expect(range?.endDate).toEqual(new Date(2026, 8, 27, 23, 59, 59, 999))
  })

  it('ends current calendar presets yesterday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0, 0))

    const week = getDateRangeFromPeriod('this_week')
    const month = getDateRangeFromPeriod('current_month')

    expect(week?.startDate).toEqual(new Date(2026, 8, 28, 0, 0, 0, 0))
    expect(week?.endDate).toEqual(new Date(2026, 8, 29, 23, 59, 59, 999))
    expect(month?.startDate).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
    expect(month?.endDate).toEqual(new Date(2026, 8, 29, 23, 59, 59, 999))
  })

  it('still includes the current partial day for today', () => {
    vi.useFakeTimers()
    const now = new Date(2026, 8, 28, 12, 34, 56)
    vi.setSystemTime(now)

    const range = getDateRangeFromPeriod('today')

    expect(range?.startDate).toEqual(new Date(2026, 8, 28, 0, 0, 0, 0))
    expect(range?.endDate).toEqual(now)
  })

  it('preserves an explicitly selected custom range including today', () => {
    vi.useFakeTimers()
    const now = new Date(2026, 8, 28, 12, 34, 56)
    vi.setSystemTime(now)

    const range = getDateRangeFromPeriod('custom', new Date(2026, 8, 25), new Date(2026, 8, 28))

    expect(range?.startDate).toEqual(new Date(2026, 8, 25, 0, 0, 0, 0))
    expect(range?.endDate).toEqual(now)
  })
})
