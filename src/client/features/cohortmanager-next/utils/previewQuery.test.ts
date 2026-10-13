import { describe, expect, it } from 'vitest'
import { buildPreviewQuery, type PreviewQueryInput } from './previewQuery.ts'
import type { CohortGroupNode } from '../../cohortmanager/model/types.ts'

const root: CohortGroupNode = {
  nodeType: 'GROUP',
  combinator: 'AND',
  negated: false,
  children: [
    {
      nodeType: 'GROUP',
      combinator: 'AND',
      negated: false,
      children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/soknad' }],
    },
  ],
}
const input: PreviewQueryInput = {
  projectId: 'test-project',
  websiteId: 'site-1',
  root,
  startDate: new Date('2026-10-01T00:00:00Z'),
  endDate: new Date('2026-10-07T23:59:59Z'),
  basis: 'auto',
  cohorts: new Map(),
}

describe('buildPreviewQuery', () => {
  it('previews a browser group using only supported session dimensions', () => {
    const query = buildPreviewQuery({
      ...input,
      root: {
        ...root,
        children: [
          {
            nodeType: 'GROUP',
            combinator: 'AND',
            negated: false,
            children: [{ nodeType: 'CONDITION', field: 'browser', conditionType: 'EQUALS', value: 'chrome' }],
          },
        ],
      },
    })
    expect(query).toContain("e.browser = 'chrome'")
    expect(query).toContain('session.browser, session.os, session.device, session.country')
    for (const unused of ['subdivision1', 'city', 'screen', 'language']) {
      expect(query).not.toContain(`session.${unused}`)
    }
  })

  it('uses the same identity for membership and counting with bounded source tables', () => {
    const query = buildPreviewQuery(input)
    expect(query).toContain(
      "COALESCE(NULLIF(e.session_distinct_id, ''), CAST(e.session_id AS STRING)) AS preview_visitor_id",
    )
    expect(query).toContain('e.preview_visitor_id = person.preview_visitor_id')
    expect(query).toContain('SELECT DISTINCT preview_visitor_id FROM preview_events')
    for (const alias of ['session', 'event']) {
      expect(query).toContain(`${alias}.website_id = 'site-1' AND ${alias}.created_at BETWEEN`)
    }
    expect(query).toContain("TIMESTAMP('2026-10-07T23:59:59.000Z')")
    expect(query).not.toContain('preview_details AS')
  })

  it.each([
    ['session', 'CAST(e.session_id AS STRING)'],
    ['cookie', "NULLIF(e.session_distinct_id, '')"],
  ] as const)('uses the selected %s identity throughout the query', (basis, expression) => {
    expect(buildPreviewQuery({ ...input, basis })).toContain(`${expression} AS preview_visitor_id`)
  })

  it('rejects missing, cross-website and circular references instead of returning misleading counts', () => {
    const reference: CohortGroupNode = {
      ...root,
      children: [{ nodeType: 'COHORT_REF', referencedCohortId: 7, negated: false }],
    }
    expect(() => buildPreviewQuery({ ...input, root: reference })).toThrow(/finnes ikke/)
    const cohorts = new Map([['7', { id: 7, name: 'Other', websiteId: 'site-2', root }]])
    expect(() => buildPreviewQuery({ ...input, root: reference, cohorts })).toThrow(/finnes ikke/)
    cohorts.set('7', { id: 7, name: 'Loop', websiteId: 'site-1', root: reference })
    expect(() => buildPreviewQuery({ ...input, root: reference, cohorts })).toThrow(/sirkel/)
  })

  it('rejects empty criteria and invalid date ranges', () => {
    expect(() => buildPreviewQuery({ ...input, root: { ...root, children: [] } })).toThrow(/Fullfør/)
    expect(() => buildPreviewQuery({ ...input, endDate: new Date('invalid') })).toThrow(/periode/)
  })

  it('keeps country criteria and negation on the shared visitor identity', () => {
    const query = buildPreviewQuery({
      ...input,
      root: {
        ...root,
        children: [
          {
            nodeType: 'GROUP',
            combinator: 'AND',
            negated: true,
            children: [{ nodeType: 'CONDITION', field: 'country', conditionType: 'EQUALS', value: 'no' }],
          },
        ],
      },
    })
    expect(query).toContain('WHERE NOT (EXISTS')
    expect(query).toContain('e.preview_visitor_id = person.preview_visitor_id')
    expect(query).toContain("e.country = 'no'")
    expect(query).toContain('session.country')
  })

  it.each(['FOLLOWED_BY', 'NOT_FOLLOWED_BY'] as const)(
    'resolves %s across the same visitor, not only one session',
    (relation) => {
      const anchor = root.children[0] as CohortGroupNode
      const query = buildPreviewQuery({
        ...input,
        root: {
          ...root,
          children: [{ nodeType: 'SEQUENCE', anchor, target: anchor, relation, windowValue: 1, windowUnit: 'DAY' }],
        },
      })
      expect(query).toContain('x.preview_visitor_id = e.preview_visitor_id')
      expect(query).toContain('x.created_at > e.created_at')
      expect(query).toContain('TIMESTAMP_ADD(e.created_at, INTERVAL 1 DAY)')
      if (relation === 'NOT_FOLLOWED_BY') expect(query).toContain('NOT EXISTS')
    },
  )

  it('bounds event details from referenced cohorts and resolves their criteria', () => {
    const detailRoot: CohortGroupNode = {
      ...root,
      children: [
        {
          nodeType: 'GROUP',
          combinator: 'AND',
          negated: false,
          children: [{ nodeType: 'CONDITION', paramKey: 'skjema', conditionType: 'EQUALS', value: 'soknad' }],
        },
      ],
    }
    const query = buildPreviewQuery({
      ...input,
      root: { ...root, children: [{ nodeType: 'COHORT_REF', referencedCohortId: 7, negated: false }] },
      cohorts: new Map([['7', { id: 7, name: 'Skjema', websiteId: 'site-1', root: detailRoot }]]),
    })
    expect(query).toContain('preview_details AS')
    expect(query).toContain("detail.website_id = 'site-1' AND detail.created_at BETWEEN")
    expect(query).toContain('LEFT JOIN preview_details')
    expect(query).toContain("data_key = 'skjema'")
    expect(query).toContain("string_value = 'soknad'")
  })
})
