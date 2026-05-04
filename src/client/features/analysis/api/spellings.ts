import type {
  QualityAssuranceCheck,
  QualityAssuranceHistoryResponse,
  SpellingCrawlData,
  SiteimprovePageResponse,
  SiteimproveSpellingResponse,
  SpellingIssue,
} from '../model/types.ts'

const getCredentials = (): RequestCredentials => (window.location.hostname === 'localhost' ? 'omit' : 'include')

export const fetchPageId = async (baseUrl: string, siteId: string, path: string): Promise<number | null> => {
  const encodedUrl = encodeURIComponent(path)
  const url = `${baseUrl}/siteimprove/sites/${siteId}/content/pages?url=${encodedUrl}&page_size=1`

  const response = await fetch(url, { credentials: getCredentials() })
  if (!response.ok) return null

  const data = (await response.json()) as SiteimprovePageResponse
  if (data?.items && data.items.length > 0) {
    const match = data.items.find((p) => p.url.includes(path))
    return match ? match.id : data.items[0].id
  }
  return null
}

export interface SpellingOverviewResult {
  overviewData: QualityAssuranceCheck | null
  crawlInfo: SpellingCrawlData | null
}

export const fetchSpellingOverview = async (baseUrl: string, siteId: string): Promise<SpellingOverviewResult> => {
  const credentials = getCredentials()

  const [historyResponse, crawlResponse] = await Promise.all([
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/quality_assurance/overview/check_history?page_size=1`, {
      credentials,
    }),
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/content/crawl`, { credentials }),
  ])

  let overviewData: QualityAssuranceCheck | null = null
  let crawlInfo: SpellingCrawlData | null = null

  if (historyResponse.ok) {
    const data = (await historyResponse.json()) as QualityAssuranceHistoryResponse
    if (data.items?.length > 0) {
      overviewData = data.items[0]
    }
  }

  if (crawlResponse.ok) {
    crawlInfo = (await crawlResponse.json()) as SpellingCrawlData
  }

  return { overviewData, crawlInfo }
}

export interface PageSpellingsResult {
  overviewData: QualityAssuranceCheck | null
  crawlInfo: SpellingCrawlData | null
  misspellings: SpellingIssue[]
  potentialMisspellings: SpellingIssue[]
}

export const fetchPageSpellings = async (
  baseUrl: string,
  siteId: string,
  pageId: number,
): Promise<PageSpellingsResult> => {
  const credentials = getCredentials()

  const [overviewResponse, crawlResponse, misResponse, potResponse] = await Promise.all([
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/quality_assurance/overview/check_history?page_size=1`, {
      credentials,
    }),
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/content/crawl`, { credentials }),
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/quality_assurance/spelling/pages/${pageId}/misspellings`, {
      credentials,
    }),
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/quality_assurance/spelling/pages/${pageId}/potential_misspellings`, {
      credentials,
    }),
  ])

  let overviewData: QualityAssuranceCheck | null = null
  let crawlInfo: SpellingCrawlData | null = null
  let misspellings: SpellingIssue[] = []
  let potentialMisspellings: SpellingIssue[] = []

  if (overviewResponse.ok) {
    const data = (await overviewResponse.json()) as QualityAssuranceHistoryResponse
    if (data.items?.length > 0) {
      overviewData = data.items[0]
    }
  }
  if (crawlResponse.ok) {
    crawlInfo = (await crawlResponse.json()) as SpellingCrawlData
  }
  if (misResponse.ok) {
    const data = (await misResponse.json()) as SiteimproveSpellingResponse
    misspellings = data.items || []
  }
  if (potResponse.ok) {
    const data = (await potResponse.json()) as SiteimproveSpellingResponse
    potentialMisspellings = data.items || []
  }

  return { overviewData, crawlInfo, misspellings, potentialMisspellings }
}
