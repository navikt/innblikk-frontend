import React, { useState, useEffect } from 'react'
import { Modal, Button } from '@navikt/ds-react'
import { useSiteimproveSupport, useMarketingSupport } from '../../../shared/hooks/useSiteimproveSupport.ts'
import type { AnalysisActionModalProps, AnalysisActionModalWebsite } from '../model/types.ts'
import { isWebsitesResponse } from '../utils/typeGuards.ts'
import {
  ArrowsSquarepathIcon,
  BarChartIcon,
  CheckmarkIcon,
  ExternalLinkIcon,
  FilesIcon,
  GlobeIcon,
  LanguageIcon,
  LightningIcon,
  LinkBrokenIcon,
  MagnifyingGlassIcon,
  PersonCircleIcon,
  PersonGroupIcon,
  TrendUpIcon,
} from '@navikt/aksel-icons'

const AnalysisActionModal: React.FC<AnalysisActionModalProps> = ({
  open,
  onClose,
  urlPath,
  websiteId,
  period = 'current_month',
  domain: propDomain,
  websiteName: propWebsiteName,
}) => {
  const [copySuccess, setCopySuccess] = useState(false)
  const [resolvedDomain, setResolvedDomain] = useState<string | null>(null)
  const [resolvedWebsiteName, setResolvedWebsiteName] = useState<string | undefined>(undefined)
  const domain = propDomain ?? resolvedDomain ?? 'nav.no'
  const websiteName = propWebsiteName ?? resolvedWebsiteName
  const hasSiteimprove = useSiteimproveSupport(domain, websiteId)
  const hasMarketing = useMarketingSupport(domain, websiteName, websiteId)

  useEffect(() => {
    const shouldResolveDomain = !propDomain
    const shouldResolveWebsiteName = !propWebsiteName
    if (!websiteId || (!shouldResolveDomain && !shouldResolveWebsiteName)) return

    let isActive = true

    const applyWebsite = (website: AnalysisActionModalWebsite | undefined) => {
      if (!isActive || !website) return
      if (shouldResolveDomain && website.domain) {
        setResolvedDomain(website.domain)
      }
      if (shouldResolveWebsiteName && website.name) {
        setResolvedWebsiteName(website.name)
      }
    }

    const findDomain = async () => {
      // 1. Try to find in localStorage cache (shared with WebsitePicker)
      try {
        const cached = localStorage.getItem('umami_websites_cache')
        if (cached) {
          const parsed: unknown = JSON.parse(cached)
          if (isWebsitesResponse(parsed)) {
            const website = parsed.data.find((w) => w.id === websiteId)
            applyWebsite(website)
            if (website) return
          }
        }
      } catch (e) {
        console.error('Failed to read from cache', e)
      }

      // 2. Fetch if not found
      try {
        const response = await fetch('/api/bigquery/websites')
        if (!response.ok) return
        const result: unknown = await response.json()
        if (isWebsitesResponse(result)) {
          const website = result.data.find((w) => w.id === websiteId)
          applyWebsite(website)
        }
      } catch (e) {
        console.error('Failed to fetch websites', e)
      }
    }

    void findDomain()

    return () => {
      isActive = false
    }
  }, [websiteId, propDomain, propWebsiteName])

  if (!urlPath || !websiteId) return null

  const openAnalysis = (path: string, paramName: string = 'urlPath') => {
    const encodedPath = encodeURIComponent(urlPath)
    const url = `${path}?websiteId=${websiteId}&period=${period}&${paramName}=${encodedPath}`
    window.open(url, '_blank')
    onClose()
  }

  const openOnWebsite = () => {
    const protocol = domain.includes('http') ? '' : 'https://'
    const url = `${protocol}${domain}${urlPath}`
    window.open(url, '_blank')
    onClose()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(urlPath)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const actionButtonClass = '!w-full !justify-start'

  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Hva vil du gjøre med lenken?' }} width="medium">
      <Modal.Body>
        <div className="p-2 pb-4 flex flex-col gap-6 text-left">
          <div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center mb-2 gap-2">
              <div className="text-sm font-medium text-[var(--ax-text-subtle)]">URL-sti</div>
              <div className="flex gap-1 self-end sm:self-auto">
                <Button
                  size="small"
                  variant="tertiary"
                  onClick={copyLink}
                  icon={
                    copySuccess ? (
                      <CheckmarkIcon aria-hidden fontSize="1.125rem" />
                    ) : (
                      <FilesIcon aria-hidden fontSize="1.125rem" />
                    )
                  }
                >
                  {copySuccess ? 'Kopiert!' : 'Kopier'}
                </Button>
                <Button
                  size="small"
                  variant="tertiary"
                  onClick={openOnWebsite}
                  icon={<ExternalLinkIcon aria-hidden fontSize="1.125rem" />}
                >
                  Åpne siden
                </Button>
              </div>
            </div>
            <div className="text-sm font-mono bg-[var(--ax-bg-neutral-soft)] p-3 rounded-md border border-[var(--ax-border-neutral-subtle)] break-all text-[var(--ax-text-default)]">
              {urlPath}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-[var(--ax-text-subtle)] uppercase tracking-wider mb-1">
                Trafikk
              </div>
              <Button
                variant="secondary"
                onClick={() => openAnalysis('/trafikkanalyse', 'urlPath')}
                icon={<BarChartIcon aria-hidden fontSize="1.25rem" />}
                className={actionButtonClass}
              >
                Trafikkoversikt
              </Button>
              <Button
                variant="secondary"
                onClick={() => openAnalysis('/brukerreiser', 'startUrl')}
                icon={<GlobeIcon aria-hidden fontSize="1.25rem" />}
                className={actionButtonClass}
              >
                Navigasjonsflyt
              </Button>
              <Button
                variant="secondary"
                onClick={() => openAnalysis('/trakt', 'urlPath')}
                icon={<BarChartIcon aria-hidden fontSize="1.25rem" />}
                className={actionButtonClass}
              >
                Trakt
              </Button>
              {hasMarketing && (
                <Button
                  variant="secondary"
                  onClick={() => openAnalysis('/markedsanalyse', 'urlPath')}
                  icon={<TrendUpIcon aria-hidden fontSize="1.25rem" />}
                  className={actionButtonClass}
                >
                  Kampanjer
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-[var(--ax-text-subtle)] uppercase tracking-wider mb-1">
                Hendelser
              </div>
              <Button
                variant="secondary"
                onClick={() => openAnalysis('/utforsk-hendelser', 'pagePath')}
                icon={<MagnifyingGlassIcon aria-hidden fontSize="1.25rem" />}
                className={actionButtonClass}
              >
                Egendefinerte hendelser
              </Button>
              <Button
                variant="secondary"
                onClick={() => openAnalysis('/hendelsesreiser', 'urlPath')}
                icon={<LightningIcon aria-hidden fontSize="1.25rem" />}
                className={actionButtonClass}
              >
                Hendelsesforløp
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-[var(--ax-text-subtle)] uppercase tracking-wider mb-1">
                Brukere
              </div>
              <Button
                variant="secondary"
                onClick={() => openAnalysis('/brukersammensetning', 'pagePath')}
                icon={<PersonGroupIcon aria-hidden fontSize="1.25rem" />}
                className={actionButtonClass}
              >
                Brukerdetaljer
              </Button>
              <Button
                variant="secondary"
                onClick={() => openAnalysis('/brukerprofiler', 'pagePath')}
                icon={<PersonCircleIcon aria-hidden fontSize="1.25rem" />}
                className={actionButtonClass}
              >
                Enkeltbrukere
              </Button>
              <Button
                variant="secondary"
                onClick={() => openAnalysis('/brukerlojalitet', 'urlPath')}
                icon={<ArrowsSquarepathIcon aria-hidden fontSize="1.25rem" />}
                className={actionButtonClass}
              >
                Gjenbesøk
              </Button>
            </div>

            {hasSiteimprove && (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-[var(--ax-text-subtle)] uppercase tracking-wider mb-1">
                  Innholdskvalitet
                </div>
                <Button
                  variant="secondary"
                  onClick={() => openAnalysis('/kvalitet/odelagte-lenker', 'urlPath')}
                  icon={<LinkBrokenIcon aria-hidden fontSize="1.25rem" />}
                  className={actionButtonClass}
                >
                  Ødelagte lenker
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => openAnalysis('/kvalitet/stavekontroll', 'urlPath')}
                  icon={<LanguageIcon aria-hidden fontSize="1.25rem" />}
                  className={actionButtonClass}
                >
                  Stavekontroll
                </Button>
              </div>
            )}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  )
}

export default AnalysisActionModal
