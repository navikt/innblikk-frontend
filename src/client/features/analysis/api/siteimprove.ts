import type {
  BrokenLink,
  PageWithBrokenLinks,
  PageBrokenLink,
  BrokenLinkPage,
  CrawlData,
  SiteimproveListResponse,
} from '../model/types.ts'
import {
  isBrokenLink,
  isPageWithBrokenLinks,
  isPageBrokenLink,
  isBrokenLinkPage,
  isCrawlData,
  parseListResponse,
} from '../utils/typeGuards.ts'

const getCredentials = (): RequestCredentials => (window.location.hostname === 'localhost' ? 'omit' : 'include')

export const fetchPageBrokenLinks = async (
  siteimproveBaseUrl: string,
  siteimproveId: string,
  pageId: number,
): Promise<PageBrokenLink[]> => {
  const url = `${siteimproveBaseUrl}/siteimprove/sites/${siteimproveId}/quality_assurance/links/pages_with_broken_links/${pageId}/broken_links?page_size=50`
  const response = await fetch(url, { credentials: getCredentials() })

  if (!response.ok) {
    throw new Error('Kunne ikke hente ødelagte lenker for denne siden.')
  }

  const json: unknown = await response.json()
  const data: SiteimproveListResponse<PageBrokenLink> = parseListResponse(json, isPageBrokenLink)
  return data.items ?? []
}

export const fetchBrokenLinkPages = async (
  siteimproveBaseUrl: string,
  siteimproveId: string,
  linkId: number,
): Promise<BrokenLinkPage[]> => {
  const url = `${siteimproveBaseUrl}/siteimprove/sites/${siteimproveId}/quality_assurance/links/broken_links/${linkId}/pages?page_size=50`
  const response = await fetch(url, { credentials: getCredentials() })

  if (!response.ok) {
    throw new Error('Kunne ikke hente sider for denne lenken.')
  }

  const json: unknown = await response.json()
  const data: SiteimproveListResponse<BrokenLinkPage> = parseListResponse(json, isBrokenLinkPage)
  return data.items ?? []
}

export interface SiteimproveData {
  brokenLinks: BrokenLink[]
  pagesWithBrokenLinks: PageWithBrokenLinks[]
  crawlInfo: CrawlData | null
}

export const fetchSiteimproveData = async (
  siteimproveBaseUrl: string,
  siteimproveId: string,
): Promise<SiteimproveData> => {
  const credentials = getCredentials()

  // Fetch Broken Links
  const brokenLinksUrl = `${siteimproveBaseUrl}/siteimprove/sites/${siteimproveId}/quality_assurance/links/broken_links?page_size=50`
  const brokenLinksResponse = await fetch(brokenLinksUrl, { credentials })

  if (!brokenLinksResponse.ok) {
    if (brokenLinksResponse.status === 403) {
      throw new Error('Du mangler tilgang til Siteimprove. Sjekk at du er logget inn/har tilgang via reops-proxy.')
    }
    throw new Error('Kunne ikke hente data fra Siteimprove.')
  }

  const brokenLinksJson: unknown = await brokenLinksResponse.json()
  const brokenLinksData: SiteimproveListResponse<BrokenLink> = parseListResponse(brokenLinksJson, isBrokenLink)
  const brokenLinks = brokenLinksData.items ? brokenLinksData.items.sort((a, b) => b.pages - a.pages) : []

  // Fetch Pages with Broken Links
  let pagesWithBrokenLinks: PageWithBrokenLinks[] = []
  const pagesUrl = `${siteimproveBaseUrl}/siteimprove/sites/${siteimproveId}/quality_assurance/links/pages_with_broken_links?page_size=50`
  const pagesResponse = await fetch(pagesUrl, { credentials })

  if (pagesResponse.ok) {
    const pagesJson: unknown = await pagesResponse.json()
    const pagesData: SiteimproveListResponse<PageWithBrokenLinks> = parseListResponse(pagesJson, isPageWithBrokenLinks)
    if (pagesData.items) {
      pagesWithBrokenLinks = pagesData.items.sort((a, b) => b.broken_links - a.broken_links)
    }
  }

  // Fetch Content Crawl Info for Last Scan
  let crawlInfo: CrawlData | null = null
  const crawlUrl = `${siteimproveBaseUrl}/siteimprove/sites/${siteimproveId}/content/crawl`
  const crawlResponse = await fetch(crawlUrl, { credentials })

  if (crawlResponse.ok) {
    const crawlData: unknown = await crawlResponse.json()
    if (isCrawlData(crawlData)) {
      crawlInfo = crawlData
    }
  }

  return { brokenLinks, pagesWithBrokenLinks, crawlInfo }
}
