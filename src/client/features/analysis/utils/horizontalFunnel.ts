// Re-export to ensure type resolution for lint
type FunnelStep = {
  step: number
  count: number
  url?: string
  dropoff?: number
  conversionRate?: number
  params?: { key: string; value: string; operator: 'equals' | 'contains' }[]
}

export interface FunnelStepMetrics {
  percentageOfPrev: number
  dropoffCount: number
  dropoffPercentage: number
  totalConversionPercent: number
}

export const computeFunnelStepMetrics = (data: FunnelStep[], index: number): FunnelStepMetrics => {
  const item: FunnelStep = data[index]
  const prevItem: FunnelStep | null = index > 0 ? data[index - 1] : null
  const firstStepCount: number = data[0]?.count || 1

  const percentageOfPrev = prevItem && prevItem.count > 0 ? Math.round((item.count / prevItem.count) * 100) : 100

  const dropoffCount = prevItem ? prevItem.count - item.count : 0
  const dropoffPercentage = prevItem ? 100 - percentageOfPrev : 0
  const totalConversionPercent = Math.round((item.count / firstStepCount) * 100)

  return { percentageOfPrev, dropoffCount, dropoffPercentage, totalConversionPercent }
}

export const getStepLabel = (
  params?: { key: string; value: string; operator: 'equals' | 'contains' }[],
): string | undefined => {
  return params?.find((p) => ['lenketekst', 'tekst', 'label', 'tittel'].includes(p.key.toLowerCase()))?.value
}

export const getStepDestination = (
  params?: { key: string; value: string; operator: 'equals' | 'contains' }[],
): string | undefined => {
  return params?.find((p) => p.key === 'destinasjon' || p.key === 'url')?.value
}
