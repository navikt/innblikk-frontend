import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Alert, BodyShort, Button, VStack } from '@navikt/ds-react'
import WebsitePicker from '../../analysis/ui/WebsitePicker'
import PeriodPicker from '../../analysis/ui/PeriodPicker'
import UrlPathFilter from '../../analysis/ui/UrlPathFilter'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock'
import { BetaFeatureNotice, BetaFeedbackLine } from '../../../shared/ui/BetaFeatureNotice'
import {
  getDateRangeFromPeriod,
  getStoredPeriod,
  normalizeUrlToPath,
  savePeriodPreference,
  getCookieCountByParams,
} from '../../../shared/lib/utils'
import { useCookieSupport, useCookieStartDate } from '../../../shared/hooks/useSiteimproveSupport'
import type { Website } from '../../../shared/types/chart'
import { parseRepetitionResult } from '../model/repetition'
import type { RepetitionResult } from '../model/repetition'
import RepetitionResults from './RepetitionResults'
import AnalysisInfo from './AnalysisInfo'

export default function RepetitionAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [website, setWebsite] = useState<Website | null>(null)
  const usesCookies = useCookieSupport(website?.domain, website?.id)
  const cookieStartDate = useCookieStartDate(website?.domain, website?.id)
  const [paths, setPaths] = useState(() => {
    const path = searchParams.get('urlPath') || searchParams.get('pagePath')
    return path ? [normalizeUrlToPath(path)] : []
  })
  const [pathOperator, setPathOperator] = useState(() =>
    searchParams.get('pathOperator') === 'starts-with' ? 'starts-with' : 'equals',
  )
  const [period, setPeriod] = useState(() => getStoredPeriod(searchParams.get('period')))
  const [from, setFrom] = useState<Date | undefined>(() => {
    const value = searchParams.get('from')
    return value ? parseISO(value) : undefined
  })
  const [to, setTo] = useState<Date | undefined>(() => {
    const value = searchParams.get('to')
    return value ? parseISO(value) : undefined
  })
  const [response, setResponse] = useState<{ key: string; result: RepetitionResult; search: string } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const key = JSON.stringify([website?.id, paths, pathOperator, period, from, to, usesCookies, cookieStartDate])
  const activeKey = useRef(key)
  const loading = loadingKey === key
  const result = response?.key === key ? response : null

  useEffect(() => {
    activeKey.current = key
    controller.current?.abort()
    return () => controller.current?.abort()
  }, [key])

  const analyze = async () => {
    const range = getDateRangeFromPeriod(period, from, to)
    if (
      !website ||
      !range ||
      !Number.isFinite(range.startDate.getTime()) ||
      !Number.isFinite(range.endDate.getTime()) ||
      range.endDate < range.startDate ||
      range.endDate.getTime() - range.startDate.getTime() > 31 * 86400000
    ) {
      setError({ key, message: 'Velg et nettsted og en gyldig periode på maksimalt 31 dager.' })
      return
    }
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoadingKey(key)
    setError(null)
    setResponse(null)
    const params = new URLSearchParams()
    params.set('websiteId', website.id)
    params.set('period', period)
    if (paths[0]) {
      params.set('urlPath', paths[0])
      params.set('pathOperator', pathOperator)
    }
    if (period === 'custom' && from && to) {
      params.set('from', format(from, 'yyyy-MM-dd'))
      params.set('to', format(to, 'yyyy-MM-dd'))
    }
    setSearchParams(params, { replace: true })
    try {
      const res = await fetch('/api/bigquery/repetition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: request.signal,
        body: JSON.stringify({
          websiteId: website.id,
          startDate: range.startDate.toISOString(),
          endDate: range.endDate.toISOString(),
          urlPath: paths[0] || '',
          pathOperator,
          ...getCookieCountByParams(usesCookies, cookieStartDate, range.startDate, range.endDate),
        }),
      })
      if (!res.ok) {
        throw new Error(`Kunne ikke hente analysen (HTTP ${res.status}). Prøv igjen eller velg en kortere periode.`)
      }
      const data: unknown = await res.json()
      const parsed = parseRepetitionResult(data)
      if (!request.signal.aborted && activeKey.current === key) {
        setResponse({ key, result: parsed, search: params.toString() })
      }
    } catch (err) {
      if (!request.signal.aborted && activeKey.current === key) {
        console.error('Repetition analysis failed:', err)
        setError({ key, message: err instanceof Error ? err.message : 'Kunne ikke hente analysen.' })
      }
    } finally {
      if (controller.current === request) setLoadingKey(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Gjentatt aktivitet"
        description="Finn mulig frustrasjon og feil i sporingsoppsettet."
        beta
        betaLabel="Alfa"
        compactGutters
        notice={
          <BetaFeatureNotice id="gjentatt-aktivitet" title="Gjentatt aktivitet er i alfa">
            Analysen viser mulige signaler, ikke bekreftet frustrasjon eller feil. Terskler og tolkning er under
            utprøving.
            <BetaFeedbackLine />
          </BetaFeatureNotice>
        }
      />
      <AppBlock gutters="compact" className="pb-16">
        <VStack gap="space-24">
          <div className="flex flex-wrap items-end gap-4 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-subtle)] p-4">
            <div className="relative w-full sm:w-[250px] focus-within:z-10">
              <WebsitePicker selectedWebsite={website} onWebsiteChange={setWebsite} disableAutoEvents />
            </div>
            <UrlPathFilter
              urlPaths={paths}
              onUrlPathsChange={setPaths}
              pathOperator={pathOperator}
              onPathOperatorChange={setPathOperator}
              selectedWebsiteId={website?.id}
              selectedWebsiteDomain={website?.domain}
              isMultiSelect={false}
              className="w-full sm:w-[300px] focus-within:z-10"
            />
            <PeriodPicker
              period={period}
              onPeriodChange={(value) => {
                setPeriod(value)
                savePeriodPreference(value)
              }}
              startDate={from}
              onStartDateChange={setFrom}
              endDate={to}
              onEndDateChange={setTo}
            />
            <Button size="small" onClick={() => void analyze()} disabled={!website || loading} loading={loading}>
              Analyser
            </Button>
          </div>
          <AnalysisInfo summary={result?.result.summary} />
          <div aria-live="polite" aria-busy={loading}>
            {loading && <BodyShort>Analyserer gjentatt aktivitet …</BodyShort>}
            {error?.key === key && <Alert variant="error">{error.message}</Alert>}
            {result && <RepetitionResults result={result.result} search={result.search} />}
            {!loading && !result && error?.key !== key && (
              <BodyShort textColor="subtle">Velg nettsted og periode, og trykk «Analyser». URL kan stå tom.</BodyShort>
            )}
          </div>
        </VStack>
      </AppBlock>
    </>
  )
}
