import { describe, expect, it } from 'vitest'
import { preserveSharedAnalysisParams } from './analysisNavigation.ts'

describe('preserveSharedAnalysisParams', () => {
  it('keeps shared filters, including multiple URL paths, between reports', () => {
    const target = preserveSharedAnalysisParams(
      '/markedsanalyse',
      '?urlPath=%2Fnyhetsbrev&urlPath=%2Fforside&pathOperator=in&metricType=visitors',
    )

    expect(target).toBe('/markedsanalyse?urlPath=%2Fnyhetsbrev&urlPath=%2Fforside&pathOperator=in')
  })
})
