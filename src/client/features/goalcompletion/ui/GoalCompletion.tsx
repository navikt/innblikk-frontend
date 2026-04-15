import { useState } from 'react'
import { Alert, BodyShort, Button, Heading, Loader, Switch } from '@navikt/ds-react'
import { ResponsiveContainer, LineChart } from '@fluentui/react-charting'
import ChartLayout from '../../analysis/ui/ChartLayout.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx'
import CookieMixNotice from '../../analysis/ui/CookieMixNotice.tsx'
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx'
import { useGoalCompletion } from '../hooks/useGoalCompletion'
import GoalCompletionStatsCards from './GoalCompletionStatsCards.tsx'

const GoalCompletion = () => {
  const {
    selectedWebsite,
    setSelectedWebsite,
    usesCookies,
    startUrl,
    setStartUrl,
    startPathOperator,
    setStartPathOperator,
    goalUrl,
    setGoalUrl,
    goalPathOperator,
    setGoalPathOperator,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    data,
    summary,
    chartData,
    queryStats,
    loading,
    error,
    hasAttemptedFetch,
    hasUnappliedFilterChanges,
    cookieBadge,
    isPreCookieRange,
    cookieStartDate,
    fetchData,
  } = useGoalCompletion()

  const [showTableSection, setShowTableSection] = useState(false)

  return (
    <ChartLayout
      title="Måloppnåelse"
      description="Se hvor mange som starter på én URL og fullfører på en valgt mål-URL."
      currentPage="maloppnaelse"
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={<WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />}
      filters={
        <>
          <div className="w-full sm:w-[300px]">
            <UrlPathFilter
              urlPaths={startUrl ? [startUrl] : []}
              onUrlPathsChange={(paths) => setStartUrl(paths[0] || '')}
              pathOperator={startPathOperator}
              onPathOperatorChange={setStartPathOperator}
              selectedWebsiteDomain={selectedWebsite?.domain}
              label="Start-URL"
            />
          </div>

          <div className="w-full sm:w-[300px]">
            <UrlPathFilter
              urlPaths={goalUrl ? [goalUrl] : []}
              onUrlPathsChange={(paths) => setGoalUrl(paths[0] || '')}
              pathOperator={goalPathOperator}
              onPathOperatorChange={setGoalPathOperator}
              selectedWebsiteDomain={selectedWebsite?.domain}
              label="Mål-URL"
            />
          </div>

          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            startDate={customStartDate}
            onStartDateChange={setCustomStartDate}
            endDate={customEndDate}
            onEndDateChange={setCustomEndDate}
            showShortPeriods={usesCookies}
          />

          <div className="flex items-end pb-[2px]">
            <Button
              onClick={fetchData}
              size="small"
              disabled={!selectedWebsite || loading || !hasUnappliedFilterChanges}
              loading={loading}
            >
              Vis
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

      {loading && (
        <div className="flex justify-center items-center h-full">
          <Loader size="xlarge" title="Beregner måloppnåelse..." />
        </div>
      )}

      {!loading && hasAttemptedFetch && summary.totalStarters > 0 && (
        <>
          {(cookieBadge === 'mix' || isPreCookieRange) && (
            <CookieMixNotice
              websiteName={selectedWebsite?.name}
              cookieStartDate={cookieStartDate}
              variant={isPreCookieRange ? 'pre' : 'mix'}
            />
          )}

          <GoalCompletionStatsCards summary={summary} />

          <div className="pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Heading level="3" size="small">
                Måloppnåelse over tid
              </Heading>
              {queryStats && (
                <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                  {queryStats.totalBytesProcessedGB} GB prosessert
                </div>
              )}
            </div>
            {data.length > 0 ? (
              <div style={{ width: '100%', height: '500px' }}>
                {chartData && (
                  <ResponsiveContainer>
                    <LineChart
                      data={chartData.data}
                      legendsOverflowText={'Overflow Items'}
                      yAxisTickFormat={(d: number | string) => `${Number(d)}% `}
                      legendProps={{
                        allowFocusOnLegends: true,
                        styles: {
                          text: { color: 'var(--ax-text-default)' },
                        },
                      }}
                    />
                  </ResponsiveContainer>
                )}
              </div>
            ) : (
              <Alert variant="info" className="mb-2">
                Ingen fullføringer i valgt periode.
              </Alert>
            )}
            <div className="mt-4 flex justify-end">
              <Switch checked={showTableSection} onChange={(e) => setShowTableSection(e.target.checked)} size="small">
                Vis som tabell
              </Switch>
            </div>
          </div>

          {showTableSection && (
            <div className="pt-4">
              <div className="border border-[var(--ax-border-neutral-subtle)] rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
                <div className="p-4 pb-2">
                  <TableSectionHeader title="Tabell" />
                </div>
                <div className="overflow-x-auto px-4">
                  <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
                    <thead className="bg-[var(--ax-bg-neutral-soft)]">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">
                          Dag
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">
                          Fullførte brukere
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">
                          Prosent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
                      {data.map((item, index) => (
                        <tr key={index} className="hover:bg-[var(--ax-bg-neutral-soft]">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--ax-text-default)]">
                            Dag {item.day}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                            {item.completed_users.toLocaleString('nb-NO')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                            {item.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 pb-4" aria-hidden="true" />
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && hasAttemptedFetch && summary.totalStarters === 0 && (
        <div className="text-center p-8 text-gray-500 bg-[var(--ax-bg-neutral-soft)] rounded-lg border border-[var(--ax-border-neutral-subtle)] mt-4">
          <BodyShort>Ingen brukere startet på valgt start-URL i perioden.</BodyShort>
        </div>
      )}
    </ChartLayout>
  )
}

export default GoalCompletion
