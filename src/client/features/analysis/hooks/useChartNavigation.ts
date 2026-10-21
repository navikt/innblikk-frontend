import { useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  hasClickmapSupport,
  hasMarketingSupport,
  hasSiteimproveSupport,
} from '../../../shared/hooks/useSiteimproveSupport.ts'
import { preserveSharedAnalysisParams } from '../../../shared/lib/analysisNavigation.ts'
import { chartGroups } from '../model/chartGroups.tsx'

export const useChartNavigation = (
  websiteDomain?: string,
  websiteName?: string,
  websiteId?: string,
  hideAnalysisSelector = false,
) => {
  const isNavOpen = !hideAnalysisSelector
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // The global left Sidebar covers Trafikkanalyse/Hendelser/Brukere — the in-page
  // selector deliberately shows only items with no Sidebar entry (Kampanjer,
  // Innholdskvalitet) to avoid duplicate navigation.
  const activeChartGroups = chartGroups

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
      ? activeChartGroups
      : activeChartGroups.filter((group) => group.title !== 'Innholdskvalitet')

    return groupsWithoutSiteimprove
      .map((group) => ({
        ...group,
        ids: group.ids.filter(
          (id) => (id !== 'markedsanalyse' || showMarketingSection) && (id !== 'clickmap' || showClickmapSection),
        ),
      }))
      .filter((group) => group.ids.length > 0)
  }, [showSiteimproveSection, showMarketingSection, showClickmapSection, activeChartGroups])

  const getTargetUrl = useCallback((href: string) => {
    return preserveSharedAnalysisParams(href, window.location.search)
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
