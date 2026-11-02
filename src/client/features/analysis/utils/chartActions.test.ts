import { buildEditorUrl, generateShareUrl } from './chartActions'
import type { SavedChart } from '../../../shared/types/savedChart'

const chart: SavedChart = {
  title: 'Hendelser',
  type: 'table',
  sql: 'SELECT event_name FROM events WHERE event_name = {{event}}',
}
const filters = {
  urlFilters: [],
  dateRange: 'last_7_days',
  pathOperator: 'equals',
  metricType: 'visitors' as const,
  customVariableValues: { event: 'paid' },
}

describe('chart actions with custom filters', () => {
  it('carries selected values into the SQL editor without baking away its filter placeholders', () => {
    const url = new URL(buildEditorUrl(chart, 'website-1', filters), window.location.origin)
    expect(url.searchParams.get('sql')).toBe(chart.sql)
    expect(url.searchParams.get('filterValues')).toBe('{"event":"paid"}')
  })

  it('shares the filtered results rather than unresolved placeholders', () => {
    const url = new URL(generateShareUrl(chart, 'website-1', filters))
    expect(url.searchParams.get('sql')).toBe("SELECT event_name FROM events WHERE event_name = 'paid'")
  })
})
