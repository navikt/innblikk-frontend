export const getUniqueColumnAliases = (labels: string[]): string[] => {
  const counts = new Map<string, number>()

  return labels.map((label, index) => {
    const base = label.trim() || `Kolonne ${index + 1}`
    const key = base.toLocaleLowerCase('nb')
    const occurrence = counts.get(key) ?? 0
    counts.set(key, occurrence + 1)
    return occurrence === 0 ? base : `${base} (${occurrence + 1})`
  })
}

export const quoteBigQueryIdentifier = (value: string): string =>
  `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``
