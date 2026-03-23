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
  excludedEventTypes: string[],
  filterText: string,
) => {
  const processed = data
    .map((journey) => ({
      ...journey,
      path: journey.path
        .filter((step) => {
          const eventName = step.split(': ')[0]
          return !excludedEventTypes.includes(eventName)
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
        }),
    }))
    .filter((journey) => journey.path.length > 0)

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
