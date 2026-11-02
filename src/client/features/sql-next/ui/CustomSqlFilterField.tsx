import { useEffect, useState } from 'react'
import { Alert, Button, TextField, UNSAFE_Combobox } from '@navikt/ds-react'
import type { CustomSqlFilter } from '../../sql/utils/customSqlFilters'

interface Props {
  filter: CustomSqlFilter
  value: string
  onChange: (value: string) => void
  websiteIds: string[]
  dateRange: { from: Date | undefined; to: Date | undefined }
}

export default function CustomSqlFilterField({ filter, value, onChange, websiteIds, dateRange }: Props) {
  const [search, setSearch] = useState('')
  const [activated, setActivated] = useState(false)
  const [result, setResult] = useState<{ key: string; events: string[]; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const websiteKey = [...new Set(websiteIds)].sort().join(',')
  const from = dateRange.from?.getTime()
  const to = dateRange.to?.getTime()
  const needsEvents = filter.source === 'event_name' && !filter.options
  const requestKey = JSON.stringify([websiteKey, from, to, retry])
  const canLoad = Boolean(
    needsEvents &&
    activated &&
    websiteKey &&
    from !== undefined &&
    to !== undefined &&
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    from <= to,
  )
  const currentResult = canLoad && result?.key === requestKey ? result : null
  const events = currentResult?.events ?? []
  const error = currentResult?.error
  const loading = canLoad && !currentResult

  useEffect(() => {
    if (!canLoad) return
    const controller = new AbortController()
    const params = new URLSearchParams({ startAt: String(from), endAt: String(to) })
    void Promise.all(
      websiteKey.split(',').map(async (id) => {
        const response = await fetch(`/api/bigquery/websites/${encodeURIComponent(id)}/events?${params}`, {
          signal: controller.signal,
        })
        const data: unknown = await response.json()
        if (!response.ok) {
          throw new Error(
            data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
              ? data.error
              : 'Kunne ikke hente hendelser.',
          )
        }
        if (!data || typeof data !== 'object' || !('events' in data) || !Array.isArray(data.events)) {
          throw new Error('Ugyldig svar ved henting av hendelser.')
        }
        return data.events.map((event: unknown) => {
          if (!event || typeof event !== 'object' || !('name' in event) || typeof event.name !== 'string') {
            throw new Error('Ugyldig hendelsesnavn i svaret.')
          }
          return event.name
        })
      }),
    )
      .then((results) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, events: [...new Set(results.flat().filter(Boolean))].sort() })
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            key: requestKey,
            events: [],
            error: cause instanceof Error ? cause.message : 'Kunne ikke hente forslag.',
          })
        }
      })
    return () => controller.abort()
  }, [canLoad, requestKey, websiteKey, from, to])

  const hasSuggestions = filter.options !== undefined || needsEvents

  return (
    <div
      className="min-w-[220px] max-w-sm focus-within:relative focus-within:z-10"
      onKeyDownCapture={(event) => {
        if (
          hasSuggestions &&
          event.key === 'Backspace' &&
          event.target instanceof HTMLInputElement &&
          value &&
          !search
        ) {
          event.preventDefault()
          onChange('')
        }
      }}
    >
      {hasSuggestions ? (
        <>
          <UNSAFE_Combobox
            label={filter.label}
            size="small"
            options={filter.options ?? events}
            selectedOptions={value ? [value] : []}
            value={search}
            onChange={setSearch}
            onToggleSelected={(option, selected) => onChange(selected ? option : '')}
            onFocus={() => setActivated(true)}
            isLoading={loading}
            allowNewValues
            error={filter.error}
          />
          {needsEvents && !websiteKey && <p className="text-sm mt-1">Velg en nettside for å hente forslag.</p>}
          {error && (
            <Alert variant="warning" size="small" className="mt-2">
              Forslag kunne ikke lastes: {error} Du kan fortsatt skrive en verdi manuelt.
              <Button
                type="button"
                size="small"
                variant="tertiary"
                onClick={() => setRetry((previous) => previous + 1)}
              >
                Prøv igjen
              </Button>
            </Alert>
          )}
        </>
      ) : (
        <TextField
          label={filter.label}
          size="small"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          error={filter.error}
        />
      )}
    </div>
  )
}
