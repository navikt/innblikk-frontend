import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, BodyShort, Box, Button, Dialog, Heading, HStack, Loader, Table, VStack } from '@navikt/ds-react'
import { ArchiveIcon, PencilIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { BetaFeatureNotice, BetaFeedbackLine } from '../../../shared/ui/BetaFeatureNotice.tsx'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import type { Website } from '../../../shared/types/website.ts'
import { deleteCohort, getCohort, listCohorts } from '../../cohortmanager/api/cohortManagerApi.ts'
import type { CohortDetailDto, CohortDto } from '../../cohortmanager/model/types.ts'
import { describeTreeInline } from '../utils/describe.ts'
import { WebsiteSelect } from './WebsiteSelect.tsx'
import { TrashDialog } from './TrashDialog.tsx'

export default function CohortManagerNext() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const websiteIdParam = searchParams.get('websiteId')

  const [websites, setWebsites] = useState<Website[]>([])
  const [websitesLoading, setWebsitesLoading] = useState(true)
  const [cohorts, setCohorts] = useState<CohortDto[]>([])
  const [details, setDetails] = useState<CohortDetailDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CohortDto | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)

  const selectWebsite = useCallback(
    (id: string | null) => setSearchParams(id ? { websiteId: id } : {}, { replace: true }),
    [setSearchParams],
  )

  useEffect(() => {
    fetchWebsites()
      .then((data) => {
        setWebsites(data)
        if (!websiteIdParam && data.length > 0) selectWebsite(data[0].id)
      })
      .catch(() => {})
      .finally(() => setWebsitesLoading(false))
    // Only the initial load picks a default site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async (websiteId: string) => {
    setLoading(true)
    setError(null)
    try {
      const list = await listCohorts(websiteId)
      setCohorts(list)
      setDetails(await Promise.all(list.map((c) => getCohort(c.id))))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste brukergrupper')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (websiteIdParam) void load(websiteIdParam)
  }, [websiteIdParam, load])

  const handleDelete = async () => {
    if (!deleteTarget || !websiteIdParam) return
    setDeleting(true)
    try {
      await deleteCohort(deleteTarget.id)
      setDeleteTarget(null)
      await load(websiteIdParam)
    } finally {
      setDeleting(false)
    }
  }

  const names = Object.fromEntries(details.map((c) => [String(c.id), c.name]))
  const newHref = `/brukergrupper-next/ny?websiteId=${encodeURIComponent(websiteIdParam ?? '')}`

  return (
    <>
      <PageHeader
        title="Brukergrupper"
        description="Samle brukere som har gjort noe bestemt på nettstedet ditt, og bruk gruppen i grafene dine."
        beta
      />

      <AppBlock className="pb-16">
        <BetaFeatureNotice id="brukergrupper-next" title="Brukergrupper er i beta" className="mb-4">
          Brukergrupper er under utvikling, og funksjonalitet kan endre seg.
          <BetaFeedbackLine />
        </BetaFeatureNotice>

        <VStack gap="space-24">
          {websitesLoading ? (
            <Loader title="Laster nettsteder…" />
          ) : (
            <WebsiteSelect websites={websites} selectedId={websiteIdParam} onSelect={selectWebsite} />
          )}

          {websiteIdParam && (
            <VStack gap="space-16">
              <HStack justify="space-between" align="center" wrap gap="space-12">
                <Heading level="2" size="medium">
                  Brukergrupper
                </Heading>
                <HStack gap="space-8">
                  <Button variant="tertiary" icon={<ArchiveIcon aria-hidden />} onClick={() => setTrashOpen(true)}>
                    Papirkurv
                  </Button>
                  {cohorts.length > 0 && (
                    <Button as={Link} to={newHref} icon={<PlusIcon aria-hidden />}>
                      Ny brukergruppe
                    </Button>
                  )}
                </HStack>
              </HStack>

              {loading && <Loader title="Laster brukergrupper…" />}
              {error && <Alert variant="error">{error}</Alert>}

              {!loading && !error && cohorts.length === 0 && (
                <Box background="neutral-soft" borderRadius="8" padding="space-32" style={{ maxWidth: '32rem' }}>
                  <VStack gap="space-16" align="start">
                    <VStack gap="space-4">
                      <Heading level="3" size="small">
                        Ingen brukergrupper ennå
                      </Heading>
                      <BodyShort>Lag den første, og bruk den i grafene dine.</BodyShort>
                    </VStack>
                    <Button as={Link} to={newHref} icon={<PlusIcon aria-hidden />}>
                      Ny brukergruppe
                    </Button>
                  </VStack>
                </Box>
              )}

              {!loading && cohorts.length > 0 && (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell scope="col">Navn</Table.HeaderCell>
                      <Table.HeaderCell scope="col">Hvem er med?</Table.HeaderCell>
                      <Table.HeaderCell scope="col">
                        <span className="sr-only">Handlinger</span>
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {cohorts.map((cohort) => {
                      const detail = details.find((d) => d.id === cohort.id)
                      return (
                        <Table.Row key={cohort.id}>
                          <Table.DataCell style={{ verticalAlign: 'top' }}>
                            <BodyShort weight="semibold">{cohort.name}</BodyShort>
                            {cohort.description && <BodyShort textColor="subtle">{cohort.description}</BodyShort>}
                          </Table.DataCell>
                          <Table.DataCell style={{ maxWidth: 560 }}>
                            <BodyShort>{detail ? describeTreeInline(detail.root, names) : '…'}</BodyShort>
                          </Table.DataCell>
                          <Table.DataCell style={{ verticalAlign: 'top' }}>
                            <HStack gap="space-8" justify="end" wrap={false}>
                              <Button
                                size="small"
                                variant="secondary"
                                icon={<PencilIcon aria-hidden />}
                                onClick={() => navigate(`/brukergrupper-next/${cohort.id}`)}
                              >
                                Rediger
                              </Button>
                              <Button
                                size="small"
                                variant="tertiary"
                                data-color="danger"
                                icon={<TrashIcon aria-hidden />}
                                onClick={() => setDeleteTarget(cohort)}
                              >
                                Slett
                              </Button>
                            </HStack>
                          </Table.DataCell>
                        </Table.Row>
                      )
                    })}
                  </Table.Body>
                </Table>
              )}
            </VStack>
          )}
        </VStack>
      </AppBlock>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <Dialog.Popup width="small" role="alertdialog">
          <Dialog.Header withClosebutton={false}>
            <Dialog.Title>Slette «{deleteTarget?.name}»?</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <BodyShort>
              Brukergruppen flyttes til papirkurven, og du kan gjenopprette den derfra. Andre brukergrupper som bruker
              denne mister referansen.
            </BodyShort>
          </Dialog.Body>
          <Dialog.Footer>
            <Button data-color="danger" loading={deleting} onClick={() => void handleDelete()}>
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

      {websiteIdParam && (
        <TrashDialog
          websiteId={websiteIdParam}
          open={trashOpen}
          onOpenChange={setTrashOpen}
          onRestored={() => void load(websiteIdParam)}
        />
      )}
    </>
  )
}
