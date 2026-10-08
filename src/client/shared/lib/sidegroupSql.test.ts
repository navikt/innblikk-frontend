import { describe, expect, it } from 'vitest'
import { buildSidegroupSqlCondition } from './sidegroupSql.ts'

describe('buildSidegroupSqlCondition', () => {
  it('uses literal, case-insensitive matching for every rule type', () => {
    const condition = buildSidegroupSqlCondition(
      {
        id: 'sidegroup-1',
        name: 'Example',
        websiteId: 'website-1',
        include: ['/news_%'],
        exclude: ['/private_%'],
        exact: ['/EXACT'],
        startWith: ['/start_%'],
        endWith: ['/end_%'],
      },
      'e.url_path',
    )

    expect(condition).toContain("STRPOS(LOWER(e.url_path), LOWER('/news_%')) > 0")
    expect(condition).toContain("STRPOS(LOWER(e.url_path), LOWER('/private_%')) = 0")
    expect(condition).toContain("LOWER(e.url_path) = LOWER('/EXACT')")
    expect(condition).toContain("STARTS_WITH(LOWER(e.url_path), LOWER('/start_%'))")
    expect(condition).toContain("ENDS_WITH(LOWER(e.url_path), LOWER('/end_%'))")
    expect(condition).not.toContain('LIKE')
  })

  it('escapes apostrophes in BigQuery string literals', () => {
    const condition = buildSidegroupSqlCondition(
      { id: 'sidegroup-1', name: 'Example', websiteId: 'website-1', exact: ["/it's"] },
      'e.url_path',
    )

    expect(condition).toContain("LOWER(e.url_path) = LOWER('/it\\'s')")
  })
})
