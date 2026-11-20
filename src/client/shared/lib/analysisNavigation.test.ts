import { describe, expect, it } from 'vitest'
import { preserveSharedAnalysisParams } from './analysisNavigation.ts'

describe('preserveSharedAnalysisParams', () => {
  it('does not carry a report-specific sidegroup operator without its selection', () => {
    expect(
      preserveSharedAnalysisParams('/utforsk-hendelser', '?websiteId=site-1&pathOperator=sidegroup&sidegroupId=42'),
    ).toBe('/utforsk-hendelser?websiteId=site-1')
  })

  it('keeps shared filters, including multiple URL paths, between reports', () => {
    const target = preserveSharedAnalysisParams(
      '/markedsanalyse',
      '?urlPath=%2Fnyhetsbrev&urlPath=%2Fforside&pathOperator=in&metricType=visitors',
    )

    expect(target).toBe('/markedsanalyse?urlPath=%2Fnyhetsbrev&urlPath=%2Fforside&pathOperator=in&metricType=visitors')
  })

  it('clears detail selections while preserving shared analysis context', () => {
    const target = preserveSharedAnalysisParams(
      '/utforsk-hendelser',
      '?websiteId=site-1&period=last_7_days&event=navn&parameter=valg&metricType=visitors&sql=secret',
    )
    expect(target).toBe('/utforsk-hendelser?period=last_7_days&websiteId=site-1&metricType=visitors')
  })

  it('merges explicit destination parameters and preserves its hash', () => {
    const target = preserveSharedAnalysisParams(
      '/utforsk-hendelser/hendelse?event=A%2BB+C&websiteId=other#detaljer',
      '?websiteId=site-1&urlPath=%2Fa&urlPath=%2Fb&event=old',
    )
    const url = new URL(target, 'https://example.test')
    expect(url.searchParams.get('event')).toBe('A+B C')
    expect(url.searchParams.get('websiteId')).toBe('other')
    expect(url.searchParams.getAll('urlPath')).toEqual(['/a', '/b'])
    expect(url.hash).toBe('#detaljer')
  })
})
