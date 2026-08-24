import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Dialog, Heading, Loader, Alert, Table, VStack, HStack, BodyShort } from '@navikt/ds-react'
import { PlusIcon, TrashIcon, PencilIcon, ArchiveIcon, ArrowUndoIcon } from '@navikt/aksel-icons'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import type { Website } from '../../../shared/types/website.ts'
import {
  listCohorts,
  getCohort,
  deleteCohort,
  listTrashedCohorts,
  restoreCohort,
  permanentlyDeleteCohort,
} from '../api/cohortManagerApi.ts'
import type { CohortDto, CohortDetailDto } from '../model/types.ts'
import { CohortEditor, CohortSummaryTag, queryToHuman, cohortToQuery } from './CohortEditor.tsx'
import { UNSAFE_Combobox } from '@navikt/ds-react'

export default function CohortManager() {
  const [searchParams] = useSearchParams()
  const preselectedWebsiteId = searchParams.get('websiteId')

  const [websites, setWebsites] = useState<Website[]>([])
  const [websitesLoading, setWebsitesLoading] = useState(true)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(preselectedWebsiteId)

  const [cohorts, setCohorts] = useState<CohortDto[]>([])
  const [allDetails, setAllDetails] = useState<CohortDetailDto[]>([])
  const [cohortsLoading, setCohortsLoading] = useState(false)
  const [cohortsError, setCohortsError] = useState<string | null>(null)

  // Unified create/edit dialog — null = closed, 'new' = create, otherwise the cohort being edited
  const [editorTarget, setEditorTarget] = useState<CohortDetailDto | 'new' | null>(null)
  const [editorLoading, setEditorLoading] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<CohortDto | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Trash / archive
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashCohorts, setTrashCohorts] = useState<CohortDto[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashError, setTrashError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [permDeleteTarget, setPermDeleteTarget] = useState<CohortDto | null>(null)
  const [permDeleting, setPermDeleting] = useState(false)

  useEffect(() => {
    fetchWebsites()
      .then((data) => {
        setWebsites(data)
        // Only fall back to first website if nothing was preselected from URL
        if (!preselectedWebsiteId && data.length > 0) setSelectedWebsiteId(data[0].id)
      })
      .catch(() => {})
      .finally(() => setWebsitesLoading(false))
  }, [preselectedWebsiteId])

  const loadCohorts = useCallback(async (websiteId: string) => {
    setCohortsLoading(true)
    setCohortsError(null)
    try {
      const list = await listCohorts(websiteId)
      setCohorts(list)
      const details = await Promise.all(list.map((c) => getCohort(c.id)))
      setAllDetails(details)
    } catch (err: unknown) {
      setCohortsError(err instanceof Error ? err.message : 'Kunne ikke laste brukergrupper')
    } finally {
      setCohortsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedWebsiteId) void loadCohorts(selectedWebsiteId)
  }, [selectedWebsiteId, loadCohorts])

  const handleDelete = async () => {
    if (!deleteTarget || !selectedWebsiteId) return
    setDeleting(true)
    try {
      await deleteCohort(deleteTarget.id)
      setDeleteTarget(null)
      await loadCohorts(selectedWebsiteId)
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  const loadTrash = useCallback(async (websiteId: string) => {
    setTrashLoading(true)
    setTrashError(null)
    try {
      setTrashCohorts(await listTrashedCohorts(websiteId))
    } catch (err: unknown) {
      setTrashError(err instanceof Error ? err.message : 'Kunne ikke laste papirkurv')
    } finally {
      setTrashLoading(false)
    }
  }, [])

  const openTrash = () => {
    setTrashOpen(true)
    if (selectedWebsiteId) void loadTrash(selectedWebsiteId)
  }

  const handleRestore = async (cohort: CohortDto) => {
    if (!selectedWebsiteId) return
    setRestoringId(cohort.id)
    try {
      await restoreCohort(cohort.id)
      await Promise.all([loadTrash(selectedWebsiteId), loadCohorts(selectedWebsiteId)])
    } catch {
      // ignore
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async () => {
    if (!permDeleteTarget || !selectedWebsiteId) return
    setPermDeleting(true)
    try {
      await permanentlyDeleteCohort(permDeleteTarget.id)
      setPermDeleteTarget(null)
      await loadTrash(selectedWebsiteId)
    } catch {
      // ignore
    } finally {
      setPermDeleting(false)
    }
  }

  const openEditor = async (cohort: CohortDto) => {
    setEditorLoading(true)
    try {
      const detail = await getCohort(cohort.id)
      setEditorTarget(detail)
    } catch {
      // ignore
    } finally {
      setEditorLoading(false)
    }
  }

  const handleEditorChanged = async () => {
    if (!selectedWebsiteId) return
    const editingId = editorTarget !== 'new' ? editorTarget?.id : undefined
    setEditorTarget(null)
    await loadCohorts(selectedWebsiteId)
    // Reopen on the refreshed detail if we were editing (keeps the dialog open
    // for further tweaks after save); creating closes the dialog outright.
    if (editingId != null) {
      const detail = await getCohort(editingId)
      setEditorTarget(detail)
    }
  }

  const selectedWebsite = websites.find((w) => w.id === selectedWebsiteId)
  const cohortNames = Object.fromEntries(allDetails.map((c) => [String(c.id), c.name]))

  return (
    <>
      <PageHeader title="Brukergrupper" description="Definer brukergrupper basert på hendelser og egenskaper." />

      <AppBlock className="pb-16">
        <VStack gap="space-16">
          {/* Website picker */}
          <div style={{ maxWidth: 400 }}>
            {websitesLoading ? (
              <Loader size="small" title="Laster nettsteder…" />
            ) : (
              <UNSAFE_Combobox
                label="Nettsted"
                options={websites.map((w) => ({ label: `${w.name} — ${w.domain}`, value: w.id }))}
                selectedOptions={
                  selectedWebsite
                    ? [{ label: `${selectedWebsite.name} — ${selectedWebsite.domain}`, value: selectedWebsite.id }]
                    : []
                }
                onToggleSelected={(value, isSelected) => {
                  if (isSelected) setSelectedWebsiteId(value)
                }}
                isMultiSelect={false}
                size="small"
              />
            )}
          </div>

          {/* Cohort list */}
          {selectedWebsiteId && (
            <VStack gap="space-12">
              <HStack justify="space-between" align="center">
                <Heading size="small" level="2">
                  Brukergrupper
                </Heading>
                <HStack gap="space-8">
                  <Button size="small" variant="tertiary" icon={<ArchiveIcon aria-hidden />} onClick={openTrash}>
                    Papirkurv
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    icon={<PlusIcon aria-hidden />}
                    onClick={() => setEditorTarget('new')}
                  >
                    Ny brukergruppe
                  </Button>
                </HStack>
              </HStack>

              {cohortsLoading && <Loader size="medium" title="Laster brukergrupper…" />}
              {cohortsError && <Alert variant="error">{cohortsError}</Alert>}

              {!cohortsLoading && !cohortsError && cohorts.length === 0 && (
                <Alert variant="info" inline>
                  Ingen brukergrupper for dette nettstedet. Opprett en for å komme i gang.
                </Alert>
              )}

              {!cohortsLoading && cohorts.length > 0 && (
                <Table size="small">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Navn</Table.HeaderCell>
                      <Table.HeaderCell>Kriterier</Table.HeaderCell>
                      <Table.HeaderCell>Forhåndsvisning</Table.HeaderCell>
                      <Table.HeaderCell />
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {cohorts.map((cohort) => {
                      const detail = allDetails.find((d) => d.id === cohort.id)
                      const preview = detail ? queryToHuman(cohortToQuery(detail), cohortNames) : '…'
                      return (
                        <Table.Row key={cohort.id}>
                          <Table.DataCell>
                            <BodyShort size="small" weight="semibold">
                              {cohort.name}
                            </BodyShort>
                            {cohort.description && (
                              <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                                {cohort.description}
                              </BodyShort>
                            )}
                          </Table.DataCell>
                          <Table.DataCell>
                            {detail ? (
                              <CohortSummaryTag cohort={detail} allCohorts={allDetails} />
                            ) : (
                              <BodyShort size="small">…</BodyShort>
                            )}
                          </Table.DataCell>
                          <Table.DataCell style={{ maxWidth: 280 }}>
                            <BodyShort
                              size="small"
                              style={{
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                color: 'var(--ax-text-subtle)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={preview}
                            >
                              {preview}
                            </BodyShort>
                          </Table.DataCell>
                          <Table.DataCell>
                            <HStack gap="space-4" justify="end">
                              <Button
                                size="xsmall"
                                variant="secondary"
                                icon={<PencilIcon aria-hidden />}
                                loading={editorLoading}
                                onClick={() => void openEditor(cohort)}
                              >
                                Rediger
                              </Button>
                              <Button
                                size="xsmall"
                                variant="secondary"
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

      {/* Delete confirm dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <Dialog.Popup width="small" role="alertdialog">
          <Dialog.Header withClosebutton={false}>
            <Dialog.Title>Slett «{deleteTarget?.name}»?</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <BodyShort>
              Brukergruppen arkiveres og vil ikke lenger vises i lister. Andre brukergrupper som refererer til denne vil
              miste referansen sin.
            </BodyShort>
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

      {/* Trash / archive dialog */}
      <Dialog
        open={trashOpen}
        onOpenChange={(o) => {
          setTrashOpen(o)
        }}
      >
        <Dialog.Popup width="medium">
          <Dialog.Header>
            <Dialog.Title>Papirkurv</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <VStack gap="space-12">
              <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                Slettede brukergrupper havner her. Gjenopprett dem, eller slett dem permanent.
              </BodyShort>

              {trashLoading && <Loader size="medium" title="Laster papirkurv…" />}
              {trashError && <Alert variant="error">{trashError}</Alert>}

              {!trashLoading && !trashError && trashCohorts.length === 0 && (
                <Alert variant="info" inline>
                  Papirkurven er tom.
                </Alert>
              )}

              {!trashLoading && trashCohorts.length > 0 && (
                <Table size="small">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Navn</Table.HeaderCell>
                      <Table.HeaderCell />
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {trashCohorts.map((cohort) => (
                      <Table.Row key={cohort.id}>
                        <Table.DataCell>
                          <BodyShort size="small" weight="semibold">
                            {cohort.name}
                          </BodyShort>
                          {cohort.description && (
                            <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                              {cohort.description}
                            </BodyShort>
                          )}
                        </Table.DataCell>
                        <Table.DataCell>
                          <HStack gap="space-4" justify="end">
                            <Button
                              size="xsmall"
                              variant="secondary"
                              icon={<ArrowUndoIcon aria-hidden />}
                              loading={restoringId === cohort.id}
                              onClick={() => void handleRestore(cohort)}
                            >
                              Gjenopprett
                            </Button>
                            <Button
                              size="xsmall"
                              variant="secondary"
                              data-color="danger"
                              icon={<TrashIcon aria-hidden />}
                              onClick={() => setPermDeleteTarget(cohort)}
                            >
                              Slett permanent
                            </Button>
                          </HStack>
                        </Table.DataCell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary">
                Lukk
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>

      {/* Permanent delete confirm dialog */}
      <Dialog
        open={!!permDeleteTarget}
        onOpenChange={(o) => {
          if (!o) setPermDeleteTarget(null)
        }}
      >
        <Dialog.Popup width="small" role="alertdialog">
          <Dialog.Header withClosebutton={false}>
            <Dialog.Title>Slett «{permDeleteTarget?.name}» permanent?</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <BodyShort>
              Dette kan ikke angres. Brukergruppen og alle dens kriterier slettes for godt fra databasen.
            </BodyShort>
          </Dialog.Body>
          <Dialog.Footer>
            <Button data-color="danger" onClick={() => void handlePermanentDelete()} loading={permDeleting}>
              Slett permanent
            </Button>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary">
                Avbryt
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>

      {/* Unified create/edit dialog — name/description on top, criteria below */}
      {editorTarget && (
        <CohortEditor
          cohort={editorTarget === 'new' ? null : editorTarget}
          websiteId={editorTarget === 'new' ? (selectedWebsiteId ?? undefined) : undefined}
          allCohorts={allDetails}
          onClose={() => setEditorTarget(null)}
          onChanged={() => void handleEditorChanged()}
        />
      )}
    </>
  )
}
