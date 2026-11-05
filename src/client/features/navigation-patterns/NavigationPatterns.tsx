import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, isValid, parseISO } from 'date-fns'
import {
  Accordion,
  Alert,
  BodyShort,
  Box,
  Button,
  CopyButton,
  Detail,
  Heading,
  HGrid,
  HStack,
  Link,
  ReadMore,
  Select,
  Table,
  Tag,
  VStack,
} from '@navikt/ds-react'
import { ArrowCirclepathIcon, ArrowRightIcon, DownloadIcon, MagnifyingGlassIcon } from '@navikt/aksel-icons'
import ChartLayout from '../analysis/ui/ChartLayout'
import WebsitePicker from '../analysis/ui/WebsitePicker'
import PeriodPicker from '../analysis/ui/PeriodPicker'
import UrlPathFilter from '../analysis/ui/UrlPathFilter'
import SqlViewer from '../chartbuilder-next/ui/results/SqlViewer'
import QueryStatsDisplay from '../user/ui/components/QueryStatsDisplay'
import { QueryCostConfirmation } from '../../shared/ui/QueryCostConfirmation'
import { getDateRangeFromPeriod, normalizeUrlToPath, PERIOD_OPTIONS } from '../../shared/lib/utils'
import type { Website } from '../../shared/types/chart'
import {
  isPatternResult,
  isPatternEstimate,
  patternCsv,
  patternDays,
  patternDescriptions,
  patternLabels,
  patternSequence,
  prioritisePatterns,
  type NavigationPattern,
  type PatternResult,
  type PatternEstimate,
  type PatternPriority,
  type PatternType,
} from './model'
import './navigationPatterns.css'

const number = new Intl.NumberFormat('nb-NO')
const percent = new Intl.NumberFormat('nb-NO', { style: 'percent', maximumFractionDigits: 1 })

function readDate(value: string | null) {
  if (!value) return undefined
  const date = parseISO(value)
  return isValid(date) ? date : undefined
}

function PageSequence({ pattern }: { pattern: NavigationPattern }) {
  return (
    <ol className="navigation-pattern-sequence">
      {patternSequence(pattern).map((path, index) => (
        <li key={`${index}:${path}`}>
          {index > 0 && (
            <span aria-hidden className="navigation-pattern-arrow">
              →
            </span>
          )}
          <span
            className={
              index > 0 && index % pattern.pages.length === 0
                ? 'navigation-pattern-page navigation-pattern-return'
                : 'navigation-pattern-page'
            }
          >
            {path}
          </span>
        </li>
      ))}
    </ol>
  )
}

function ContextList({ title, items }: { title: string; items: NavigationPattern['before'] }) {
  return (
    <div>
      <Heading level="4" size="xsmall" spacing>
        {title}
      </Heading>
      {items.length > 0 ? (
        <ul className="navigation-pattern-context">
          {items.map((item) => (
            <li key={item.path}>
              <span className="break-all">{item.path}</span>
              <Detail>{number.format(item.sessions)} økter</Detail>
            </li>
          ))}
        </ul>
      ) : (
        <BodyShort size="small">Ingen registrert side.</BodyShort>
      )}
    </div>
  )
}

