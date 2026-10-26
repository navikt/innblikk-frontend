import { describe, expect, it, vi } from 'vitest'
import { getCompletedQueryStats, parseMaxRows, readQueryRows } from './sqlRoutes.js'

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

describe('parseMaxRows', () => {
  it.each([
    [100, 100],
    ['1000', 1000],
    [50000, 10000],
    [0, null],
    [-5, null],
    [1.5, null],
    ['abc', null],
    [undefined, null],
    [null, null],
  ])('turns %j into %j', (value, expected) => {
    expect(parseMaxRows(value)).toBe(expected)
  })
})

describe('readQueryRows', () => {
  const rows = (count) => Array.from({ length: count }, (_, index) => ({ id: index }))

  it('reads everything as before when no limit is given', async () => {
    const job = { getQueryResults: vi.fn().mockResolvedValue([rows(7)]) }
    expect(await readQueryRows(job, null)).toEqual({ rows: rows(7), totalRows: 7, truncated: false })
    expect(job.getQueryResults).toHaveBeenCalledWith()
  })

  it('asks BigQuery for a single page and reports the total', async () => {
    const job = { getQueryResults: vi.fn().mockResolvedValue([rows(100), null, { totalRows: '2500000' }]) }
    const result = await readQueryRows(job, 100)
    expect(job.getQueryResults).toHaveBeenCalledWith({ maxResults: 100, autoPaginate: false })
    expect(result.rows).toHaveLength(100)
    expect(result.totalRows).toBe(2500000)
    expect(result.truncated).toBe(true)
  })

  it('reports no truncation when the result fits', async () => {
    const job = { getQueryResults: vi.fn().mockResolvedValue([rows(40), null, { totalRows: '40' }]) }
    expect(await readQueryRows(job, 100)).toMatchObject({ totalRows: 40, truncated: false })
  })

  it('still cuts the rows when a data mode ignores maxResults and sends no response', async () => {
    const job = { getQueryResults: vi.fn().mockResolvedValue([rows(500)]) }
    const result = await readQueryRows(job, 100)
    expect(result.rows).toHaveLength(100)
    expect(result.totalRows).toBe(500)
    expect(result.truncated).toBe(true)
  })

  it('never reports fewer total rows than it returns', async () => {
    const job = { getQueryResults: vi.fn().mockResolvedValue([rows(10), null, { totalRows: '3' }]) }
    const result = await readQueryRows(job, 100)
    expect(result.totalRows).toBe(10)
    expect(result.truncated).toBe(false)
  })

  it('says the result may be cut, without a total, when a full page arrives and no total is reported', async () => {
    const job = { getQueryResults: vi.fn().mockResolvedValue([rows(100), null, {}]) }
    expect(await readQueryRows(job, 100)).toMatchObject({ totalRows: null, truncated: true })
  })

  it('says the result is complete when fewer rows than the limit arrive and no total is reported', async () => {
    const job = { getQueryResults: vi.fn().mockResolvedValue([rows(30)]) }
    expect(await readQueryRows(job, 100)).toMatchObject({ totalRows: 30, truncated: false })
  })
})
