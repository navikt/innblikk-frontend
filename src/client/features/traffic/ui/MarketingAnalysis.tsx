import { Button, Alert, Loader, Tabs, Select } from '@navikt/ds-react'
import { Share2, Check } from 'lucide-react'
import ChartLayout from '../../analysis/ui/ChartLayout.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx'
import CookieMixNotice from '../../analysis/ui/CookieMixNotice.tsx'
import { useMarketingAnalysis } from '../hooks/useMarketingAnalysis'
import { getMarketingMetricLabel } from '../utils/trafficUtils'
import { getMarketingSqlTemplate } from '../utils/trafficDashboardSqlTemplates.ts'
import AnalysisTable from './AnalysisTable'

const MarketingAnalysis = () => {
  const {
    selectedWebsite,
    setSelectedWebsite,
    hasMarketing,
    urlPaths,
    setUrlPaths,
    pathOperator,
    setPathOperator,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    metricType,
    setMetricType,
    submittedMetricType,
    marketingData,
    queryStats,
    loading,
    error,
    hasAttemptedFetch,
    fetchData,
    copyShareLink,
    copySuccess,
    hasUnappliedFilterChanges,
    activeTab,
    setActiveTab,
    currentDateRange,
    cookieBadge,
    cookieStartDate,
    isPreCookieRange,
    getVisitorLabelWithBadge,
  } = useMarketingAnalysis()

  if (selectedWebsite && !hasMarketing) {
    return (
      <ChartLayout
        title="Kampanjer"
        description="Se trafikk fra kampanjer og lenker med sporing (UTM)."
        currentPage="markedsanalyse"
        websiteId={selectedWebsite?.id}
        websiteDomain={selectedWebsite?.domain}
        websiteName={selectedWebsite?.name}
        sidebarContent={<WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />}
      >
        <Alert variant="warning">
          Markedsanalyse er ikke aktivert for dette nettstedet. Kontakt Team ResearchOps for å aktivere det.
        </Alert>
      </ChartLayout>
    )
  }

  return (
    <ChartLayout
      title="Kampanjer"
      description="Se trafikk fra kampanjer og lenker med sporing (UTM)."
      currentPage="markedsanalyse"
      websiteId={selectedWebsite?.id}
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={<WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />}
      onFiltersSubmit={() => {
        if (!selectedWebsite || loading || !hasUnappliedFilterChanges) return
        void fetchData()
      }}
      filters={
        <>
          <UrlPathFilter
            urlPaths={urlPaths}
            onUrlPathsChange={setUrlPaths}
            pathOperator={pathOperator}
            onPathOperatorChange={setPathOperator}
            selectedWebsiteDomain={selectedWebsite?.domain}
            className="w-full sm:w-[350px]"
          />

          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            startDate={customStartDate}
            onStartDateChange={setCustomStartDate}
            endDate={customEndDate}
            onEndDateChange={setCustomEndDate}
          />

          <div className="w-full sm:w-auto min-w-[200px]">
            <Select
              label="Visning"
              size="small"
              value={metricType}
              key={`metric-${metricType}-${cookieBadge || 'nocookie'}`}
              onChange={(e) => setMetricType(e.target.value)}
            >
              <option value="visitors">{currentDateRange ? getVisitorLabelWithBadge() : 'Unike besøkende'}</option>
              <option value="visits">Økter / besøk</option>
              <option value="pageviews">Sidevisninger</option>
              <option value="proportion">Andel (av besøkende)</option>
            </Select>
          </div>

          <div className="w-full sm:w-auto self-end pb-[2px]">
            <Button
              onClick={fetchData}
              disabled={!selectedWebsite || loading || !hasUnappliedFilterChanges}
              loading={loading}
              size="small"
            >
              Vis analyse
            </Button>
          </div>
        </>
      }
    >
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {(cookieBadge === 'mix' || isPreCookieRange) && (
        <CookieMixNotice
          websiteName={selectedWebsite?.name}
          cookieStartDate={cookieStartDate}
          variant={isPreCookieRange ? 'pre' : 'mix'}
        />
      )}

      {loading && (
        <div className="flex justify-center items-center h-full">
          <Loader size="xlarge" title="Henter data..." />
        </div>
      )}

      {!loading && hasAttemptedFetch && !error && (
        <>
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="referrer" label="Henvisningsdomene" />
              <Tabs.Tab value="source" label="Kilde" />
              <Tabs.Tab value="medium" label="Medium" />
              <Tabs.Tab value="campaign" label="Kampanje" />
              <Tabs.Tab value="content" label="Innhold" />
              <Tabs.Tab value="term" label="Nøkkelord" />
              <Tabs.Tab value="query" label="Parametere" />
            </Tabs.List>

            <Tabs.Panel value="source" className="pt-4">
              <AnalysisTable
                title="Kilde"
                data={marketingData['source'] || []}
                metricLabel={getMarketingMetricLabel(submittedMetricType)}
                metricType={submittedMetricType}
                queryStats={queryStats}
                selectedWebsite={selectedWebsite}
                addToDashboardSqlTemplate={getMarketingSqlTemplate('source', 'Kilde')}
              />
            </Tabs.Panel>
            <Tabs.Panel value="medium" className="pt-4">
              <AnalysisTable
                title="Medium"
                data={marketingData['medium'] || []}
                metricLabel={getMarketingMetricLabel(submittedMetricType)}
                metricType={submittedMetricType}
                queryStats={queryStats}
                selectedWebsite={selectedWebsite}
                addToDashboardSqlTemplate={getMarketingSqlTemplate('medium', 'Medium')}
              />
            </Tabs.Panel>
            <Tabs.Panel value="campaign" className="pt-4">
              <AnalysisTable
                title="Kampanje"
                data={marketingData['campaign'] || []}
                metricLabel={getMarketingMetricLabel(submittedMetricType)}
                metricType={submittedMetricType}
                queryStats={queryStats}
                selectedWebsite={selectedWebsite}
                addToDashboardSqlTemplate={getMarketingSqlTemplate('campaign', 'Kampanje')}
              />
            </Tabs.Panel>
            <Tabs.Panel value="content" className="pt-4">
              <AnalysisTable
                title="Innhold"
                data={marketingData['content'] || []}
                metricLabel={getMarketingMetricLabel(submittedMetricType)}
                metricType={submittedMetricType}
                queryStats={queryStats}
                selectedWebsite={selectedWebsite}
                addToDashboardSqlTemplate={getMarketingSqlTemplate('content', 'Innhold')}
              />
            </Tabs.Panel>
            <Tabs.Panel value="term" className="pt-4">
              <AnalysisTable
                title="Nøkkelord"
                data={marketingData['term'] || []}
                metricLabel={getMarketingMetricLabel(submittedMetricType)}
                metricType={submittedMetricType}
                queryStats={queryStats}
                selectedWebsite={selectedWebsite}
                addToDashboardSqlTemplate={getMarketingSqlTemplate('term', 'Nøkkelord')}
              />
            </Tabs.Panel>
            <Tabs.Panel value="referrer" className="pt-4">
              <AnalysisTable
                title="Henvisningsdomene"
                data={marketingData['referrer'] || []}
                metricLabel={getMarketingMetricLabel(submittedMetricType)}
                metricType={submittedMetricType}
                queryStats={queryStats}
                selectedWebsite={selectedWebsite}
                addToDashboardSqlTemplate={getMarketingSqlTemplate('referrer', 'Henvisningsdomene')}
              />
            </Tabs.Panel>
            <Tabs.Panel value="query" className="pt-4">
              <AnalysisTable
                title="URL Parametere"
                data={marketingData['query'] || []}
                metricLabel={getMarketingMetricLabel(submittedMetricType)}
                metricType={submittedMetricType}
                queryStats={queryStats}
                selectedWebsite={selectedWebsite}
                addToDashboardSqlTemplate={getMarketingSqlTemplate('query', 'URL_parametere')}
              />
            </Tabs.Panel>
          </Tabs>
          <div className="flex justify-end mt-8">
            <Button
              size="small"
              variant="secondary"
              icon={copySuccess ? <Check size={16} /> : <Share2 size={16} />}
              onClick={copyShareLink}
            >
              {copySuccess ? 'Kopiert!' : 'Del analyse'}
            </Button>
          </div>
        </>
      )}
    </ChartLayout>
  )
}

export default MarketingAnalysis
