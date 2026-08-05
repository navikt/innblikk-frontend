import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Dialog, Heading, Loader, Alert, Table, TextField, VStack, HStack, BodyShort } from '@navikt/ds-react'
import { PlusIcon, TrashIcon, PencilIcon, FunnelIcon } from '@navikt/aksel-icons'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import type { Website } from '../../../shared/types/website.ts'
import { listCohorts, getCohort, createCohort, updateCohort, deleteCohort } from '../api/cohortManagerApi.ts'
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

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Edit dialog
  const [editTarget, setEditTarget] = useState<CohortDto | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<CohortDto | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Criteria editor
  const [editorTarget, setEditorTarget] = useState<CohortDetailDto | null>(null)
  const [editorLoading, setEditorLoading] = useState(false)

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

  const handleCreate = async () => {
    if (!selectedWebsiteId) return
    if (!newName.trim()) {
      setCreateError('Navn er påkrevd')
      return
    }
    setCreateError(null)
    setCreating(true)
    try {
      await createCohort({
        websiteId: selectedWebsiteId,
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      })
      setCreateOpen(false)
      setNewName('')
      setNewDescription('')
      await loadCohorts(selectedWebsiteId)
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Feil ved opprettelse')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (cohort: CohortDto) => {
    setEditTarget(cohort)
    setEditName(cohort.name)
    setEditDescription(cohort.description ?? '')
    setEditError(null)
  }

  const handleEditSave = async () => {
    if (!editTarget || !selectedWebsiteId) return
    if (!editName.trim()) {
      setEditError('Navn er påkrevd')
      return
    }
    setEditError(null)
    setEditSaving(true)
    try {
      await updateCohort(editTarget.id, {
        name: editName.trim(),
        websiteId: editTarget.websiteId,
        description: editDescription.trim() || undefined,
      })
      setEditTarget(null)
      await loadCohorts(selectedWebsiteId)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Feil ved lagring')
    } finally {
      setEditSaving(false)
    }
  }

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
    if (!selectedWebsiteId || !editorTarget) return
    const detail = await getCohort(editorTarget.id)
    setEditorTarget(detail)
    await loadCohorts(selectedWebsiteId)
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
                <Button
                  size="small"
                  variant="secondary"
                  icon={<PlusIcon aria-hidden />}
                  onClick={() => {
                    setNewName('')
                    setNewDescription('')
                    setCreateError(null)
                    setCreateOpen(true)
                  }}
                >
                  Ny brukergruppe
                </Button>
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
                                icon={<FunnelIcon aria-hidden />}
                                loading={editorLoading}
                                onClick={() => void openEditor(cohort)}
                              >
                                Kriterier
                              </Button>
                              <Button
                                size="xsmall"
                                variant="secondary"
                                icon={<PencilIcon aria-hidden />}
                                onClick={() => openEdit(cohort)}
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Popup width="medium">
          <Dialog.Header>
            <Dialog.Title>Ny brukergruppe</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <form
              id="create-cohort-form"
              onSubmit={(e) => {
                e.preventDefault()
                void handleCreate()
              }}
            >
              <VStack gap="space-12">
                <TextField label="Navn" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                <TextField
                  label="Beskrivelse (valgfri)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
                {createError && (
                  <BodyShort size="small" style={{ color: 'var(--ax-text-danger)' }}>
                    {createError}
                  </BodyShort>
                )}
              </VStack>
            </form>
          </Dialog.Body>
          <Dialog.Footer>
            <Button form="create-cohort-form" type="submit" loading={creating}>
              Opprett
            </Button>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary">
                Avbryt
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null)
        }}
      >
        <Dialog.Popup width="medium">
          <Dialog.Header>
            <Dialog.Title>Rediger brukergruppe</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <form
              id="edit-cohort-form"
              onSubmit={(e) => {
                e.preventDefault()
                void handleEditSave()
              }}
            >
              <VStack gap="space-12">
                <TextField label="Navn" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <TextField
                  label="Beskrivelse (valgfri)"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                {editError && (
                  <BodyShort size="small" style={{ color: 'var(--ax-text-danger)' }}>
                    {editError}
                  </BodyShort>
                )}
              </VStack>
            </form>
          </Dialog.Body>
          <Dialog.Footer>
            <Button form="edit-cohort-form" type="submit" loading={editSaving}>
              Lagre
            </Button>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary">
                Avbryt
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>

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

      {/* Criteria editor */}
      {editorTarget && (
        <CohortEditor
          cohort={editorTarget}
          allCohorts={allDetails}
          onClose={() => setEditorTarget(null)}
          onChanged={() => void handleEditorChanged()}
        />
      )}
    </>
  )
}
