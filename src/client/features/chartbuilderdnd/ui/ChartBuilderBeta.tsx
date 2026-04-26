import { useEffect, useMemo, useState } from 'react'
import { Alert, Bleed, Box, Button, Label, Loader, Select } from '@navikt/ds-react'
import { PlayIcon } from 'lucide-react'
import ChartLayout from '../../analysis/ui/ChartLayoutOriginal'
import { QueryPreview } from '../../chartbuilder'
import { fetchWebsites } from '../../../shared/api/websiteApi'
import type { Website } from '../../../shared/types/website'
import SidebarSection from '../../../shared/ui/SidebarSection'
import type { SentenceFilter } from '../model/types'
import { useSentenceBuilder } from '../hooks/useSentenceBuilder'
import { buildSentenceSql } from '../utils/sqlBuilder'
import SentenceBuilder from './SentenceBuilder'

export default function ChartBuilderBeta() {
  const [websites, setWebsites] = useState<Website[]>([])
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>('')
  const [isWebsitesLoading, setIsWebsitesLoading] = useState<boolean>(true)
  const [websiteError, setWebsiteError] = useState<string | null>(null)
  const [submittedSql, setSubmittedSql] = useState<string>('')
  const [filters, setFilters] = useState<SentenceFilter[]>([])
  const [period, setPeriod] = useState<string>('last_7_days')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)

  const { tokens, zoneTokenIds, sentence, handleDropOnZone, placeTokenInZone, clearZone, resetSentence } =
    useSentenceBuilder()

  useEffect(() => {
    const loadWebsites = async () => {
      setIsWebsitesLoading(true)
      setWebsiteError(null)

      try {
        const list = await fetchWebsites()
        setWebsites(list)
        if (list[0]) {
          setSelectedWebsiteId(list[0].id)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Klarte ikke hente nettsider'
        setWebsiteError(message)
      } finally {
        setIsWebsitesLoading(false)
      }
    }

    void loadWebsites()
  }, [])

  const generatedSql = useMemo(() => {
    if (!selectedWebsiteId || !sentence.metric.trim()) return ''

    const normalizedSentence = {
      metric: sentence.metric,
      timeBucket: sentence.timeBucket.trim(),
      groupBy: sentence.groupBy.trim() || 'none',
      period: sentence.period.trim() || '7',
      limit: sentence.limit.trim() || '100',
    }

    return buildSentenceSql({
      websiteId: selectedWebsiteId,
      metric: normalizedSentence.metric,
      timeBucket: normalizedSentence.timeBucket,
      groupBy: normalizedSentence.groupBy,
      period: normalizedSentence.period,
      periodKey: period,
      customStartDate,
      customEndDate,
      limit: normalizedSentence.limit,
      filters,
    })
  }, [selectedWebsiteId, sentence, period, customStartDate, customEndDate, filters])

  const handleResetAll = () => {
    resetSentence()
    setFilters([])
    setPeriod('last_7_days')
    setCustomStartDate(undefined)
    setCustomEndDate(undefined)
    setSubmittedSql('')
  }

  useEffect(() => {
    if (!submittedSql) return
    if (generatedSql !== submittedSql) {
      setSubmittedSql('')
    }
  }, [generatedSql, submittedSql])

  const canShowResults = Boolean(selectedWebsiteId && sentence.metric.trim())

  return (
    <ChartLayout
      title="Grafbygger"
      description=""
      wideSidebar={true}
      filters={
        <>
          <Bleed asChild marginBlock="space-24" marginInline="space-24" reflectivePadding>
            <Box background="accent-strong" className="pb-2">
              <div className="space-y-3">
                <Label htmlFor="chartbuilder-dnd-website" className="text-[var(--ax-text-accent-contrast)]">
                  Nettside
                </Label>
                {isWebsitesLoading ? (
                  <Loader size="small" title="Laster nettsider" />
                ) : (
                  <Select
                    id="chartbuilder-dnd-website"
                    label=""
                    hideLabel
                    value={selectedWebsiteId}
                    onChange={(event) => setSelectedWebsiteId(event.target.value)}
                  >
                    <option value="">Velg nettside</option>
                    {websites.map((website) => (
                      <option key={website.id} value={website.id}>
                        {website.name}
                      </option>
                    ))}
                  </Select>
                )}
                {websiteError && <Alert variant="error">{websiteError}</Alert>}
                {!isWebsitesLoading && !websiteError && websites.length === 0 && (
                  <Alert variant="warning">Ingen nettsider tilgjengelig for brukeren din.</Alert>
                )}
              </div>
            </Box>
          </Bleed>

          <SidebarSection
            title="Hva vil du se?"
            action={
              <Button size="xsmall" variant="tertiary" onClick={handleResetAll}>
                Nullstill
              </Button>
            }
          >
            <section className="space-y-3">
              <SentenceBuilder
                zoneTokenIds={zoneTokenIds}
                tokens={tokens}
                filters={filters}
                onDrop={handleDropOnZone}
                onSelectToken={placeTokenInZone}
                onClearZone={clearZone}
                onAddFilter={(filter) => {
                  const id = `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                  setFilters((prev) => [...prev, { ...filter, id }])
                }}
                onRemoveFilter={(id) => {
                  setFilters((prev) => prev.filter((item) => item.id !== id))
                }}
                onReset={handleResetAll}
                period={period}
                onPeriodChange={setPeriod}
                customStartDate={customStartDate}
                onCustomStartDateChange={setCustomStartDate}
                customEndDate={customEndDate}
                onCustomEndDateChange={setCustomEndDate}
                showHeader={false}
              />
              <div className="mt-5 mb-1 flex items-center gap-3">
                <Button
                  size="small"
                  icon={<PlayIcon size={16} />}
                  disabled={!canShowResults}
                  onClick={() => setSubmittedSql(generatedSql)}
                >
                  Vis resultater
                </Button>
              </div>
            </section>
          </SidebarSection>
        </>
      }
    >
      <div className="space-y-4">
        <div className="sticky top-6 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <QueryPreview
            sql={submittedSql}
            autoExecuteOnSqlChange={true}
            activeStep={1}
            openFormprogress={false}
            onResetAll={handleResetAll}
            showDownloadReadMore={false}
          />
        </div>
      </div>
    </ChartLayout>
  )
}
