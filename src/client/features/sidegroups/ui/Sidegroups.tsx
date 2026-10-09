import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, BodyShort, Button, Dialog, HStack, Heading, Loader, Table, VStack } from '@navikt/ds-react'
import { PencilIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import type { Website } from '../../../shared/types/website.ts'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { BetaFeatureNotice, BetaFeedbackLine } from '../../../shared/ui/BetaFeatureNotice.tsx'
import { WebsiteSelect } from '../../../shared/ui/WebsiteSelect.tsx'
import { deleteSidegroup, listSidegroups } from '../api/sidegroupsApi.ts'
import { sidegroupMatchFields, type Sidegroup } from '../model/types.ts'

export default function Sidegroups() {
  const [searchParams] = useSearchParams()
  const requestedWebsiteId = searchParams.get('websiteId')
  const [sidegroups, setSidegroups] = useState<Sidegroup[]>([])
  const [expandedSidegroups, setExpandedSidegroups] = useState<Set<string>>(() => new Set())
  const [websites, setWebsites] = useState<Website[]>([])
  const [websitesLoading, setWebsitesLoading] = useState(true)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Sidegroup | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadSidegroups = async () => {
    setLoading(true)
    setError(null)
    try {
      setSidegroups(await listSidegroups())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste sidegrupper')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSidegroups()
    fetchWebsites()
      .then((data) => {
        setWebsites(data)
        setSelectedWebsiteId(data.find((website) => website.id === requestedWebsiteId)?.id ?? data[0]?.id ?? null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Kunne ikke laste nettsteder'))
      .finally(() => setWebsitesLoading(false))
  }, [requestedWebsiteId])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await deleteSidegroup(deleteTarget.id)
      setDeleteTarget(null)
      await loadSidegroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke slette sidegruppen')
    } finally {
      setDeleting(false)
    }
  }

  const visibleSidegroups = selectedWebsiteId
    ? sidegroups.filter((sidegroup) => sidegroup.websiteId === selectedWebsiteId)
    : []
  const newHref = `/sidegrupper/ny?websiteId=${encodeURIComponent(selectedWebsiteId ?? '')}`

  return (
    <>
      <PageHeader title="Sidegrupper" description="Administrer alle grupper på nettstedet ditt" beta />
      <AppBlock className="pb-16">
        {/* Dismissable beta notice — registry id in shared/lib/betaFeatures.ts */}
        <BetaFeatureNotice id="sidegrupper" title="Sidegrupper er i beta" className="mb-4">
          Sidegrupper er under utvikling, og funksjonalitet kan endre seg.
          <BetaFeedbackLine />
        </BetaFeatureNotice>

        <VStack gap="space-16">
          {websitesLoading ? (
            <Loader size="small" title="Laster nettsteder…" />
          ) : (
            <WebsiteSelect websites={websites} selectedId={selectedWebsiteId} onSelect={setSelectedWebsiteId} />
          )}
          <HStack justify="space-between" align="center">
            <Heading size="small" level="2">
              Sidegrupper
            </Heading>
            {selectedWebsiteId ? (
              <Button as={Link} to={newHref} size="small" variant="secondary" icon={<PlusIcon aria-hidden />}>
                Ny sidegruppe
              </Button>
            ) : (
              <Button size="small" variant="secondary" icon={<PlusIcon aria-hidden />} disabled>
                Ny sidegruppe
              </Button>
            )}
          </HStack>
          {error && <Alert variant="error">{error}</Alert>}
          {loading || websitesLoading ? (
            <Loader size="medium" title="Laster sidegrupper…" />
          ) : !selectedWebsiteId ? (
            <Alert variant="info" inline>
              {websites.length === 0 ? 'Ingen nettsteder tilgjengelig.' : 'Velg et nettsted for å se sidegrupper.'}
            </Alert>
          ) : visibleSidegroups.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <Alert variant="info" inline>
                Ingen sidegrupper for dette nettstedet.
              </Alert>
              <Button as={Link} to={newHref} size="small" variant="secondary" icon={<PlusIcon aria-hidden />}>
                Ny sidegruppe
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table size="small">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell scope="col" />
                    <Table.HeaderCell>Navn</Table.HeaderCell>
                    <Table.HeaderCell>URL-vilkår</Table.HeaderCell>
                    <Table.HeaderCell />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {visibleSidegroups.map((sidegroup) => {
                    const conditions = sidegroupMatchFields.flatMap((field) =>
                      (sidegroup[field.key] ?? []).map((pattern, index) => ({
                        key: `${field.key}-${index}-${pattern}`,
                        label: field.label,
                        pattern,
                      })),
                    )
                    const isExpanded = expandedSidegroups.has(sidegroup.id)
                    return (
                      <Table.ExpandableRow
                        key={sidegroup.id}
                        open={isExpanded}
                        onOpenChange={(open) =>
                          setExpandedSidegroups((current) => {
                            const next = new Set(current)
                            if (open) next.add(sidegroup.id)
                            else next.delete(sidegroup.id)
                            return next
                          })
                        }
                        expansionDisabled={conditions.length === 0}
                        content={
                          <div id={`sidegroup-conditions-${sidegroup.id}`}>
                            {conditions.length === 0 ? (
                              <BodyShort size="small">Ingen URL-vilkår.</BodyShort>
                            ) : (
                              <div style={{ maxWidth: '640px', overflowX: 'auto' }}>
                                <Table size="small">
                                  <Table.Header>
                                    <Table.Row>
                                      <Table.HeaderCell>Samsvar</Table.HeaderCell>
                                      <Table.HeaderCell>URL-sti</Table.HeaderCell>
                                    </Table.Row>
                                  </Table.Header>
                                  <Table.Body>
                                    {conditions.map((condition) => (
                                      <Table.Row key={condition.key}>
                                        <Table.DataCell>{condition.label}</Table.DataCell>
                                        <Table.DataCell>{condition.pattern}</Table.DataCell>
                                      </Table.Row>
                                    ))}
                                  </Table.Body>
                                </Table>
                              </div>
                            )}
                          </div>
                        }
                      >
                        <Table.HeaderCell scope="row">{sidegroup.name}</Table.HeaderCell>
                        <Table.DataCell>
                          <div className="flex items-center gap-2">
                            <span>{conditions.length}</span>
                            {conditions.length > 0 && (
                              <Button
                                type="button"
                                size="xsmall"
                                variant="secondary"
                                aria-expanded={isExpanded}
                                aria-controls={`sidegroup-conditions-${sidegroup.id}`}
                                onClick={() => {
                                  setExpandedSidegroups((current) => {
                                    const next = new Set(current)
                                    if (isExpanded) next.delete(sidegroup.id)
                                    else next.add(sidegroup.id)
                                    return next
                                  })
                                }}
                              >
                                {isExpanded ? 'Skjul' : 'Vis'}
                              </Button>
                            )}
                          </div>
                        </Table.DataCell>
                        <Table.DataCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              as={Link}
                              to={`/sidegrupper/${encodeURIComponent(sidegroup.id)}`}
                              size="xsmall"
                              variant="secondary"
                              icon={<PencilIcon aria-hidden />}
                            >
                              Rediger
                            </Button>
                            <Button
                              size="xsmall"
                              variant="secondary"
                              data-color="danger"
                              icon={<TrashIcon aria-hidden />}
                              onClick={() => setDeleteTarget(sidegroup)}
                            >
                              Slett
                            </Button>
                          </div>
                        </Table.DataCell>
                      </Table.ExpandableRow>
                    )
                  })}
                </Table.Body>
              </Table>
            </div>
          )}
        </VStack>
      </AppBlock>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <Dialog.Popup width="small" role="alertdialog">
          <Dialog.Header>
            <Dialog.Title>Slett «{deleteTarget?.name}»?</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <BodyShort>Sidegruppen blir slettet permanent.</BodyShort>
          </Dialog.Body>
          <Dialog.Footer>
            <Button data-color="danger" onClick={() => void handleDelete()} loading={deleting}>
              Slett
            </Button>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary">
                Avbryt
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>
    </>
  )
}
