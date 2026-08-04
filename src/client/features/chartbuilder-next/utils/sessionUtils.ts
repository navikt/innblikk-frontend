import type { ChartConfig, Filter } from '../../../shared/types/chart.ts'
import { SESSION_COLUMNS } from '../model/constants.ts'

export const isSessionColumn = (column: string): boolean => {
  return (SESSION_COLUMNS as readonly string[]).includes(column)
}

/** Get only the specific session columns that are actually needed */
export const getRequiredSessionColumns = (chartConfig: ChartConfig, filtersList: Filter[]): string[] => {
  const requiredColumns = new Set<string>()

  // Check group by fields
  chartConfig.groupByFields.forEach((field) => {
    if (isSessionColumn(field)) {
      requiredColumns.add(field)
    }
  })

  // Check filters
  filtersList.forEach((filter) => {
    if (isSessionColumn(filter.column)) {
      requiredColumns.add(filter.column)
    }
  })

  // Check metrics
  chartConfig.metrics.forEach((metric) => {
    if (metric.column && isSessionColumn(metric.column)) {
      requiredColumns.add(metric.column)
    }

    if (metric.function === 'count_where' && metric.whereColumn && isSessionColumn(metric.whereColumn)) {
      requiredColumns.add(metric.whereColumn)
    }
  })

  return Array.from(requiredColumns)
}

/** Determine which tables are required for the query */
export const getRequiredTables = (
  chartConfig: ChartConfig,
  filtersList: Filter[],
): { session: boolean; eventData: boolean } => {
  const tables = { session: false, eventData: false }

  if (chartConfig.groupByFields.some((field) => isSessionColumn(field))) {
    tables.session = true
  }

  if (filtersList.some((filter) => isSessionColumn(filter.column))) {
    tables.session = true
  }

  if (
    chartConfig.metrics.some((metric) => {
      if (metric.column && isSessionColumn(metric.column)) {
        return true
      }

      if (metric.function === 'count_where' && metric.whereColumn && isSessionColumn(metric.whereColumn)) {
        return true
      }

      if (
        (metric.function === 'percentage' || metric.function === 'andel') &&
        metric.column &&
        ['session_id', 'visit_id'].includes(metric.column)
      ) {
        return true
      }

      return false
    })
  ) {
    tables.session = true
  }

  // Always include event_data table for custom metrics/parameters
  tables.eventData = true

  return tables
}
