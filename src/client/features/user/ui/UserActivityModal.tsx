import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Alert, BodyShort, Button, Heading, Loader, Modal, ReadMore, Table, Tag } from '@navikt/ds-react'
import {
  CheckmarkIcon,
  ExclamationmarkTriangleIcon,
  ExternalLinkIcon,
  MonitorIcon,
  PersonIcon,
} from '@navikt/aksel-icons'
import type { ActivityItem } from '../model'

interface UserActivityModalProps {
  open: boolean
  onClose: () => void
  activity: ActivityItem[]
  loading: boolean
  heading?: string
  details?: ReactNode
  notice?: ReactNode
  footer?: ReactNode
  error?: string | null
  onRetry?: () => void
  onOpenUrl?: (url: string) => void
  highlightedEventIds?: ReadonlySet<string>
}

function activityTime(value: string, precise: boolean) {
  const date = new Date(value)
  const time = date.toLocaleTimeString('nb-NO', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    ...(precise ? { second: '2-digit' } : {}),
  })
  return precise ? `${time},${String(date.getMilliseconds()).padStart(3, '0')}` : time
}

function propertyValues(item: ActivityItem, key: string) {
  return (item.properties ?? [])
    .filter((property) => property.key === key)
    .map((property) => property.value)
    .sort()
}

function possibleRageClicks(activity: ActivityItem[]) {
  const interactionNames = new Set([
    'navigere',
    'klikk',
    'click',
    'button click',
    'knapp klikket',
    'lenke klikket',
    'accordion åpnet',
    'accordion lukket',
  ])
  const targets = new Map<string, { time: number; lastTime: number; indices: number[] }[]>()
  const chronological = activity
    .map((item, index) => ({ item, index, time: Date.parse(item.createdAt) }))
    .sort((first, second) => first.time - second.time)
  for (const { item, index, time } of chronological) {
    if (
      item.type !== 'event' ||
      !interactionNames.has((item.name ?? '').toLowerCase()) ||
      !item.url ||
      !Number.isFinite(time) ||
      !item.properties ||
      (item.propertyCount ?? 0) > item.properties.length
    )
      continue
    const values = (keys: string[]) =>
      [
        ...new Set(
          (item.properties ?? [])
            .filter((property) => keys.includes(property.key.toLowerCase()))
            .map((property) => property.value.trim())
            .filter(Boolean),
        ),
      ].sort()
    const label = values(['lenketekst', 'tekst', 'label', 'tittel'])
    const destination = values(['destinasjon', 'url', 'href'])
    const component = values(['komponent', 'component', 'komponentid', 'elementid'])
    const section = values(['seksjon', 'section'])
    const hasNamedTarget = label.length > 0 || destination.some((value) => value !== '#')
    if (!hasNamedTarget && component.length === 0) continue
    const signature = JSON.stringify([
      item.url,
      item.name,
      label,
      destination,
      section,
      hasNamedTarget ? [] : component,
    ])
    const clicks = targets.get(signature) ?? []
    const previous = clicks[clicks.length - 1]
    if (previous && time - previous.lastTime <= 100) {
      previous.indices.push(index)
      previous.lastTime = time
    } else {
      clicks.push({ time, lastTime: time, indices: [index] })
    }
    targets.set(signature, clicks)
  }
  const matches = new Set<number>()
  for (const clicks of targets.values()) {
    for (let index = 2; index < clicks.length; index += 1) {
      if (clicks[index].time - clicks[index - 2].time <= 5000) {
        for (const click of clicks.slice(index - 1, index + 1)) {
          for (const eventIndex of click.indices) matches.add(eventIndex)
        }
      }
    }
  }
  return matches
}