function PatternDetails({ pattern, params }: { pattern: NavigationPattern; params: URLSearchParams }) {
  const max = Math.max(1, ...pattern.trend.map((day) => day.sessions))
  const analysisLink = (route: string, path: string) => {
    const next = new URLSearchParams(params)
    next.set('urlPath', path)
    next.delete('pathScope')
    return `${route}?${next}`
  }
  return (
    <VStack gap="space-24">
      <Box background="neutral-soft" padding="space-16" borderRadius="8">
        <Heading level="3" size="xsmall" spacing>
          Hva kan være verdt å undersøke?
        </Heading>
        <BodyShort size="small">
          {pattern.type === 'quick-return'
            ? 'Stemmer innholdet på den neste siden med det lenketeksten lover?'
            : 'Må brukerne tilbake for å finne informasjon eller forstå neste steg?'}
        </BodyShort>
      </Box>
      <HGrid columns={{ xs: 1, md: 2 }} gap="space-24">
        <ContextList title="Vanlige sider før mønsteret" items={pattern.before} />
        <ContextList title="Vanlige sider etter mønsteret" items={pattern.after} />
      </HGrid>
      <div>
        <Heading level="3" size="xsmall" spacing>
          Berørte økter per dag
        </Heading>
        <div className="overflow-x-auto">
          <Table size="small">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell scope="col">Dato</Table.HeaderCell>
                <Table.HeaderCell scope="col" align="right">
                  Økter
                </Table.HeaderCell>
                <Table.HeaderCell scope="col">
                  <span className="sr-only">Relativt antall</span>
                </Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {pattern.trend.map((day) => (
                <Table.Row key={day.date}>
                  <Table.DataCell>{day.date}</Table.DataCell>
                  <Table.DataCell align="right">{number.format(day.sessions)}</Table.DataCell>
                  <Table.DataCell>
                    <div
                      aria-hidden
                      className="navigation-pattern-bar"
                      style={{ width: `${(day.sessions / max) * 100}%` }}
                    />
                  </Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>
      <div>
        <Heading level="3" size="xsmall" spacing>
          Undersøk sidene videre
        </Heading>
        <ul className="navigation-pattern-context">
          {pattern.pages.map((path) => (
            <li key={path}>
              <span className="break-all">{path}</span>
              <HStack gap="space-16">
                <Link href={analysisLink('/brukerreiser', path)}>Navigasjonsflyt</Link>
                <Link href={analysisLink('/klikkoversikt', path)}>Klikkoversikt</Link>
              </HStack>
            </li>
          ))}
        </ul>
      </div>
    </VStack>
  )
}

function Findings({ patterns, params }: { patterns: NavigationPattern[]; params: URLSearchParams }) {
  const [visible, setVisible] = useState(5)
  const [expanded, setExpanded] = useState<string[]>([])
  return (
    <VStack gap="space-16">
      <Accordion>
        {patterns.slice(0, visible).map((pattern) => (
          <Accordion.Item
            key={pattern.id}
            onOpenChange={(open) =>
              setExpanded((previous) => (open ? [...previous, pattern.id] : previous.filter((id) => id !== pattern.id)))
            }
          >
            <Accordion.Header>
              <div className="navigation-pattern-finding">
                <HStack gap="space-8" align="center">
                  {pattern.type === 'cycle' ? <ArrowCirclepathIcon aria-hidden /> : <ArrowRightIcon aria-hidden />}
                  <span>{patternLabels[pattern.type]}</span>
                  <Tag size="xsmall" variant="neutral">
                    {number.format(pattern.sessions)} økter
                  </Tag>
                  <Tag size="xsmall" variant="neutral">
                    Treff på {number.format(patternDays(pattern))} {patternDays(pattern) === 1 ? 'dag' : 'dager'}
                  </Tag>
                </HStack>
                <Detail>{patternDescriptions[pattern.type]}</Detail>
                <PageSequence pattern={pattern} />
                <Detail>
                  {percent.format(pattern.share)} av analyserte økter · Median{' '}
                  {number.format(pattern.medianRepetitions)} {pattern.type === 'quick-return' ? 'returer' : 'runder'}{' '}
                  per berørt økt
                </Detail>
              </div>
            </Accordion.Header>
            <Accordion.Content>
              {expanded.includes(pattern.id) && <PatternDetails pattern={pattern} params={params} />}
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion>
      <HStack gap="space-16" align="center">
        <Detail>
          Viser {number.format(Math.min(visible, patterns.length))} av {number.format(patterns.length)} mønstre
        </Detail>
        {visible < patterns.length && (
          <Button variant="secondary" size="small" onClick={() => setVisible((previous) => previous + 5)}>
            Vis flere mønstre
          </Button>
        )}
      </HStack>
    </VStack>
  )
}

type PendingAnalysis = {
  key: string
  params: URLSearchParams
  signal: AbortSignal
  body: { websiteId: string; startDate: string; endDate: string; pathScope: string; urlPath?: string }
}

type RequestState =
  | { key: string; status: 'loading'; phase: 'estimate' | 'execute' }
  | { key: string; status: 'confirmation'; pending: PendingAnalysis; estimate: PatternEstimate }
  | { key: string; status: 'error'; error: string }
  | { key: string; status: 'success'; data: PatternResult; params: URLSearchParams }

export default function NavigationPatterns() {
  const [params, setParams] = useSearchParams()
  const [website, setWebsite] = useState<Website | null>(null)
  const period = params.get('period') || 'last_7_days'
  const path = normalizeUrlToPath(params.get('urlPath') || '')
  const pathScope = params.get('pathScope') || (path ? 'from-first-visit' : 'anywhere')
  const [from, setFrom] = useState(() => readDate(params.get('from')))
  const [to, setTo] = useState(() => readDate(params.get('to')))
  const [state, setState] = useState<RequestState | null>(null)
  const [kind, setKind] = useState<PatternType | 'all'>('all')
  const [priority, setPriority] = useState<PatternPriority>('reach')
  const [minimumSessions, setMinimumSessions] = useState(1)
  const controller = useRef<AbortController | null>(null)
  const filterKey = JSON.stringify([
    website?.id,
    period,
    path,
    pathScope,
    period === 'custom' ? from : null,
    period === 'custom' ? to : null,
  ])
  const active = state?.key === filterKey ? state : null
  const data = active?.status === 'success' ? active.data : null
  const loading = active?.status === 'loading'

  useEffect(() => () => controller.current?.abort(), [filterKey])

  const updateParam = (key: string, value: string) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value) next.set(key, value)
        else next.delete(key)
        if (key === 'urlPath' && !value) next.delete('pathScope')
        return next
      },
      { replace: true },
    )
  }

  const requestResult = async (endpoint: string, pending: PendingAnalysis, confirmedBytes?: number) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: pending.signal,
      body: JSON.stringify({ ...pending.body, ...(confirmedBytes !== undefined ? { confirmedBytes } : {}) }),
    })
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new Error(
        response.ok
          ? 'Analysen returnerte et ugyldig svar. Prøv igjen eller kontakt ResearchOps.'
          : `Analysen kunne ikke lastes (HTTP ${response.status}).`,
      )
    const result: unknown = await response.json()
    if (response.status === 409 && isPatternEstimate(result)) return { response, result }
    if (!response.ok) {
      const details =
        typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
          ? ` ${result.error}`
          : ''
      throw new Error(`Analysen kunne ikke lastes (HTTP ${response.status}).${details}`)
    }
    return { response, result }
  }

  const showError = (pending: PendingAnalysis, error: unknown) => {
    if (!pending.signal.aborted)
      setState({
        key: pending.key,
        status: 'error',
        error: error instanceof Error ? error.message : 'Kunne ikke laste analysen. Prøv igjen.',
      })
  }

  const execute = async (pending: PendingAnalysis, confirmedBytes?: number) => {
    if (pending.signal.aborted) return
    setState({ key: pending.key, status: 'loading', phase: 'execute' })
    try {
      const { response, result } = await requestResult('/api/bigquery/navigation-patterns', pending, confirmedBytes)
      if (pending.signal.aborted) return
      if (response.status === 409 && isPatternEstimate(result)) {
        setState({ key: pending.key, status: 'confirmation', pending, estimate: result })
        return
      }
      if (!isPatternResult(result))
        throw new Error('Analysen returnerte et ugyldig svar. Prøv igjen eller kontakt ResearchOps.')
      setState({ key: pending.key, status: 'success', data: result, params: pending.params })
    } catch (error) {
      showError(pending, error)
    }
  }

  const analyze = async () => {
    if (!website) {
      setState({ key: filterKey, status: 'error', error: 'Velg en nettside før du analyserer.' })
      return
    }
    if ((pathScope !== 'anywhere' && pathScope !== 'from-first-visit') || (pathScope === 'from-first-visit' && !path)) {
      setState({
        key: filterKey,
        status: 'error',
        error: 'Velg en startside for «Fra valgt side», eller velg et annet analyseområde.',
      })
      return
    }
    const range = getDateRangeFromPeriod(period, from, to)
    if (
      (period !== 'custom' && !PERIOD_OPTIONS.some((option) => option.value === period)) ||
      !range ||
      !isValid(range.startDate) ||
      !isValid(range.endDate) ||
      range.endDate < range.startDate
    ) {
      setState({ key: filterKey, status: 'error', error: 'Velg en gyldig periode med sluttdato etter startdato.' })
      return
    }
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    request.signal.addEventListener(
      'abort',
      () => {
        setState((previous) =>
          (previous?.status === 'loading' || previous?.status === 'confirmation') && previous.key === filterKey
            ? null
            : previous,
        )
      },
      { once: true },
    )
    setState({ key: filterKey, status: 'loading', phase: 'estimate' })
    const appliedParams = new URLSearchParams()
    appliedParams.set('websiteId', website.id)
    appliedParams.set('period', period)
    if (path) appliedParams.set('urlPath', normalizeUrlToPath(path))
    if (path) appliedParams.set('pathScope', pathScope)
    if (period === 'custom' && from && to) {
      appliedParams.set('from', format(from, 'yyyy-MM-dd'))
      appliedParams.set('to', format(to, 'yyyy-MM-dd'))
    }
    setParams(appliedParams, { replace: true })
    const pending: PendingAnalysis = {
      key: filterKey,
      signal: request.signal,
      params: appliedParams,
      body: {
        websiteId: website.id,
        startDate: range.startDate.toISOString(),
        endDate: new Date(range.endDate.getTime() + 1).toISOString(),
        pathScope,
        ...(path ? { urlPath: path } : {}),
      },
    }
    try {
      const { result } = await requestResult('/api/bigquery/navigation-patterns/estimate', pending)
      if (pending.signal.aborted) return
      if (!isPatternEstimate(result)) throw new Error('Kostnadsestimatet er ugyldig. Analysen er ikke kjørt.')
      if (result.requiresConfirmation) {
        setState({ key: filterKey, status: 'confirmation', pending, estimate: result })
        return
      }
      await execute(pending)
    } catch (error) {
      showError(pending, error)
    }
  }

  const download = () => {
    if (!data) return
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', patternCsv(visiblePatterns)], { type: 'text/csv;charset=utf-8;' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `gjentatt_navigasjon_${format(new Date(), 'yyyy-MM-dd')}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }
  const visiblePatterns = prioritisePatterns(data?.patterns || [], kind, minimumSessions, priority)

  return (
    <ChartLayout
      title="Gjentatt navigasjon"
      description="Se hvilke sider brukerne kommer tilbake til i samme besøk."
      beta
      betaLabel="Alfa"
      websiteId={website?.id}
      websiteDomain={website?.domain}
      websiteName={website?.name}
      sidebarContent={<WebsitePicker selectedWebsite={website} onWebsiteChange={setWebsite} disableAutoEvents />}
      filters={
        <>
          <PeriodPicker
            period={period}
            onPeriodChange={(value) => updateParam('period', value)}
            startDate={from}
            onStartDateChange={setFrom}
            endDate={to}
            onEndDateChange={setTo}
          />
          <div className="w-full sm:w-[300px]">
            <UrlPathFilter
              label={pathScope === 'from-first-visit' ? 'Startside' : 'Side (valgfritt)'}
              urlPaths={path ? [path] : []}
              onUrlPathsChange={(paths) => updateParam('urlPath', paths[0] || '')}
              pathOperator="equals"
              onPathOperatorChange={() => {}}
              showOperator={false}
              isMultiSelect={false}
              selectedWebsiteId={website?.id}
              selectedWebsiteDomain={website?.domain}
            />
          </div>
          <Select
            label="Analyseområde"
            size="small"
            value={pathScope}
            onChange={(event) => updateParam('pathScope', event.target.value)}
          >
            <option value="from-first-visit" disabled={!path}>
              Fra valgt side
            </option>
            <option value="anywhere">{path ? 'Inneholder valgt side' : 'Hele nettstedet'}</option>
          </Select>
          <Button
            size="small"
            icon={<MagnifyingGlassIcon aria-hidden />}
            loading={loading}
            onClick={() => void analyze()}
          >
            Analyser
          </Button>
        </>
      }
    >
      <VStack gap="space-24" className="navigation-patterns">
        <ReadMore header="Slik finner og teller vi mønstre" size="small">
          <VStack gap="space-12">
            <BodyShort size="small">
              <strong>{patternLabels.alternation}:</strong> {patternDescriptions.alternation} Eksempel: A → B → A → B →
              A.
            </BodyShort>
            <BodyShort size="small">
              <strong>{patternLabels.cycle}:</strong> {patternDescriptions.cycle} Eksempel: A → B → C → A → B → C → A.
            </BodyShort>
            <BodyShort size="small">
              <strong>{patternLabels['quick-return']}:</strong> {patternDescriptions['quick-return']} Eksempel: A → B →
              A. Tiden måles fra ankomst på B til retur til A, ikke fra første besøk på A. Dette er en eksperimentell
              regel, ikke bevis på bruk av tilbakeknappen.
            </BodyShort>
            <BodyShort size="small">Samme økt kan telles i flere mønstertyper.</BodyShort>
            <BodyShort size="small">
              Mønstrene viser ikke hvorfor folk navigerer slik, eller om de har problemer. Sider før og etter mønsteret
              er registrerte nabosider, ikke nødvendigvis starten eller slutten på besøket.
            </BodyShort>
            <BodyShort size="small">
              Før kjøring estimerer vi datamengden med en dry run. Fra 50 GB må du bekrefte kostnaden. Over 500 GB må
              perioden begrenses. Hvis estimatet feiler, kjøres ikke analysen.
            </BodyShort>
            <BodyShort size="small">
              Vi slår sammen påfølgende visninger av samme side. Hver økt telles én gang per mønster, men kan ha flere
              mønstre. Median runder er den lengste sammenhengende gjentakelsen per økt; for raske returer teller vi
              forekomster.
            </BodyShort>
            <BodyShort size="small">
              «Inneholder valgt side» viser bare mønstre som går innom siden, uansett hvor i mønsteret den ligger. Uten
              sidefilter analyseres hele nettstedet.
            </BodyShort>
            <BodyShort size="small">
              «Fra valgt side» er standard når du velger en side. Analysen begynner ved første registrerte besøk på
              siden, uten å starte på nytt ved returer. Bare mønstre som involverer den valgte siden tas med, også når
              de oppstår senere i økten. Rundene vises fra den valgte siden; raske returer må starte og slutte der.
              Sekvensen illustrerer mønsteret, ikke en komplett økt. Bare sidevisninger innenfor perioden analyseres, så
              mønstre som krysser periodegrensen kan mangle. Økter er ikke det samme som personer.
            </BodyShort>
            <BodyShort size="small">
              Økter med usikker rekkefølge eller ukjent sidesti utelates. Dagstabellen viser datoer med treff, basert på
              når mønsteret startet. En økt kan telles på flere datoer.
            </BodyShort>
          </VStack>
        </ReadMore>
        {active?.status === 'error' && <Alert variant="error">{active.error}</Alert>}
        <QueryCostConfirmation
          open={active?.status === 'confirmation'}
          estimate={active?.status === 'confirmation' ? active.estimate.queryStats : null}
          onConfirm={() =>
            active?.status === 'confirmation'
              ? execute(active.pending, active.estimate.queryStats.totalBytesProcessed)
              : undefined
          }
          onCancel={() => {
            controller.current?.abort()
            setState(null)
          }}
        />
        {loading && (
          <div role="status">
            <BodyShort>
              {active?.status === 'loading' && active.phase === 'estimate'
                ? 'Estimerer kostnad før kjøring …'
                : 'Analyserer gjentatt navigasjon …'}
            </BodyShort>
          </div>
        )}
        {!active && state && (
          <Box background="neutral-soft" padding={{ xs: 'space-24', md: 'space-32' }} borderRadius="12">
            <VStack gap="space-12">
              <Heading level="2" size="medium">
                Filtrene er endret
              </Heading>
              <BodyShort>Trykk «Analyser» for å oppdatere resultatene.</BodyShort>
            </VStack>
          </Box>
        )}
        {data && active?.status === 'success' && (
          <>
            <HGrid columns={{ xs: 1, sm: 3 }} gap="space-16">
              {[
                {
                  label: 'Analyserte økter',
                  value: number.format(data.summary.totalSessions),
                  notes: [
                    data.summary.ambiguousSessions > 0
                      ? `${number.format(data.summary.ambiguousSessions)} økter utelatt: usikker rekkefølge.`
                      : null,
                    data.metadata?.invalidPathSessions
                      ? `${number.format(data.metadata.invalidPathSessions)} økter utelatt: ukjent sidesti.`
                      : null,
                    data.metadata?.missingSessionEvents
                      ? `${number.format(data.metadata.missingSessionEvents)} sidevisninger utelatt: mangler økt-ID.`
                      : null,
                  ].filter((note) => note !== null),
                },
                {
                  label: 'Økter med mønstre',
                  value: number.format(data.summary.patternSessions),
                  notes: [],
                },
                {
                  label: 'Andel med gjentatte runder',
                  value: percent.format(
                    data.summary.totalSessions ? data.summary.repeatedCycleSessions / data.summary.totalSessions : 0,
                  ),
                  notes: [],
                },
              ].map(({ label, value, notes }) => (
                <Box
                  key={label}
                  role="group"
                  aria-label={label}
                  borderWidth="1"
                  borderColor="neutral-subtle"
                  borderRadius="12"
                  padding="space-24"
                >
                  <Detail>{label}</Detail>
                  <div className="navigation-pattern-stat">{value}</div>
                  {notes.length > 0 && (
                    <Box style={{ marginBlockStart: 'var(--ax-space-8)' }}>
                      <VStack gap="space-4">
                        {notes.map((note) => (
                          <Detail key={note}>{note}</Detail>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </Box>
              ))}
            </HGrid>
            <HStack gap="space-16" justify="space-between" align="end">
              <div>
                <Heading level="2" size="medium">
                  Mønstre å undersøke
                </Heading>
              </div>
              <HStack gap="space-8">
                <CopyButton
                  copyText={`${window.location.origin}/navigasjonsmonstre?${active.params}`}
                  text="Kopier lenke"
                  activeText="Kopiert!"
                  size="small"
                />
                <Button
                  variant="secondary"
                  size="small"
                  onClick={download}
                  icon={<DownloadIcon aria-hidden />}
                  disabled={visiblePatterns.length === 0}
                >
                  Last ned CSV
                </Button>
              </HStack>
            </HStack>
            {data.patterns.length === 0 ? (
              <Alert variant="info">
                {data.summary.totalSessions === 0
                  ? 'Ingen analyserbare økter i perioden. Prøv en annen periode eller fjern sidefilteret.'
                  : 'Ingen mønstre oppfylte reglene i denne perioden.'}
              </Alert>
            ) : (
              <>
                <HStack gap="space-16" align="end">
                  <Select
                    label="Mønstertype"
                    size="small"
                    value={kind}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value === 'all' || value === 'alternation' || value === 'cycle' || value === 'quick-return')
                        setKind(value)
                    }}
                    className="navigation-pattern-kind"
                  >
                    <option value="all">Alle mønstre</option>
                    <option value="alternation">{patternLabels.alternation} (minst to runder)</option>
                    <option value="cycle">{patternLabels.cycle} (tre eller fire sider)</option>
                    <option value="quick-return">{patternLabels['quick-return']} (innen 10 sekunder)</option>
                  </Select>
                  <Select
                    label="Sorter etter"
                    size="small"
                    value={priority}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value === 'reach' || value === 'days' || value === 'repetitions') setPriority(value)
                    }}
                  >
                    <option value="reach">Flest berørte økter</option>
                    <option value="days">Flest dager med treff</option>
                    <option value="repetitions">Flest gjentakelser per økt</option>
                  </Select>
                  <Select
                    label="Minst antall økter"
                    size="small"
                    value={minimumSessions}
                    onChange={(event) => setMinimumSessions(Number(event.target.value))}
                  >
                    {[1, 5, 10, 25, 50].map((minimum) => (
                      <option key={minimum} value={minimum}>
                        {minimum}
                      </option>
                    ))}
                  </Select>
                </HStack>
                {visiblePatterns.length ? (
                  <Findings
                    key={`${kind}:${priority}:${minimumSessions}`}
                    patterns={visiblePatterns}
                    params={active.params}
                  />
                ) : (
                  <Alert variant="info">Ingen mønstre passer filtrene. Prøv en annen type eller færre økter.</Alert>
                )}
              </>
            )}
            <QueryStatsDisplay queryStats={data.queryStats ?? null} />
            <SqlViewer sql={data.generatedSql} showMetabaseActions={false} seksjon="navigasjonsmonstre" />
          </>
        )}
      </VStack>
    </ChartLayout>
  )
}
