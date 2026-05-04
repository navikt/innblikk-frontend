import { useState } from 'react'
import type { Website } from '../types/website'
import { fetchWebsites as fetchWebsitesApi } from '../api/websiteApi'

export const useWebsiteMatching = () => {
  const [websites, setWebsites] = useState<Website[] | null>(null)

  const normalizeDomain = (domain: string) => {
    const cleaned = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\.$/, '')
      .replace(/^www\./, '')
    return cleaned === 'nav.no' ? 'www.nav.no' : cleaned
  }

  // Helper to filter and process raw website data consistently
  const processWebsitesData = (websitesData: Website[]): Website[] => {
    // Filter for prod websites (Team ResearchOps and maybe others if needed)
    // Same logic as UrlSearchForm
    const relevantTeams = ['aa113c34-e213-4ed6-a4f0-0aea8a503e6b', 'bceb3300-a2fb-4f73-8cec-7e3673072b30']

    const prodWebsites = websitesData.filter((website: Website) => relevantTeams.includes(website.teamId))

    // Filter out exactly "nav.no" if desired from the list (it's handled by normalization)
    const filteredItems = prodWebsites.filter((item: Website) => item.domain !== 'nav.no')

    // Deduplicate by domain
    const uniqueWebsites = filteredItems.filter(
      (website: Website, index: number, self: Website[]) =>
        index === self.findIndex((w) => w.domain === website.domain),
    )

    // Sort by domain
    uniqueWebsites.sort((a: Website, b: Website) => a.domain.localeCompare(b.domain))

    return uniqueWebsites
  }

  const fetchWebsites = async (): Promise<Website[]> => {
    if (websites) return websites

    // Try to load websites from localStorage cache first
    // Note: The cache stores RAW data, so we need to filter it
    try {
      const hostPrefix = window.location.hostname.replace(/\./g, '_')
      const cachedItemStr = localStorage.getItem(`umami_websites_cache_${hostPrefix}`)
      if (cachedItemStr) {
        const item = JSON.parse(cachedItemStr)
        const now = Date.now()
        // 24 hours expiry, same as WebsitePicker
        if (now - item.timestamp < 24 * 60 * 60 * 1000 && item.data && item.data.length > 0) {
          console.log('[useWebsiteMatching] Using cached websites list')
          // IMPORTANT: Apply the same filtering as fresh fetch
          const processedWebsites = processWebsitesData(item.data)
          setWebsites(processedWebsites)
          return processedWebsites
        }
      }
    } catch (e) {
      console.warn('[useWebsiteMatching] Error reading from localStorage', e)
    }

    try {
      const websitesData = await fetchWebsitesApi()

      const processedWebsites = processWebsitesData(websitesData)
      setWebsites(processedWebsites)
      return processedWebsites
    } catch (error) {
      console.error('Error fetching websites:', error)
      throw error
    }
  }

  const findMatchingWebsite = async (inputUrl: string): Promise<{ website: Website; path: string } | null> => {
    let urlToParse = inputUrl
    if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
      urlToParse = 'https://' + urlToParse
    }

    try {
      let urlObj = new URL(urlToParse)

      // Normalize nav.no to www.nav.no
      if (urlObj.hostname === 'nav.no') {
        urlToParse = urlToParse.replace('://nav.no', '://www.nav.no')
        urlObj = new URL(urlToParse)
      }

      const availableWebsites = await fetchWebsites()
      const inputDomain = urlObj.hostname.toLowerCase()
      const normalizedInputDomain = normalizeDomain(inputDomain)

      // First, try to find an EXACT domain match (prioritize this)
      let matchedWebsite = availableWebsites.find((item) => {
        const itemDomain = item.domain.toLowerCase()
        // Check exact match with raw domain
        if (itemDomain === inputDomain) return true
        // Check with www prefix variations
        if (itemDomain === `www.${inputDomain}`) return true
        if (`www.${itemDomain}` === inputDomain) return true
        return false
      })

      // If no exact match, try normalized comparison and suffix matching

      if (!matchedWebsite) {
        matchedWebsite = availableWebsites.reduce<Website | undefined>((best, item) => {
          const normalizedDomain = normalizeDomain(item.domain)

          // Exact normalized match
          if (normalizedDomain === normalizedInputDomain) {
            return item
          }

          // Suffix match (subdomain) - input is a subdomain of this website's domain
          if (normalizedInputDomain.endsWith(`.${normalizedDomain}`)) {
            if (!best) return item
            const bestLen = normalizeDomain(best.domain).length
            return normalizedDomain.length > bestLen ? item : best
          }

          return best
        }, undefined)
      }

      if (matchedWebsite) {
        console.log(
          '[useWebsiteMatching] Found match:',
          matchedWebsite.name,
          matchedWebsite.domain,
          'for input:',
          inputDomain,
        )
        return {
          website: matchedWebsite,
          path: decodeURIComponent(urlObj.pathname),
        }
      }

      return null
    } catch (e) {
      console.error('Invalid URL for matching:', e)
      return null
    }
  }

  return {
    findMatchingWebsite,
    normalizeDomain,
  }
}
