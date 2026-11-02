import { describe, expect, it } from 'vitest'
import { FUNNEL_CHART_MARKER, getDashboardFunnel, hasFunnelChartMarker } from './funnelData'

describe('dashboard funnel data', () => {
  it('orders API funnel rows by their step number, not column order or count', () => {
    expect(
      getDashboardFunnel([
        { count: '20', url: 'Fullført', step: '1' },
        { count: { value: '100' }, url: '/stillinger', step: { value: '0' } },
      ]),
    ).toEqual({
      ordered: true,
      steps: [
        { step: 0, url: '/stillinger', count: 100 },
        { step: 1, url: 'Fullført', count: 20 },
      ],
    })
  })

  it('supports Metabase funnel output with one-based step numbers', () => {
    expect(
      getDashboardFunnel([
        { step_number: 1, step: 'Gjør et søk', count: 100 },
        { step_number: 2, step: 'Søker med superrask søknad', count: 20 },
      ]),
    ).toEqual({
      ordered: true,
      steps: [
        { step: 0, url: 'Gjør et søk', count: 100 },
        { step: 1, url: 'Søker med superrask søknad', count: 20 },
      ],
    })
  })

  it('preserves the query order for name/value output without assuming it is a funnel', () => {
    expect(
      getDashboardFunnel([
        { name: 'Søk', value: 100 },
        { name: 'Søknad', value: 20 },
      ]),
    ).toEqual({
      ordered: false,
      steps: [
        { step: 0, url: 'Søk', count: 100 },
        { step: 1, url: 'Søknad', count: 20 },
      ],
    })
  })

  it('keeps empty steps instead of dropping them', () => {
    expect(
      getDashboardFunnel([
        { step: 0, url: 'Start', count: 0 },
        { step: 1, url: 'Slutt', count: 0 },
      ])?.steps.map((step) => step.count),
    ).toEqual([0, 0])
  })

  it.each(
    [
      undefined,
      [],
      [{ name: 'Bare ett steg', value: 1 }],
      [
        { event_name: 'start', count: 2 },
        { event_name: 'end', count: 1 },
      ],
      [
        { step: 0, url: 'Start', count: 1 },
        { step: 1, url: 'Slutt', count: 2 },
      ],
      [
        { step: 0, url: 'Start', count: 2 },
        { step: 0, url: 'Slutt', count: 1 },
      ],
      [
        { step: 0, url: 'Start', count: 2 },
        { step: 2, url: 'Slutt', count: 1 },
      ],
      [
        { name: 'Start', value: 2 },
        { name: 'Slutt', value: null },
      ],
      [
        { name: 'Start', value: '2abc' },
        { name: 'Slutt', value: 1 },
      ],
      [
        { name: 'Start', value: 2 },
        { name: 'Slutt', value: -1 },
      ],
      [
        { name: 'Start', value: 2 },
        { name: 'Slutt', value: 1.5 },
      ],
      [
        { name: 'Start', value: 2 },
        { name: '', value: 1 },
      ],
    ].map((rows) => ({ rows })),
  )('does not silently turn unrelated or invalid results into a funnel: $rows', ({ rows }) => {
    expect(getDashboardFunnel(rows)).toBeNull()
  })

  it('recognizes explicit metadata even after SQL storage compaction', () => {
    expect(hasFunnelChartMarker(`${FUNNEL_CHART_MARKER} SELECT name, value FROM funnel`)).toBe(true)
    expect(hasFunnelChartMarker(`WITH ${FUNNEL_CHART_MARKER} events AS (SELECT 1) SELECT * FROM events`)).toBe(true)
    expect(hasFunnelChartMarker(`select ${FUNNEL_CHART_MARKER}\nname, value FROM funnel`)).toBe(true)
    expect(hasFunnelChartMarker("SELECT '/* @chart funnel */' AS name")).toBe(false)
    expect(hasFunnelChartMarker("WITH events AS (SELECT '/* @chart funnel */') SELECT * FROM events")).toBe(false)
  })
})
