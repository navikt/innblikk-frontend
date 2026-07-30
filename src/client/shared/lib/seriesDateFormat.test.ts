import { describe, it, expect } from 'vitest'
import { formatSeriesAxisLabel, formatSeriesCalloutLabel } from './seriesDateFormat.ts'

// 2026-07-28 is a Tuesday.
const tuesday = new Date(2026, 6, 28, 21, 0, 0)

describe('formatSeriesAxisLabel', () => {
  it('formats hour granularity as HH:mm', () => {
    expect(formatSeriesAxisLabel(tuesday, 'hour')).toBe('21:00')
  })

  it('formats day granularity as day + short month, no time', () => {
    expect(formatSeriesAxisLabel(tuesday, 'day')).toBe('28. juli')
  })

  it('formats week granularity as "Uke <n>"', () => {
    expect(formatSeriesAxisLabel(tuesday, 'week')).toMatch(/^Uke \d+$/)
  })

  it('formats month granularity as short month + year', () => {
    expect(formatSeriesAxisLabel(tuesday, 'month')).toBe('juli 2026')
  })
})

describe('formatSeriesCalloutLabel', () => {
  it('formats hour granularity with weekday, date, and local time', () => {
    expect(formatSeriesCalloutLabel(tuesday, 'hour')).toBe('tir 28. juli 2026 kl. 21:00')
  })

  it('formats day granularity with weekday and date, no time', () => {
    expect(formatSeriesCalloutLabel(tuesday, 'day')).toBe('tir 28. juli 2026')
  })

  it('formats week granularity as "Uke <n> (<date>)"', () => {
    expect(formatSeriesCalloutLabel(tuesday, 'week')).toMatch(/^Uke \d+ \(28\. juli 2026\)$/)
  })

  it('formats month granularity as full month name + year', () => {
    expect(formatSeriesCalloutLabel(tuesday, 'month')).toBe('juli 2026')
  })
})
