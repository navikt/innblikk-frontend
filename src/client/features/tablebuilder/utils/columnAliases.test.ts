import { describe, expect, it } from 'vitest'
import { getUniqueColumnAliases, quoteBigQueryIdentifier } from './columnAliases.ts'

describe('column aliases', () => {
  it('preserves Norwegian letters and spaces', () => {
    expect(getUniqueColumnAliases(['Besøk', 'Unike besøkende', 'URL-sti'])).toEqual([
      'Besøk',
      'Unike besøkende',
      'URL-sti',
    ])
  })

  it('gives duplicate labels unique names', () => {
    expect(getUniqueColumnAliases(['Besøk', 'besøk'])).toEqual(['Besøk', 'besøk (2)'])
  })

  it('quotes aliases safely for BigQuery', () => {
    expect(quoteBigQueryIdentifier('Besøk `nå`')).toBe('`Besøk \\`nå\\``')
  })
})
