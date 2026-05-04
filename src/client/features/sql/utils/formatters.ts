// Get GCP_PROJECT_ID from runtime-injected global variable (server injects window.__GCP_PROJECT_ID__)
export const getGcpProjectId = (): string => {
  if (typeof window !== 'undefined' && window.__GCP_PROJECT_ID__) {
    return window.__GCP_PROJECT_ID__
  }
  // Fallback for development/SSR contexts
  throw new Error('Missing runtime config: GCP_PROJECT_ID')
}

export const getDefaultQuery = () => `SELECT 
  website_id,
  name
FROM 
  \`${getGcpProjectId()}.umami.public_website\`
LIMIT 
  100;`

// Helper function to truncate JSON to prevent browser crashes
export const truncateJSON = (obj: unknown, maxChars: number = 50000): string => {
  const fullJSON = JSON.stringify(obj, null, 2)

  if (fullJSON.length <= maxChars) {
    return fullJSON
  }

  // Truncate and add notice
  const truncated = fullJSON.substring(0, maxChars - 500)
  const omittedChars = fullJSON.length - truncated.length
  const omittedKB = (omittedChars / 1024).toFixed(1)

  return (
    truncated +
    `\n\n... (${omittedKB} KB omitted - total size: ${(fullJSON.length / 1024).toFixed(1)} KB)\n\nJSON-utdata er begrenset til ${(maxChars / 1000).toFixed(0)}k tegn for å unngå at nettleseren krasjer.\nBruk tabellvisningen for å se alle resultater.`
  )
}
