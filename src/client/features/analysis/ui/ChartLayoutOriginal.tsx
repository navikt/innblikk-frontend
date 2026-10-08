import React from 'react'
import { Select, VStack, type VStackProps } from '@navikt/ds-react'
import { type AnalyticsPage, analyticsPages } from '../model/analyticsNavigation.ts'
import { chartGroupsOriginal } from '../model/chartGroups.tsx'
import { KontaktSeksjon } from '../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx'
import { Skyra } from '../../../shared/ui/theme/Skyra/Skyra.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { useChartLayoutOriginal } from '../hooks/useChartLayoutOriginal.ts'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { ChevronLeftIcon, ChevronRightIcon } from '@navikt/aksel-icons'
import { getFeatureFlag } from '../../../shared/lib/featureFlags.ts'

interface ChartLayoutProps {
  title: string
  description: string
  filters?: React.ReactNode
  onFiltersSubmit?: () => void
  children: React.ReactNode
  currentPage?: AnalyticsPage
  wideSidebar?: boolean
  hideSidebar?: boolean
  hideAnalysisSelector?: boolean
  sidebarFilterGap?: VStackProps['gap']
  showPageHeader?: boolean
  showKontaktSection?: boolean
  beta?: boolean
  headerNotice?: React.ReactNode
}

const ChartLayoutOriginal: React.FC<ChartLayoutProps> = ({
  title,
  description,
  filters,
  onFiltersSubmit,
  children,
  currentPage,
  wideSidebar = false,
  hideSidebar = false,
  hideAnalysisSelector,
  sidebarFilterGap = 'space-32',
  showPageHeader = true,
  showKontaktSection = true,
  beta = false,
  headerNotice,
}) => {
  const { isSidebarOpen, setIsSidebarOpen, handleChartChange } = useChartLayoutOriginal(hideSidebar)
  // Same alpha-gating as ChartLayout: the analysis-type Select is the only place that
  // navigation exists when the global left Sidebar is off, so default to showing it there.
  // Subscribed so toggling on /profil swaps without a remount.
  const [alphaNewNav, setAlphaNewNav] = React.useState(() => getFeatureFlag('alpha_new_nav'))
  React.useEffect(() => {
    const handleChange = () => setAlphaNewNav(getFeatureFlag('alpha_new_nav'))
    window.addEventListener('featureFlagsChange', handleChange)
    return () => window.removeEventListener('featureFlagsChange', handleChange)
  }, [])
  const effectiveHideAnalysisSelector = hideAnalysisSelector ?? alphaNewNav
  const isFocusedEmbedLayout = !showPageHeader && !showKontaktSection

  // Define width classes based on wideSidebar prop
  const sidebarWidth = wideSidebar ? 'md:w-1/2' : 'md:w-1/3'
  const contentWidth = wideSidebar ? 'md:w-1/2' : 'md:w-2/3'
  const buttonPosition = wideSidebar ? 'left-1/2' : 'left-1/3'

  return (
    <>
      {showPageHeader && <PageHeader title={title} description={description} beta={beta} notice={headerNotice} />}

      <AppBlock className={isFocusedEmbedLayout ? 'pb-0' : 'pb-16'} gutters={!isFocusedEmbedLayout}>
        <div
          className={
            hideSidebar
              ? isFocusedEmbedLayout
                ? ''
                : 'mb-8'
              : isFocusedEmbedLayout
                ? 'bg-[var(--ax-bg-default)]'
                : 'rounded-lg shadow-sm border border-[var(--ax-border-neutral-subtle)] mb-8 bg-[var(--ax-bg-default)]'
          }
        >
          <div className={hideSidebar ? '' : 'flex flex-col md:flex-row min-h-[600px] relative'}>
            {isSidebarOpen && (
              <>
                <div
                  className={`w-full ${sidebarWidth} p-6 border-b border-[var(--ax-border-neutral-subtle)] md:border-b-0 md:border-r md:border-[var(--ax-border-neutral-subtle)]`}
                  onKeyDown={
                    onFiltersSubmit
                      ? (e) => {
                          if (e.key !== 'Enter') return
                          const target = e.target as HTMLElement
                          if (target.tagName === 'TEXTAREA') return
                          e.preventDefault()
                          onFiltersSubmit()
                        }
                      : undefined
                  }
                >
                  <VStack gap={sidebarFilterGap}>
                    {!effectiveHideAnalysisSelector && (
                      <div className="pb-2">
                        <Select
                          size="small"
                          label="Type analyse"
                          value={currentPage || ''}
                          onChange={handleChartChange}
                        >
                          <option value="" disabled>
                            Velg...
                          </option>
                          {chartGroupsOriginal.map((group) => (
                            <optgroup label={group.title} key={group.title}>
                              {group.ids.map((id) => {
                                const page = analyticsPages.find((p) => p.id === id)
                                if (!page) return null
                                return (
                                  <option key={page.id} value={page.id}>
                                    {page.label}
                                  </option>
                                )
                              })}
                            </optgroup>
                          ))}
                          <optgroup label="Tilpasset & datasjekk">
                            {analyticsPages
                              .filter((page) => !chartGroupsOriginal.some((g) => g.ids.includes(page.id)))
                              .map((page) => (
                                <option key={page.id} value={page.id}>
                                  {page.label}
                                </option>
                              ))}
                          </optgroup>
                        </Select>
                      </div>
                    )}
                    {filters}
                  </VStack>
                </div>
                {/* Collapse button on divider - hidden on mobile */}
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className={`hidden md:flex absolute top-3 ${buttonPosition} -translate-x-1/2 items-center justify-center w-6 h-12 bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-strong)] rounded-md shadow-sm hover:bg-[var(--ax-bg-neutral-soft)] hover:border-[var(--ax-border-accent)] transition-colors z-10`}
                  title="Minimer filter"
                  aria-label="Minimer filter"
                >
                  <ChevronLeftIcon fontSize="1rem" className="text-[var(--ax-text-accent)]" aria-hidden />
                </button>
              </>
            )}
            {!isSidebarOpen && !hideSidebar && (
              /* Expand button on left edge - hidden on mobile */
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="hidden md:flex absolute top-3 left-0 -translate-x-1/2 items-center justify-center w-6 h-12 bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-strong)] rounded-md shadow-sm hover:bg-[var(--ax-bg-neutral-soft)] transition-colors z-10"
                title="Vis filter"
                aria-label="Vis filter"
              >
                <ChevronRightIcon fontSize="1rem" className="text-[var(--ax-text-accent)]" aria-hidden />
              </button>
            )}
            <div className={`w-full ${isSidebarOpen ? contentWidth : ''} ${hideSidebar ? '' : 'p-6'}`}>{children}</div>
          </div>
        </div>
      </AppBlock>
      {showKontaktSection && (
        <>
          <Skyra />
          <KontaktSeksjon />
        </>
      )}
    </>
  )
}

export default ChartLayoutOriginal
