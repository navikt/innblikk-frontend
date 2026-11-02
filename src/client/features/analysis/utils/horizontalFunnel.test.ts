import { describe, expect, it } from 'vitest'
import { computeFunnelStepMetrics } from './horizontalFunnel'

describe('computeFunnelStepMetrics', () => {
  it('preserves conversion and dropoff for populated steps', () => {
    expect(
      computeFunnelStepMetrics(
        [
          { step: 0, count: 100 },
          { step: 1, count: 25 },
        ],
        1,
      ),
    ).toEqual({
      percentageOfPrev: 25,
      dropoffCount: 75,
      dropoffPercentage: 75,
      totalConversionPercent: 25,
    })
  })

  it('reports the full dropoff when a populated step leads to zero', () => {
    expect(
      computeFunnelStepMetrics(
        [
          { step: 0, count: 100 },
          { step: 1, count: 0 },
        ],
        1,
      ),
    ).toEqual({
      percentageOfPrev: 0,
      dropoffCount: 100,
      dropoffPercentage: 100,
      totalConversionPercent: 0,
    })
  })

  it.each([0, 1])('never reports a conversion from empty steps at index %s', (index) => {
    expect(
      computeFunnelStepMetrics(
        [
          { step: 0, count: 0 },
          { step: 1, count: 0 },
        ],
        index,
      ),
    ).toEqual({
      percentageOfPrev: 0,
      dropoffCount: 0,
      dropoffPercentage: 0,
      totalConversionPercent: 0,
    })
  })
})
