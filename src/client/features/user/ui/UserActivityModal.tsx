import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Alert, BodyShort, Button, Heading, Loader, Modal, ReadMore, Table, Tag } from '@navikt/ds-react'
import { ExternalLinkIcon, MonitorIcon, PersonIcon } from '@navikt/aksel-icons'
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
                  return (
                    <div
                      key={item.id ?? index}
                      ref={index === firstHighlightedIndex ? firstHighlight : undefined}
                      data-highlighted={highlighted || undefined}
                      className={`ml-8 relative ${highlighted ? 'rounded-lg bg-[var(--ax-bg-accent-soft)] p-3 ring-1 ring-[var(--ax-border-accent)]' : ''}`}
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
                            {activityTime(item.createdAt, Boolean(highlightedEventIds))}
                          </span>
                          {highlighted && (
                            <Tag size="small" variant="info">
                              Inngår i funnet
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
