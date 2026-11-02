import { describe, expect, it } from 'vitest'
import { generateDashboardFunnelSql, generateMetabaseFunnelSql } from './funnelUtils'
import { processDashboardSql } from '../../dashboard/utils/queryUtils'
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

  describe('generateDashboardFunnelSql', () => {
    const sql = `WITH events AS (
      SELECT * FROM \`project.umami_views.event\`
      WHERE website_id = 'site-1'
        AND created_at BETWEEN '2026-10-04T22:00:00.000Z' AND '2026-11-01T22:59:59.999Z'
    )
    SELECT session_id FROM events e
    WHERE e.url_path_normalized = prev.url_path1
      AND COALESCE(p_1_0.string_value, CAST(p_1_0.number_value AS STRING)) = '1'`

    it('marks the visualization and only replaces executed date bounds, preserving the actual funnel semantics', () => {
      const template = generateDashboardFunnelSql(sql)
      expect(template).toMatch(/^WITH \/\* @chart funnel \*\//)
      expect(template).toContain('[[AND {{created_at}}]]')
      expect(template).not.toContain('2026-10-04')
      expect(template).toContain('e.url_path_normalized = prev.url_path1')
      expect(template).toContain("CAST(p_1_0.number_value AS STRING)) = '1'")
      expect(template).toContain("website_id = 'site-1'")

      const processed = processDashboardSql(template, 'site-1', {
        dateRange: 'last_7_days',
        metricType: 'visitors',
        pathOperator: 'equals',
        urlFilters: [],
      })
      expect(processed).not.toMatch(/\{\{|\[\[/)
      expect(processed).toContain('created_at')
      expect(processed).toContain('Europe/Oslo')
    })

    it('fails explicitly instead of saving fixed dates when the generated query shape is incompatible', () => {
      expect(() => generateDashboardFunnelSql('SELECT 1')).toThrow('Kunne ikke klargjøre datofilteret')
    })

    it('does not silently omit the marker when the statement does not begin with SELECT or WITH', () => {
      expect(() => generateDashboardFunnelSql(`-- introductory comment\n${sql}`)).toThrow(
        'Kunne ikke klargjøre SQL-spørringen',
      )
    })
  })
})
