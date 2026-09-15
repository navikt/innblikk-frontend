import { useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  hasClickmapSupport,
  hasMarketingSupport,
  hasSiteimproveSupport,
} from '../../../shared/hooks/useSiteimproveSupport.ts'
import { chartGroups } from '../model/chartGroups.tsx'
import { SHARED_PARAMS } from '../model/types.ts'

export const useChartNavigation = (
  websiteDomain?: string,
  websiteName?: string,
  websiteId?: string,
  hideAnalysisSelector = false,
) => {
  const isNavOpen = !hideAnalysisSelector
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const domain = websiteDomain || searchParams.get('domain')
  const resolvedWebsiteId = websiteId || searchParams.get('websiteId')
  const showSiteimproveSection = useMemo(
    () => hasSiteimproveSupport(domain, resolvedWebsiteId),
    [domain, resolvedWebsiteId],
  )
  const showMarketingSection = useMemo(
    () => hasMarketingSupport(domain, websiteName, resolvedWebsiteId),
    [domain, websiteName, resolvedWebsiteId],
  )
  const showClickmapSection = useMemo(() => hasClickmapSupport(domain, resolvedWebsiteId), [domain, resolvedWebsiteId])

  const filteredChartGroups = useMemo(() => {
    const groupsWithoutSiteimprove = showSiteimproveSection
      ? chartGroups
      : chartGroups.filter((group) => group.title !== 'Innholdskvalitet')

    return groupsWithoutSiteimprove
      .map((group) => ({
        ...group,
        ids: group.ids.filter(
          (id) => (id !== 'markedsanalyse' || showMarketingSection) && (id !== 'clickmap' || showClickmapSection),
        ),
      }))
      .filter((group) => group.ids.length > 0)
  }, [showSiteimproveSection, showMarketingSection, showClickmapSection])

  const getTargetUrl = useCallback((href: string) => {
    const currentParams = new URLSearchParams(window.location.search)
    const preservedParams = new URLSearchParams()

    SHARED_PARAMS.forEach((param) => {
      const value = currentParams.get(param)
      if (value) {
        preservedParams.set(param, value)
      }
    })

    const queryString = preservedParams.toString()
    return queryString ? `${href}?${queryString}` : href
  }, [])

  const handleNavigation = useCallback(
    (e: React.MouseEvent, href: string) => {
      e.preventDefault()
      const targetUrl = getTargetUrl(href)
      void navigate(targetUrl)
    },
    [getTargetUrl, navigate],
  )

  // Trigger resize for charts when sidebar widths change
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 100)
    return () => clearTimeout(timer)
  }, [isNavOpen])

  return {
    filteredChartGroups,
    handleNavigation,
  }
}
