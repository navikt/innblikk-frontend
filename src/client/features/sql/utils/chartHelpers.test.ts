import { describe, expect, it } from 'vitest'
import { prepareBarChartData, prepareLineChartData, preparePieChartData } from './chartHelpers'

describe('query chart date labels', () => {
  it('localizes single and multi-series callouts without changing timestamp coordinates', () => {
    const timestamp = '2026-01-01T23:30:00Z'
    const single = prepareLineChartData([{ day: { value: timestamp }, count: 3 }])
    const multi = prepareLineChartData([{ day: { value: timestamp }, series: 'A', count: 3 }])
    for (const chart of [single, multi]) {
      expect(chart?.data.lineChartData[0].data[0]).toMatchObject({
        x: new Date(timestamp),
        y: 3,
        xAxisCalloutData: '02.01.2026, 00:30:00',
      })
    }
  })

  it('localizes DATE categories in bar and pie charts', () => {
    const rows = [{ day: { value: '2026-08-01' }, count: 3 }]
    expect(prepareBarChartData(rows)?.data[0].x).toBe('01.08.2026')
    expect(preparePieChartData(rows)?.data[0].x).toBe('01.08.2026')
  })
})
