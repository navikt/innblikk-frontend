import type { PrivacyRow } from '../model/types.ts'

export interface PrivacyDateRange {
  startDate: Date
  endDate: Date
}

export const calculatePrivacyDateRange = (
  period: string,
  customStartDate?: Date,
  customEndDate?: Date,
): PrivacyDateRange | null => {
  const now = new Date()

  if (period === 'today') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
      endDate: now,
    }
  }

  if (period === 'current_month') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: now,
    }
  }

  if (period === 'last_month') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), 0),
    }
  }

  if (period === 'custom') {
    if (!customStartDate || !customEndDate) return null

    const startDate = new Date(customStartDate)
    startDate.setHours(0, 0, 0, 0)

    const today = new Date()
    const isToday =
      customEndDate.getDate() === today.getDate() &&
      customEndDate.getMonth() === today.getMonth() &&
      customEndDate.getFullYear() === today.getFullYear()

    const endDate = isToday ? now : new Date(customEndDate)
    if (!isToday) endDate.setHours(23, 59, 59, 999)

    return { startDate, endDate }
  }

  // Fallback: current month
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: now,
  }
}

const UUID_PATTERN = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/

export const filterFalsePositives = (data: PrivacyRow[]): PrivacyRow[] =>
  data.filter((row) => {
    if (row.match_type === 'Mulig navn') {
      const hasInvalidName = row.examples?.some(
        (ex: string) => /^(Nav|Viser)\s/i.test(ex) || /Modia\s+Personoversikt/i.test(ex),
      )
      return !hasInvalidName
    }
    if (row.match_type === 'Bankkort' || row.match_type === 'Telefonnummer') {
      const hasUuid = row.examples?.some((ex: string) => UUID_PATTERN.test(ex))
      return !hasUuid
    }
    if (row.match_type === 'Organisasjonsnummer') {
      const hasIdPattern = row.examples?.some((ex: string) => /(?:id|oppgaveid|enhetid|aktoerid)=/i.test(ex))
      return !hasIdPattern
    }
    return true
  })

export interface EmailStats {
  total: number
  uniqueTotal: number
  navCount: number
  uniqueNavCount: number
  otherCount: number
  uniqueOtherCount: number
}

export const getEmailStats = (visibleData: PrivacyRow[]): EmailStats => {
  const total = visibleData.reduce((sum, row) => sum + row.count, 0)
  const uniqueTotal = visibleData.reduce((sum, row) => sum + (row.unique_count || 0), 0)
  const navCount = visibleData.reduce((sum, row) => sum + (row.nav_count || 0), 0)
  const uniqueNavCount = visibleData.reduce((sum, row) => sum + (row.unique_nav_count || 0), 0)
  const uniqueOtherCount = visibleData.reduce((sum, row) => sum + (row.unique_other_count || 0), 0)
  return {
    total,
    uniqueTotal,
    navCount,
    uniqueNavCount,
    otherCount: total - navCount,
    uniqueOtherCount,
  }
}

export const getTableColumnGroups = (
  rows: Pick<PrivacyRow, 'table_name' | 'column_name'>[],
): Record<string, Set<string>> => {
  const groups: Record<string, Set<string>> = {}
  rows.forEach((row) => {
    if (!groups[row.table_name]) {
      groups[row.table_name] = new Set()
    }
    groups[row.table_name].add(row.column_name)
  })
  return groups
}
