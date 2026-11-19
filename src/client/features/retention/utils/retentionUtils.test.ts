import { describe, expect, it } from 'vitest'
import { buildShareParams } from './retentionUtils.ts'

describe('retention share path parameters', () => {
  it('publishes the canonical path when opening a legacy path link', () => {
    const params = buildShareParams('last_month', '/a', 'equals', 'same_url', '?pagePath=%2Fa&websiteId=site-1')

    expect(params.get('urlPath')).toBe('/a')
    expect(params.has('pagePath')).toBe(false)
    expect(params.get('websiteId')).toBe('site-1')
  })

  it('replaces a legacy path with the current canonical selection', () => {
    const params = buildShareParams(
      'current_month',
      '/b',
      'starts-with',
      'site',
      '?pagePath=%2Fa&urlPath=%2Fold&urlPath=%2Folder&period=last_7_days&other=keep',
    )

    expect(params.getAll('urlPath')).toEqual(['/b'])
    expect(params.has('pagePath')).toBe(false)
    expect(params.get('pathOperator')).toBe('starts-with')
    expect(params.get('retentionPeriod')).toBe('current_month')
    expect(params.get('retentionReturnScope')).toBe('site')
    expect(params.has('period')).toBe(false)
    expect(params.get('other')).toBe('keep')
  })

  it.each(['?pagePath=%2Fa', '?pagePath=%2Fa&urlPath=%2Fb', '?urlPath=%2Fa'])(
    'removes both path names and the operator when clearing a filter from %s',
    (search) => {
      const params = buildShareParams(
        'last_month',
        '',
        'equals',
        'site',
        `${search}&pathOperator=starts-with&websiteId=site-1`,
      )

      expect(params.has('pagePath')).toBe(false)
      expect(params.has('urlPath')).toBe(false)
      expect(params.has('pathOperator')).toBe(false)
      expect(params.get('websiteId')).toBe('site-1')
    },
  )
})