export default function UserActivityModal({
  open,
  onClose,
  activity,
  loading,
  heading = 'Brukerdetaljer',
  details,
  notice,
  footer,
  error,
  onRetry,
  onOpenUrl,
  highlightedEventIds,
}: UserActivityModalProps) {
  const firstHighlight = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open && !loading) firstHighlight.current?.scrollIntoView?.({ block: 'center' })
  }, [open, loading, activity, highlightedEventIds])
  const firstHighlightedIndex = activity.findIndex((item) => item.id && highlightedEventIds?.has(item.id))
  const reference = activity[firstHighlightedIndex]
  const hasComparison = activity.filter((item) => item.id && highlightedEventIds?.has(item.id)).length > 1
  const profileComparison = highlightedEventIds === undefined
  const rageClicks = profileComparison ? possibleRageClicks(activity) : new Set<number>()
  const detailGroups = new Map<string, { number: number; count: number; incomplete: boolean }>()
  const groupKeys = activity.map((item) => {
    if (profileComparison ? !item.properties : !hasComparison || !item.id || !highlightedEventIds?.has(item.id))
      return null
    const properties = [...new Set((item.properties ?? []).map(({ key }) => key))]
      .sort()
      .map((key) => [key, propertyValues(item, key)])
    const signature = JSON.stringify(
      profileComparison ? [item.type, item.name ?? '', item.url ?? '', item.title ?? '', properties] : properties,
    )
    const group = detailGroups.get(signature) ?? { number: detailGroups.size + 1, count: 0, incomplete: false }
    group.count += 1
    group.incomplete ||= (item.propertyCount ?? 0) > (item.properties?.length ?? 0)
    detailGroups.set(signature, group)
    return signature
  })
  if (profileComparison) {
    detailGroups.clear()
    const previousEvents = new Map<string, { key: string; time: number }>()
    const chronologicalEvents = activity
      .map((item, index) => ({ item, index, time: Date.parse(item.createdAt) }))
      .sort((first, second) => first.time - second.time)
    for (const { item, index, time } of chronologicalEvents) {
      const signature = groupKeys[index]
      if (signature === null || !Number.isFinite(time) || (item.propertyCount ?? 0) > (item.properties?.length ?? 0)) {
        groupKeys[index] = null
        continue
      }
      const previous = previousEvents.get(signature)
      const key = previous && time - previous.time <= 100 ? previous.key : JSON.stringify([signature, index])
      const group = detailGroups.get(key) ?? { number: 0, count: 0, incomplete: false }
      group.count += 1
      detailGroups.set(key, group)
      groupKeys[index] = key
      previousEvents.set(signature, { key, time })
    }
    let number = 1
    for (const [signature, group] of detailGroups) {
      if (group.count < 2) detailGroups.delete(signature)
      else group.number = number++
    }
  }
  const groupColors = ['accent', 'success', 'warning', 'neutral'] as const

  return (
    <Modal open={open} onClose={onClose} header={{ heading, closeButton: true }} width="medium">
      <Modal.Body>
        <div className="space-y-6">
          {details}
          {notice}
          <div>
            <Heading level="3" size="small" className="mb-4">
              Aktivitetslogg
            </Heading>
            {!loading && !error && activity.length > 0 && (
              <div className="bg-[var(--ax-bg-neutral-soft)] p-4 rounded-lg mb-6 flex flex-wrap gap-8">
                {[
                  ['Sidevisninger', activity.filter((item) => item.type === 'pageview').length],
                  ['Hendelser', activity.filter((item) => item.type !== 'pageview').length],
                  ['Totalt', activity.length],
                ].map(([label, count]) => (
                  <div key={label}>
                    <span className="block text-sm font-medium mb-1">{label}</span>
                    <span className="font-bold text-2xl">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {loading ? (
              <div className="flex justify-center p-4">
                <Loader title="Henter aktivitetslogg" />
              </div>
            ) : error ? (
              <div className="space-y-3">
                <Alert variant="error" role="alert">
                  {error}
                </Alert>
                {onRetry && (
                  <Button size="small" variant="secondary" onClick={onRetry}>
                    Prøv igjen
                  </Button>
                )}
              </div>
            ) : activity.length === 0 ? (
              <BodyShort>Ingen aktivitet funnet i dette utvalget.</BodyShort>
            ) : (
              <div className="relative border-l border-[var(--ax-border-neutral-subtle)] ml-3 space-y-8">
                {activity.map((item, index) => {
                  const highlighted = Boolean(item.id && highlightedEventIds?.has(item.id))
                  const possibleRage = rageClicks.has(index)
                  const compare = highlighted && hasComparison && index !== firstHighlightedIndex
                  const differences = compare
                    ? [...new Set([...(reference.properties ?? []), ...(item.properties ?? [])].map(({ key }) => key))]
                        .sort()
                        .filter(
                          (key) =>
                            JSON.stringify(propertyValues(reference, key)) !==
                            JSON.stringify(propertyValues(item, key)),
                        )
                    : []
                  const incomplete =
                    compare &&
                    [reference, item].some((event) => (event.propertyCount ?? 0) > (event.properties?.length ?? 0))
                  const groupKey = groupKeys[index]
                  const group = groupKey === null ? undefined : detailGroups.get(groupKey)
                  const groupColor = group
                    ? profileComparison
                      ? 'warning'
                      : groupColors[(group.number - 1) % groupColors.length]
                    : undefined
                  return (
                    <div
                      key={item.id ?? index}
                      ref={index === firstHighlightedIndex ? firstHighlight : undefined}
                      data-highlighted={highlighted || undefined}
                      data-detail-group={group?.number}
                      style={
                        groupColor || possibleRage
                          ? { borderLeft: `4px solid var(--ax-border-${groupColor ?? 'warning'})` }
                          : undefined
                      }
                      className={`ml-8 relative ${highlighted ? 'rounded-lg bg-[var(--ax-bg-accent-soft)] p-3 ring-1 ring-[var(--ax-border-accent)]' : group || possibleRage ? 'pl-3' : ''}`}
                    >
                      <span className="absolute flex items-center justify-center w-8 h-8 bg-[var(--ax-bg-accent-soft)] rounded-full -left-[49px] ring-4 ring-[var(--ax-bg-default)]">
                        {item.type === 'pageview' ? (
                          <MonitorIcon fontSize="1.125rem" className="text-[var(--ax-text-accent)]" />
                        ) : (
                          <PersonIcon fontSize="1.125rem" className="text-[var(--ax-text-success)]" />
                        )}
                      </span>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-[var(--ax-text-subtle)]">
                            {activityTime(
                              item.createdAt,
                              Boolean(highlightedEventIds) || Boolean(group) || possibleRage,
                            )}
                          </span>
                          {highlighted && (
                            <Tag size="small" variant="info">
                              Inngår i funnet
                            </Tag>
                          )}
                          {possibleRage && (
                            <Tag
                              size="small"
                              variant="moderate"
                              data-color="warning"
                              icon={<ExclamationmarkTriangleIcon aria-hidden />}
                              title="Minst tre registrerte klikk på samme mål innen fem sekunder. Registreringer innen 100 ms telles som ett klikk. Merket viser gjentakelser etter første klikk, ikke hvorfor brukeren klikket flere ganger."
                            >
                              Gjentatte klikk
                            </Tag>
                          )}
                          {group && (
                            <Tag
                              size="small"
                              variant="moderate"
                              data-color={groupColor}
                              icon={
                                profileComparison ? (
                                  <ExclamationmarkTriangleIcon aria-hidden />
                                ) : group.count > 1 ? (
                                  <CheckmarkIcon aria-hidden />
                                ) : undefined
                              }
                              title={
                                group.incomplete
                                  ? 'Bare viste hendelsesdetaljer er sammenlignet. Noen detaljer er utelatt.'
                                  : profileComparison
                                    ? `${group.count} like registreringer med maksimalt 100 ms mellom hver. Dette kan skyldes dobbelsporing, men loggen alene fastslår ikke årsaken.`
                                    : detailGroups.size === 1
                                      ? 'Alle markerte hendelser i denne loggen har identiske hendelsesdetaljer.'
                                      : `Hendelser med merket «Gruppe ${group.number}» har identiske hendelsesdetaljer.`
                              }
                            >
                              {profileComparison
                                ? 'Nesten samtidige registreringer'
                                : detailGroups.size === 1
                                  ? `Alle ${group.count} har samme ${group.incomplete ? 'viste detaljer' : 'detaljer'}`
                                  : `Gruppe ${group.number} · ${group.count > 1 ? `${group.count} med samme ${group.incomplete ? 'viste detaljer' : 'detaljer'}` : group.incomplete ? 'egne viste detaljer' : 'egne detaljer'}`}
                            </Tag>
                          )}
                          {compare && differences.length > 0 && (
                            <Tag
                              size="small"
                              variant="outline"
                              data-color="warning"
                              icon={<ExclamationmarkTriangleIcon aria-hidden />}
                              title="Forskjeller fra første markerte hendelse."
                            >
                              {differences.length} {differences.length === 1 ? 'forskjell' : 'forskjeller'}
                            </Tag>
                          )}
                        </div>
                        <h4 className="text-lg font-medium">
                          {' '}
                          {item.type === 'pageview' ? 'Sidevisning' : item.name || 'Ukjent hendelse'}
                        </h4>
                        <p className="break-words">{item.title || item.url}</p>
                        {item.url &&
                          (onOpenUrl ? (
                            <button
                              type="button"
                              className="text-sm text-[var(--ax-text-accent)] hover:underline mt-1 p-1.5 rounded w-fit flex items-center gap-1"
                              onClick={() => {
                                if (item.url) onOpenUrl(item.url)
                              }}
                            >
                              <code className="break-all text-left">{item.url}</code>
                              <ExternalLinkIcon aria-hidden fontSize="1rem" />
                            </button>
                          ) : (
                            <code className="text-sm text-[var(--ax-text-subtle)] break-all">{item.url}</code>
                          ))}
                        {compare && differences.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {differences.length > 0 && (
                              <Table
                                size="small"
                                className="table-fixed w-full"
                                aria-label="Forskjeller i hendelsesdetaljer"
                              >
                                <Table.Header>
                                  <Table.Row>
                                    <Table.HeaderCell scope="col">Egenskap</Table.HeaderCell>
                                    <Table.HeaderCell scope="col">Første markerte</Table.HeaderCell>
                                    <Table.HeaderCell scope="col">Denne</Table.HeaderCell>
                                  </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                  {differences.map((key) => (
                                    <Table.Row key={key}>
                                      <Table.HeaderCell scope="row" className="break-all">
                                        {key}
                                      </Table.HeaderCell>
                                      {[reference, item].map((event, eventIndex) => (
                                        <Table.DataCell key={eventIndex} className="break-all whitespace-pre-wrap">
                                          {propertyValues(event, key).join('\n') ||
                                            (propertyValues(event, key).length ? '(tom verdi)' : 'Ikke oppgitt')}
                                        </Table.DataCell>
                                      ))}
                                    </Table.Row>
                                  ))}
                                </Table.Body>
                              </Table>
                            )}
                          </div>
                        )}
                        {item.properties && item.properties.length > 0 && (
                          <ReadMore size="small" header="Hendelsesdetaljer">
                            <Table size="small" className="table-fixed w-full">
                              <Table.Header>
                                <Table.Row>
                                  <Table.HeaderCell scope="col">Egenskap</Table.HeaderCell>
                                  <Table.HeaderCell scope="col">Verdi</Table.HeaderCell>
                                </Table.Row>
                              </Table.Header>
                              <Table.Body>
                                {item.properties.map((property, propertyIndex) => (
                                  <Table.Row key={propertyIndex}>
                                    <Table.HeaderCell scope="row" className="break-all">
                                      {property.key}
                                    </Table.HeaderCell>
                                    <Table.DataCell className="break-all whitespace-pre-wrap">
                                      {property.value}
                                    </Table.DataCell>
                                  </Table.Row>
                                ))}
                              </Table.Body>
                            </Table>
                            {item.propertyCount && item.propertyCount > item.properties.length ? (
                              <BodyShort size="small">
                                Viser de første {item.properties.length} av {item.propertyCount} egenskaper.
                              </BodyShort>
                            ) : null}
                            {incomplete && (
                              <BodyShort size="small">
                                Noen detaljer er utelatt. Bare viste detaljer er sammenlignet.
                              </BodyShort>
                            )}
                          </ReadMore>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {footer}
        </div>
      </Modal.Body>
    </Modal>
  )
}
