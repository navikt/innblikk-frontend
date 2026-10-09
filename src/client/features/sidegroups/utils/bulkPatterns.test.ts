import { hasMultipleValues, parseBulkPatterns } from './bulkPatterns.ts'

describe('parseBulkPatterns', () => {
  it('splits on new lines, commas and semicolons and trims', () => {
    const { patterns, invalid } = parseBulkPatterns(' /a/ ,/b/;\n/c/\r\n\n/d/ ')
    expect(patterns).toEqual(['/a/', '/b/', '/c/', '/d/'])
    expect(invalid).toEqual([])
  })

  it('turns full URLs into paths and ignores query strings', () => {
    const { patterns } = parseBulkPatterns('https://www.nav.no/soknad/dagpenger?x=1\nhttps://nav.no/hjelp', 'nav.no')
    expect(patterns).toEqual(['/soknad/dagpenger', '/hjelp'])
  })

  it('rejects URLs that belong to another website', () => {
    const { patterns, invalid } = parseBulkPatterns('https://nav.no/a\nhttps://annet.no/b', 'nav.no')
    expect(patterns).toEqual(['/a'])
    expect(invalid).toEqual(['https://annet.no/b'])
  })

  it('accepts subdomains of the website', () => {
    expect(parseBulkPatterns('https://www.ansatt.nav.no/a', 'nav.no').invalid).toEqual([])
  })

  it('keeps plain patterns as typed, without adding a slash', () => {
    expect(parseBulkPatterns('.pdf, soknad').patterns).toEqual(['.pdf', 'soknad'])
  })

  it('removes duplicates', () => {
    expect(parseBulkPatterns('/a/\n/a/').patterns).toEqual(['/a/'])
  })

  it('does not check the domain when the website is unknown', () => {
    expect(parseBulkPatterns('https://hvor-som-helst.no/a').patterns).toEqual(['/a'])
  })
})

describe('hasMultipleValues', () => {
  it('detects separators', () => {
    expect(hasMultipleValues('/a/\n/b/')).toBe(true)
    expect(hasMultipleValues('/a/,/b/')).toBe(true)
    expect(hasMultipleValues('/a/')).toBe(false)
  })
})
