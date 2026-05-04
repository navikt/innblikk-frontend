import React, { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

const LABEL_MIN_HEIGHT = '2.5rem' // Ensures all labels take up the same vertical space

const SiteScores = ({ pageUrl, siteimproveSelectedDomain, baseUrl, className }) => {
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [scoreOverview, setScoreOverview] = useState(null)
  const [pageDetails, setPageDetails] = useState(null)
  const [error, setError] = useState(null)
  const [reportLink, setReportLink] = useState(null)

  const roundToOneDecimal = (num) => {
    return Math.round(num * 10) / 10
  }

  // Helper for fetching from the proxy
  const fetchSiteimproveProxy = async (path) => {
    const url = `${baseUrl}/siteimprove${path}` // removed /api
    console.log('Siteimprove API URL:', url)
    const credentials = window.location.hostname === 'localhost' ? 'omit' : 'include'
    let res
    try {
      console.log('Fetching Siteimprove data from:', url, 'with credentials:', credentials)
      res = await fetch(url, { credentials })
    } catch (err) {
      console.error('Fetch error:', err)
      throw new Error('Nettverksfeil ved henting av Siteimprove-data')
    }
    if (!res.ok) throw new Error('API error')
    try {
      return await res.json()
    } catch (err) {
      throw new Error('Feil ved parsing av JSON-data fra Siteimprove')
    }
  }

  useEffect(() => {
    // Clear previous state when dependencies change
    setSelectedPageId(null)
    setScoreOverview(null)
    setPageDetails(null)
    setError(null)
    setReportLink(null)

    if (!siteimproveSelectedDomain || siteimproveSelectedDomain === false) {
      setError('Ingen Siteimprove-støtte for denne siden.')
      return
    }
    const fetchData = async () => {
      try {
        const selectedPageData = await fetchSiteimproveProxy(
          `/sites/${siteimproveSelectedDomain}/quality_assurance/inventory/pages?url=${pageUrl}`,
        )

        if (selectedPageData && selectedPageData.items && selectedPageData.items.length > 0) {
          const firstItemId = selectedPageData.items[0].id
          setSelectedPageId(firstItemId)

          // Fetch overview and details in parallel to avoid layout shift
          const [overviewData, details] = await Promise.all([
            fetchSiteimproveProxy(`/sites/${siteimproveSelectedDomain}/dci/overview?page_id=${firstItemId}`),
            fetchSiteimproveProxy(`/sites/${siteimproveSelectedDomain}/content/pages/${firstItemId}`),
          ])

          if (overviewData && overviewData.a11y && overviewData.qa && overviewData.seo) {
            setScoreOverview(overviewData)
          } else {
            setError('error')
            throw new Error('Fant ingen data for side, sjekk om du har skrevet in URL riktig')
          }

          setPageDetails(details)

          if (details._siteimprove?.quality_assurance?.page_report?.href) {
            setReportLink(details._siteimprove.quality_assurance.page_report.href)
          }
        } else {
          setError('error')
          throw new Error('Fant ingen side, sjekk om du har skrevet in URL riktig')
        }
      } catch (error) {
        console.error('Error fetching data: ', error)
        setError('Klarte ikke å hente data fra Siteimprove, sjekk om du har skrevet in URL riktig. ')
      }
    }

    fetchData()
  }, [pageUrl, siteimproveSelectedDomain, baseUrl])

  if (error) {
    return null
  }

  const getColor = (score) => {
    if (score > 75) return '#4caf50'
    if (score > 50) return '#ffeb3b'
    if (score > 25) return '#f44336'
    return '#ff9800'
  }

  // Helper for multi-ring border using box-shadow: black, color, black, white
  const getCircleBoxShadow = (score) => {
    const color = getColor(score)
    return `
            0 0 0 1.5px #111,    /* thin black outer */
            0 0 0 6px ${color},  /* thick color */
            0 0 0 7.5px #111,    /* thin black inner */
            0 0 0 11px var(--ax-bg-default)      /* background ring */
        `
  }

  // Get color for issue counts (inverted - 0 is best)
  const getIssueColor = (count) => {
    if (count === 0) return '#4caf50'
    if (count <= 10) return '#ffeb3b'
    if (count <= 50) return '#ff9800'
    return '#f44336'
  }

  return (
    <>
      {scoreOverview && (
        <div
          className={`p-2 w-full bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-subtle)] rounded-lg shadow-sm mb-2 ${className || ''}`}
        >
          <div className="w-full">
            <div className="mt-1 bg-[var(--ax-bg-default)] p-2 rounded-lg">
              <h2 className="text-lg font-semibold mb-1 text-[var(--ax-text-default)]">
                Poengsum (av 100) fra Siteimprove
              </h2>
              <hr className="mt-4 mb-6 border-t border-[var(--ax-border-neutral-subtle)]" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                {/* QA */}
                <div className="flex flex-row md:flex-col items-center md:items-center justify-start md:justify-center w-full p-2">
                  <div
                    className="flex items-center justify-center w-16 h-16 rounded-full text-xl font-bold bg-[var(--ax-bg-default)]"
                    style={{
                      boxShadow: getCircleBoxShadow(scoreOverview.qa.total),
                      color: 'var(--ax-text-default)',
                    }}
                    aria-label={`Kvalitetsikring: ${roundToOneDecimal(scoreOverview.qa.total)}`}
                  >
                    {roundToOneDecimal(scoreOverview.qa.total)}
                  </div>
                  <div
                    className="ml-4 md:ml-0 mt-0 md:mt-4 font-medium text-base leading-tight text-left md:text-center"
                    style={{ minHeight: LABEL_MIN_HEIGHT }}
                  >
                    {`Kvalitetsikring av innhold`}
                  </div>
                </div>
                {/* A11y */}
                <div className="flex flex-row md:flex-col items-center md:items-center justify-start md:justify-center w-full p-2">
                  <div
                    className="flex items-center justify-center w-16 h-16 rounded-full text-xl font-bold bg-[var(--ax-bg-default)]"
                    style={{
                      boxShadow: getCircleBoxShadow(scoreOverview.a11y.total),
                      color: 'var(--ax-text-default)',
                    }}
                    aria-label={`Universell utforming: ${roundToOneDecimal(scoreOverview.a11y.total)}`}
                  >
                    {roundToOneDecimal(scoreOverview.a11y.total)}
                  </div>
                  <div
                    className="ml-4 md:ml-0 mt-0 md:mt-4 font-medium text-base leading-tight text-left md:text-center"
                    style={{ minHeight: LABEL_MIN_HEIGHT }}
                  >
                    {`Universell utforming`}
                  </div>
                </div>
                {/* SEO */}
                <div className="flex flex-row md:flex-col items-center md:items-center justify-start md:justify-center w-full p-2">
                  <div
                    className="flex items-center justify-center w-16 h-16 rounded-full text-xl font-bold bg-[var(--ax-bg-default)]"
                    style={{
                      boxShadow: getCircleBoxShadow(scoreOverview.seo.total),
                      color: 'var(--ax-text-default)',
                    }}
                    aria-label={`SEO: ${roundToOneDecimal(scoreOverview.seo.total)}`}
                  >
                    {roundToOneDecimal(scoreOverview.seo.total)}
                  </div>
                  <div
                    className="ml-4 md:ml-0 mt-0 md:mt-4 font-medium text-base leading-tight text-left md:text-center"
                    style={{ minHeight: LABEL_MIN_HEIGHT }}
                  >
                    {`Søkemotor-optimalisering`}
                  </div>
                </div>
                {/* Total */}
                <div className="flex flex-row md:flex-col items-center md:items-center justify-start md:justify-center w-full p-2">
                  <div
                    className="flex items-center justify-center w-16 h-16 rounded-full text-xl font-bold bg-[var(--ax-bg-default)]"
                    style={{
                      boxShadow: getCircleBoxShadow(scoreOverview.total),
                      color: 'var(--ax-text-default)',
                    }}
                    aria-label={`Snitt: ${roundToOneDecimal(scoreOverview.total)}`}
                  >
                    {roundToOneDecimal(scoreOverview.total)}
                  </div>
                  <div
                    className="ml-4 md:ml-0 mt-0 md:mt-4 font-medium text-base leading-tight text-left md:text-center"
                    style={{ minHeight: LABEL_MIN_HEIGHT }}
                  >
                    {`Snitt`}
                  </div>
                </div>
              </div>
              <hr className="mt-0 mb-4 border-t border-[var(--ax-border-neutral-subtle)]" />

              {pageDetails && pageDetails.summary && pageDetails.summary.quality_assurance && (
                <>
                  <h2 className="text-lg font-semibold mb-3 mt-4 text-[var(--ax-text-default)]">
                    Funn fra Siteimprove
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {/* Broken Links */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-subtle)] rounded-lg p-4 shadow-sm h-full">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div
                          className="flex items-center justify-center w-10 h-10 rounded-full font-bold text-base shrink-0 transition-colors"
                          style={{
                            color:
                              getIssueColor(pageDetails.summary.quality_assurance.broken_links || 0) === '#ffeb3b' ||
                              getIssueColor(pageDetails.summary.quality_assurance.broken_links || 0) === '#ff9800'
                                ? '#1f2937'
                                : '#ffffff',
                            backgroundColor: getIssueColor(pageDetails.summary.quality_assurance.broken_links || 0),
                          }}
                        >
                          {pageDetails.summary.quality_assurance.broken_links || 0}
                        </div>
                        <div className="flex flex-col">
                          <h3 className="text-base font-semibold text-[var(--ax-text-default)]">Ødelagte lenker</h3>
                          {(pageDetails.summary.quality_assurance.broken_links === 0 ||
                            !pageDetails.summary.quality_assurance.broken_links) && (
                            <span className="text-sm text-green-700 font-medium">Ingen — God jobbet!</span>
                          )}
                        </div>
                      </div>

                      {reportLink && (pageDetails.summary.quality_assurance.broken_links || 0) > 0 && (
                        <a
                          href={reportLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 sm:mt-0 inline-flex items-center text-base font-medium text-blue-700 hover:underline"
                        >
                          Se rapport
                          <ExternalLink className="ml-1 w-5 h-5" aria-hidden="true" />
                        </a>
                      )}
                    </div>

                    {/* Potential Misspellings */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-subtle)] rounded-lg p-4 shadow-sm h-full">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div
                          className="flex items-center justify-center w-10 h-10 rounded-full font-bold text-base shrink-0 transition-colors"
                          style={{
                            color:
                              getIssueColor(pageDetails.summary.quality_assurance.potential_misspellings || 0) ===
                                '#ffeb3b' ||
                              getIssueColor(pageDetails.summary.quality_assurance.potential_misspellings || 0) ===
                                '#ff9800'
                                ? '#1f2937'
                                : '#ffffff',
                            backgroundColor: getIssueColor(
                              pageDetails.summary.quality_assurance.potential_misspellings || 0,
                            ),
                          }}
                        >
                          {pageDetails.summary.quality_assurance.potential_misspellings || 0}
                        </div>
                        <div className="flex flex-col">
                          <h3 className="text-base font-semibold text-[var(--ax-text-default)]">Mulige stavefeil</h3>
                          {(pageDetails.summary.quality_assurance.potential_misspellings === 0 ||
                            !pageDetails.summary.quality_assurance.potential_misspellings) && (
                            <span className="text-sm text-green-700 font-medium">Ingen funnet!</span>
                          )}
                        </div>
                      </div>

                      {reportLink && (pageDetails.summary.quality_assurance.potential_misspellings || 0) > 0 && (
                        <a
                          href={reportLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 sm:mt-0 inline-flex items-center text-base font-medium text-blue-700 hover:underline"
                        >
                          Se rapport
                          <ExternalLink className="ml-1 w-5 h-5" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                </>
              )}

              {reportLink && (
                <div className="bg-[var(--ax-bg-default)] pl-0 pt-2 ">
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                    <a href={reportLink} target="_blank" rel="noopener noreferrer">
                      <p className="text-base font-bold underline mb-1 text-blue-700">Rapport med forklaringer (🔐)</p>
                    </a>
                    <a
                      href="https://jira.adeo.no/plugins/servlet/desk/portal/581/create/2641"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <p className="text-base font-bold underline text-blue-700">Få Siteimprove tilgang</p>
                    </a>
                    <a href="https://my2.siteimprove.com/" target="_blank" rel="noopener noreferrer">
                      <p className="text-base font-bold underline text-blue-700">Logg inn</p>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SiteScores
