import { describe, expect, it } from 'vitest'
import { generateMetabaseFunnelSql } from './funnelUtils'
import type { FunnelStep } from '../model/types'
import type { Website } from '../../../shared/types/chart'

const website: Website = {
  id: 'site-1',
  name: 'Test',
  domain: 'example.com',
  teamId: 'team-1',
  createdAt: '2026-10-01T00:00:00Z',
}

describe('generateMetabaseFunnelSql detail filters', () => {
  it.each([true, false])('supports numeric and text details with onlyDirectEntry=%s', (onlyDirectEntry) => {
    const steps: FunnelStep[] = [
      {
        type: 'event',
        value: 'start',
        params: [{ key: 'step', value: '1', operator: 'equals' }],
      },
      {
        type: 'event',
        value: 'finish',
        params: [
          { key: 'step', value: '2', operator: 'equals' },
          { key: 'code', value: '001', operator: 'equals' },
          { key: 'text', value: "NAV's", operator: 'equals' },
          { key: 'part', value: '3', operator: 'contains' },
        ],
      },
    ]

    const sql = generateMetabaseFunnelSql(
      [
        { step: 0, url: 'start', count: 10 },
        { step: 1, url: 'finish', count: 5 },
      ],
      steps,
      website,
      onlyDirectEntry,
    )

    expect(sql).toContain("COALESCE(p_0_0.string_value, CAST(p_0_0.number_value AS STRING)) = '1'")
    expect(sql).toContain("COALESCE(p_1_0.string_value, CAST(p_1_0.number_value AS STRING)) = '2'")
    expect(sql).toContain("COALESCE(p_1_1.string_value, CAST(p_1_1.number_value AS STRING)) = '001'")
    expect(sql).toContain("COALESCE(p_1_2.string_value, CAST(p_1_2.number_value AS STRING)) = 'NAV''s'")
    expect(sql).toContain("COALESCE(p_1_3.string_value, CAST(p_1_3.number_value AS STRING)) LIKE '%3%'")
  })
})
