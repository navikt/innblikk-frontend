import type { TeamData } from '../model/types.ts'
import teamsData from '../../../../data/teamsData.json'

const normalizeWebsiteId = (websiteId: string): string => websiteId.trim().toLowerCase()

export const getSiteimproveId = (domain: string, websiteId?: string): string | number | undefined => {
  let team: TeamData | undefined

  if (websiteId) {
    const normalizedWebsiteId = normalizeWebsiteId(websiteId)
    team = (teamsData as TeamData[]).find(
      (t) => typeof t.websiteID === 'string' && normalizeWebsiteId(t.websiteID) === normalizedWebsiteId,
    )
  }

  if (team) {
    const matchedId = team.teamSiteimproveSite
    if (typeof matchedId === 'string' || typeof matchedId === 'number') {
      return matchedId
    }
  }

  let siteDomain = domain
  if (!siteDomain.startsWith('http')) {
    siteDomain = `https://${siteDomain}`
  }

  try {
    const urlObj = new URL(siteDomain)
    const domainOrigin = urlObj.origin
    team = (teamsData as TeamData[]).find((t) => {
      if (!t.teamDomain) return false
      try {
        const teamUrl = new URL(t.teamDomain)
        return domainOrigin === teamUrl.origin
      } catch {
        return domainOrigin.startsWith(String(t.teamDomain))
      }
    })
  } catch {
    team = (teamsData as TeamData[]).find(
      (t) => !!t.teamDomain && (t.teamDomain === domain || domain.includes(String(t.teamDomain))),
    )
  }

  const siteId = team?.teamSiteimproveSite
  if (typeof siteId === 'string' || typeof siteId === 'number') {
    return siteId
  }
  return undefined
}

export const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
  const csvRows = [headers.join(','), ...rows.map((row) => row.join(','))]
  const csvContent = csvRows.join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
