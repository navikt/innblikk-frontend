import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Alert, BodyShort, Button, Link, Table, Tag, VStack } from '@navikt/ds-react'
import { ChevronRightIcon } from '@navikt/aksel-icons'
import UserActivityModal from '../../user/ui/UserActivityModal'
import { parseRepetitionActivity, signalLabels } from '../model/repetition'
import type { RepetitionActivity, RepetitionExample, RepetitionFinding } from '../model/repetition'

export default function EpisodeActivity({
  example,
  finding,
  search,
}: {
  example: RepetitionExample
  finding: RepetitionFinding
  search: string
}) {
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState<RepetitionActivity | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const websiteId = new URLSearchParams(search).get('websiteId')
  useEffect(() => () => controller.current?.abort(), [])

  const load = async () => {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/bigquery/repetition/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: request.signal,
        body: JSON.stringify({
          websiteId,
          sessionId: example.sessionId,
          visitId: example.visitId,
          startedAt: example.startedAt,
          endedAt: example.endedAt,
          highlightedEventIds: example.eventIds,
        }),
      })
      if (!response.ok) throw new Error(`Kunne ikke hente aktivitetsloggen (HTTP ${response.status}). Prøv igjen.`)
      const parsed = parseRepetitionActivity(await response.json())
      if (!request.signal.aborted) setActivity(parsed)
    } catch (error) {
      if (!request.signal.aborted) {
        console.error('Repetition activity failed:', error)
        setError(error instanceof Error ? error.message : 'Kunne ikke hente aktivitetsloggen.')
      }
    } finally {
      if (!request.signal.aborted) setLoading(false)
    }
  }

  const events = useMemo(
    () =>
      activity?.events.map((event) => ({
        id: event.id,
        type: event.eventType === 1 ? 'pageview' : 'event',
        name: event.eventName,
        title: event.title,
        url: event.path,
        createdAt: event.createdAt,
        properties: event.properties,
        propertyCount: event.propertyCount,
      })) ?? [],
    [activity],
  )
  const highlightedIds = useMemo(
    () => new Set(activity?.events.filter((event) => event.highlighted).map((event) => event.id)),
    [activity],
  )
  const profileParams = new URLSearchParams(search)
  profileParams.delete('urlPath')
  profileParams.delete('pathOperator')
  profileParams.set('query', example.sessionId)
  const unit = finding.signal === 'pageviews' ? 'sidevisninger' : 'hendelser'
  const duration = example.durationSeconds.toLocaleString('nb-NO', { maximumFractionDigits: 3 })
  const label = example.kind === 'largest' ? 'Flest gjentakelser' : 'Nyeste'
  const timestamp = new Date(example.startedAt).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })

  return (
    <Table.Row
      className={websiteId ? 'cursor-pointer hover:bg-[var(--ax-bg-neutral-soft)]' : undefined}
      onClick={() => {
        if (websiteId) {
          setOpen(true)
          if (!activity && !loading) void load()
        }
      }}
    >
      <Table.HeaderCell scope="row" className="whitespace-nowrap">
        <span className="font-normal tabular-nums">{timestamp}</span>
      </Table.HeaderCell>
      <Table.DataCell className="whitespace-nowrap">
        <Tag size="small" variant="moderate" data-color="neutral">
          {label}
        </Tag>
      </Table.DataCell>
      <Table.DataCell className="whitespace-nowrap">
        <Button
          size="small"
          variant="tertiary"
          disabled={!websiteId}
          icon={<ChevronRightIcon aria-hidden />}
          iconPosition="right"
          aria-label={`${label}, ${example.eventCount} ${unit}, ${timestamp}: Åpne logg`}
        >
          Åpne logg
        </Button>
        {createPortal(
          <div onClick={(event) => event.stopPropagation()}>
            <UserActivityModal
              open={open}
              onClose={() => {
                setOpen(false)
                controller.current?.abort()
                setLoading(false)
              }}
              heading={signalLabels[finding.signal]}
              activity={events}
              loading={loading}
              error={error}
              onRetry={() => void load()}
              highlightedEventIds={highlightedIds}
              notice={
                <VStack gap="space-12">
                  <BodyShort weight="semibold">
                    {finding.eventName || 'Sidevisning'}
                    {finding.target ? ` · ${finding.target}` : ''}
                  </BodyShort>
                  <BodyShort size="small">
                    Bare markerte hendelser inngår i funnet. Andre sider og hendelser vises som kontekst i samme besøk,
                    ikke som gjentakelser.
                  </BodyShort>
                  {activity?.isGeneratedData && (
                    <Alert variant="info">Aktivitetsloggen viser genererte eksempeldata.</Alert>
                  )}
                  {activity && activity.omittedEvents > 0 && (
                    <Alert variant="info">
                      {activity.omittedEvents} hendelser er utelatt på grunn av visningsgrensen. Loggen er ikke
                      komplett.
                    </Alert>
                  )}
                  {activity && highlightedIds.size === 0 && (
                    <Alert variant="warning">
                      Hendelsene som utløste funnet finnes ikke lenger i dette utvalget. Kjør analysen på nytt.
                    </Alert>
                  )}
                </VStack>
              }
              footer={
                <Link href={`/brukerprofiler?${profileParams.toString()}`}>Finn denne besøkende i Enkeltbrukere</Link>
              }
            />
          </div>,
          document.body,
        )}
      </Table.DataCell>
      <Table.DataCell align="right" className="whitespace-nowrap">
        {example.eventCount} {unit}
      </Table.DataCell>
      <Table.DataCell align="right" className="whitespace-nowrap">
        {duration} s
      </Table.DataCell>
      <Table.DataCell className="whitespace-nowrap">
        {example.device || 'Ukjent enhet'}
        {example.browser ? ` · ${example.browser}` : ''}
      </Table.DataCell>
    </Table.Row>
  )
}
