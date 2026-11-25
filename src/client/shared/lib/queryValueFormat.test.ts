import { describe, expect, it } from 'vitest'
import { formatQueryDateAxisLabel, formatQueryValue } from './queryValueFormat.ts'

describe('query date display', () => {
  it.each([
    ['2026-08-01T00:00:00.000Z', '01.08.2026, 02:00:00'],
    ['2026-09-01T00:00:00.000Z', '01.09.2026, 02:00:00'],
    ['2026-10-01T00:00:00.000Z', '01.10.2026, 02:00:00'],
    ['2026-01-01T23:30:00Z', '02.01.2026, 00:30:00'],
    ['2026-03-29T01:30:00Z', '29.03.2026, 03:30:00'],
    ['2026-10-25T01:30:00Z', '25.10.2026, 02:30:00'],
    ['2026-08-01T02:00:00+02:00', '01.08.2026, 02:00:00'],
  ])('formats %s in Oslo for strings, BigQuery wrappers and Date instances', (input, expected) => {
    expect(formatQueryValue(input)).toBe(expected)
    expect(formatQueryValue({ value: input })).toBe(expected)
    expect(formatQueryValue(new Date(input))).toBe(expected)
  })

  it('preserves DATE and timezone-free DATETIME calendar values', () => {
    expect(formatQueryValue({ value: '2026-08-01' })).toBe('01.08.2026')
    expect(formatQueryValue('2024-02-29')).toBe('29.02.2024')
    expect(formatQueryValue({ value: '2026-08-01T23:30:00' })).toBe('01.08.2026, 23:30:00')
    expect(formatQueryValue('2026-08-01 23:30:00')).toBe('01.08.2026, 23:30:00')
  })

  it('keeps ordinary values, JSON and invalid dates readable without treating them as dates', () => {
    expect(formatQueryValue(null)).toBe('')
    expect(formatQueryValue(50119)).toBe('50119')
    expect(formatQueryValue(false)).toBe('false')
    expect(formatQueryValue('/2026-08-01')).toBe('/2026-08-01')
    expect(formatQueryValue('2026-02-30')).toBe('2026-02-30')
    expect(formatQueryValue({ value: '2026-08-01T25:00:00Z' })).toBe('2026-08-01T25:00:00Z')
    expect(formatQueryValue({ value: '2026-08-01', label: 'metadata' })).toBe(
      '{"value":"2026-08-01","label":"metadata"}',
    )
    expect(formatQueryValue(['2026-08-01'])).toBe('["2026-08-01"]')
  })

  it('formats axis ticks using the Oslo calendar day', () => {
    expect(formatQueryDateAxisLabel(new Date('2026-07-31T23:30:00Z'))).toBe('1. aug.')
  })
})
