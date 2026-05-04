import type { ParsedJourneyStep } from '../model/types'

export const parseJourneyStep = (step: string): ParsedJourneyStep => {
  const separatorIndex = step.indexOf(': ')
  if (separatorIndex === -1) {
    return {
      eventName: step.trim(),
      details: [],
    }
  }

  const eventName = step.slice(0, separatorIndex).trim()
  const rawDetails = step.slice(separatorIndex + 2)
  const details = rawDetails
    .split('||')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const detailSeparatorIndex = part.indexOf(':')
      if (detailSeparatorIndex === -1) {
        return { key: part, value: '' }
      }

      return {
        key: part.slice(0, detailSeparatorIndex).trim(),
        value: part.slice(detailSeparatorIndex + 1).trim(),
      }
    })

  return { eventName, details }
}
