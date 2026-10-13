import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { Alert, BodyShort, Button, Heading, HelpText, HStack, VStack } from '@navikt/ds-react'
import { ArrowCirclepathReverseIcon, ChevronUpIcon } from '@navikt/aksel-icons'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils.ts'
import type { CohortNode } from '../../cohortmanager/model/types.ts'
import { fetchCohortPreview, type PreviewResult } from '../api/previewApi.ts'
import { getVisitorBasisOptions } from '../../tablebuilder/utils/visitorIdCoverage.ts'

interface CohortPreviewProps {
  websiteId: string | null
  root: CohortNode | null
  defaultExpanded?: boolean
  autoPreview?: boolean
  onInvalid?: () => void
}

const number = new Intl.NumberFormat('nb-NO')
const percent = new Intl.NumberFormat('nb-NO', { style: 'percent', maximumFractionDigits: 1 })

export function CohortPreview({
  websiteId,
  root,
  defaultExpanded = false,
  autoPreview = false,
  onInvalid,
}: CohortPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || autoPreview)
  const [period, setPeriod] = useState('last_7_days')
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [result, setResult] = useState<{ key: string; data: PreviewResult } | null>(null)
  const [request, setRequest] = useState<{ key: string; loading: boolean; error?: string } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const regionId = useId()
  const scope = JSON.stringify({ websiteId, period, startDate, endDate })
  const key = JSON.stringify({ scope, root })
  const current = result?.key === key ? result.data : null
  const coverage = current?.coverage
  const loading = request?.key === key && request.loading
  const error = request?.key === key ? request.error : undefined
  const basisLabel =
    !coverage || coverage.withDistinctId === 0
      ? 'Fingeravtrykk'
      : coverage.withDistinctId === coverage.total
        ? 'Cookie'
        : 'Cookie og fingeravtrykk'
  const basisDescription =
    getVisitorBasisOptions(coverage ?? null)?.find((option) => option.value === 'auto')?.description ??
    'Besøkende telles med fingeravtrykk. Samme person er unik innen en måned, og telles på nytt neste måned.'

  useEffect(
    () => () => {
      controllerRef.current?.abort()
      setRequest(null)
    },
    [key],
  )

  const run = async () => {
    setExpanded(true)
    if (!websiteId || !root) {
      onInvalid?.()
      setRequest({
        key,
        loading: false,
        error: !websiteId ? 'Velg et nettsted først.' : 'Fullfør kriteriene før du forhåndsviser gruppen.',
      })
      return
    }
    const range = getDateRangeFromPeriod(period, startDate, endDate)
    if (!range) {
      setRequest({ key, loading: false, error: 'Velg en gyldig periode.' })
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setRequest({ key, loading: true })
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
      setRequest({ key, loading: false, error: 'Det tok for lang tid å hente resultatet. Prøv en kortere periode.' })
    }, 60000)
    controller.signal.addEventListener('abort', () => window.clearTimeout(timeout), { once: true })
    try {
      const data = await fetchCohortPreview({ websiteId, root, ...range, basis: 'auto' }, controller.signal)
      if (!controller.signal.aborted) {
        setResult({ key, data })
        setRequest({ key, loading: false })
      }
    } catch {
      if (!controller.signal.aborted && !timedOut) {
        setRequest({
          key,
          loading: false,
          error: 'Kunne ikke forhåndsvise gruppen. Kontroller kriteriene og prøv igjen.',
        })
      }
    } finally {
      window.clearTimeout(timeout)
    }
  }

  const previewOnOpen = useEffectEvent(() => {
    void run()
  })

  useEffect(() => {
    if (autoPreview) previewOnOpen()
  }, [autoPreview])

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="tertiary"
        size="small"
        onClick={() => void run()}
        style={{ alignSelf: 'flex-start' }}
      >
        Forhåndsvis gruppe
      </Button>
    )
  }

  return (
    <VStack
      as="section"
      gap="space-16"
      aria-labelledby={regionId}
      style={{ borderTop: '1px solid var(--ax-border-neutral-subtle)', paddingTop: 'var(--ax-space-24)' }}
    >
      <HStack justify="space-between" align="center" gap="space-8">
        <Heading level="2" size="small" id={regionId}>
          Forhåndsvisning
        </Heading>
        {!defaultExpanded && (
          <Button
            type="button"
            variant="tertiary"
            size="small"
            icon={<ChevronUpIcon aria-hidden />}
            onClick={() => {
              controllerRef.current?.abort()
              setExpanded(false)
              setRequest(null)
            }}
          >
            Skjul
          </Button>
        )}
      </HStack>
      <HStack gap="space-12" align="end">
        <PeriodPicker
          period={period}
          onPeriodChange={setPeriod}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
        />
        <Button
          type="button"
          variant="secondary"
          size="small"
          icon={<ArrowCirclepathReverseIcon aria-hidden />}
          loading={loading}
          onClick={() => void run()}
        >
          {result ? 'Oppdater' : 'Forhåndsvis gruppe'}
        </Button>
      </HStack>
      <div role="status" aria-live="polite" className={loading ? undefined : 'sr-only'}>
        {loading && <BodyShort size="small">Henter resultat…</BodyShort>}
      </div>
      {error && (
        <Alert role="alert" variant="warning" size="small">
          {error}
        </Alert>
      )}
      {current && !loading && !error && (
        <VStack gap="space-8">
          <HStack gap="space-8" align="center" wrap={false}>
            <Heading level="3" size="medium">
              {number.format(current.users)} unike brukere
            </Heading>
            <HelpText title="Om tellemetoden i forhåndsvisningen">
              <BodyShort size="small" spacing>
                Tellemetode i forhåndsvisningen: {basisLabel}
              </BodyShort>
              <BodyShort size="small">{basisDescription}</BodyShort>
            </HelpText>
          </HStack>
          <BodyShort>
            {current.total > 0
              ? `${percent.format(current.users / current.total)} av nettstedets unike brukere i valgt periode.`
              : 'Ingen registrerte brukere i denne perioden.'}
          </BodyShort>
          {current.users === 0 && current.total > 0 && (
            <BodyShort>Ingen brukere passer til gruppen i denne perioden.</BodyShort>
          )}
        </VStack>
      )}
    </VStack>
  )
}
