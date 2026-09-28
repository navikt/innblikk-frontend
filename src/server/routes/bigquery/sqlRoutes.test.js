import { describe, expect, it } from 'vitest'
import { getCompletedQueryStats } from './sqlRoutes.js'

describe('getCompletedQueryStats', () => {
  it('calculates processed data and estimated on-demand cost from completed job metadata', () => {
    const fourGiB = 4 * 1024 ** 3

    expect(
      getCompletedQueryStats({
        statistics: {
          totalBytesProcessed: String(fourGiB),
          query: { totalBytesBilled: String(fourGiB), cacheHit: false },
        },
      }),
    ).toEqual({
      totalBytesProcessed: fourGiB,
      totalBytesBilled: fourGiB,
      totalBytesProcessedGB: '4.00',
      estimatedCostUSD: '0.024',
      cacheHit: false,
    })
  })

  it('reports no billed data or cost for a cache hit', () => {
    const fourGiB = 4 * 1024 ** 3

    expect(
      getCompletedQueryStats({
        statistics: {
          totalBytesProcessed: String(fourGiB),
          query: { totalBytesBilled: String(fourGiB), cacheHit: true },
        },
      }),
    ).toMatchObject({
      totalBytesProcessed: fourGiB,
      totalBytesBilled: 0,
      estimatedCostUSD: '0.000',
      cacheHit: true,
    })
  })
})
