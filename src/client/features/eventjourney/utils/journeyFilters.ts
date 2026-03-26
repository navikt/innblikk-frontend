export const getUniqueEventTypes = (data: { path: string[]; count: number }[]): string[] => {
  const eventTypes = new Set<string>()
  data.forEach((journey) => {
    journey.path.forEach((step) => {
      const eventName = step.split(': ')[0]
      if (eventName) eventTypes.add(eventName)
    })
  })
  return Array.from(eventTypes).sort()
}

export const filterJourneys = (
  data: { path: string[]; count: number }[],
  includedEventTypes: string[],
  excludedEventTypes: string[],
  filterText: string,
) => {
  const processed = data
    .map((journey) => {
      const filteredPath = journey.path
        .filter((step) => {
          const eventName = step.split(': ')[0]

          if (includedEventTypes.length > 0 && !includedEventTypes.includes(eventName)) {
            return false
          }

          if (excludedEventTypes.includes(eventName)) {
            return false
          }

          return true
        })
        .map((step) => {
          const parts = step.split(': ')
          const eventName = parts[0]

          if (parts.length < 2) return step

          const rawDetails = step.substring(eventName.length + 2)
          const details = rawDetails.split('||')

          const filteredDetails = details.filter((d) => {
            const splitIndex = d.indexOf(':')
            if (splitIndex === -1) return true

            const key = d.substring(0, splitIndex).trim()
            return key !== 'scrollPercent'
          })

          if (filteredDetails.length === 0) return eventName

          return `${eventName}: ${filteredDetails.join('||')}`
        })

      if (includedEventTypes.length > 0) {
        const includedInJourney = new Set(filteredPath.map((step) => step.split(': ')[0]))
        const hasAllIncludedTypes = includedEventTypes.every((eventType) => includedInJourney.has(eventType))

        if (!hasAllIncludedTypes) {
          return null
        }
      }

      if (filteredPath.length === 0) {
        return null
      }

      return {
        ...journey,
        path: filteredPath,
      }
    })
    .filter((journey): journey is { path: string[]; count: number } => journey !== null)

  const aggregatedMap = new Map<string, { path: string[]; count: number }>()
  processed.forEach((journey) => {
    const pathKey = JSON.stringify(journey.path)
    const existing = aggregatedMap.get(pathKey)
    if (existing) {
      existing.count += journey.count
    } else {
      aggregatedMap.set(pathKey, { path: journey.path, count: journey.count })
    }
  })

  return Array.from(aggregatedMap.values())
    .filter((journey) => {
      if (filterText) {
        const lowerFilter = filterText.toLowerCase()
        if (!journey.path.some((step) => step.toLowerCase().includes(lowerFilter))) {
          return false
        }
      }
      return true
    })
    .sort((a, b) => b.count - a.count)
}
