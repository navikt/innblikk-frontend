import { useEffect, useMemo, useState } from 'react'
import { BarChartIcon } from '@navikt/aksel-icons'
import { ActionMenu, Alert, BodyShort, Button, Heading, Loader, Modal, Search, TextField } from '@navikt/ds-react'
import { MoreVertical, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useProjectManager } from '../hooks/useProjectManager.ts'

const LAST_PROJECT_STORAGE_KEY = 'projectmanager:lastSelectedProjectId'
const CANVAS_DASHBOARD_TOKEN = '[canvas]'

const isCanvasDashboard = (description?: string): boolean =>
  (description || '').toLowerCase().split(/\s+/).includes(CANVAS_DASHBOARD_TOKEN)
const cardTitleClass =
  'block min-h-8 min-w-0 flex-1 truncate text-left text-sm font-semibold leading-8 text-[var(--ax-text-default)]'
const addCardTitleClass =
  'block min-h-8 min-w-0 flex-1 truncate text-left text-base font-semibold leading-8 text-[var(--ax-text-default)]'

const CanvasProjectManager = () => {
  const navigate = useNavigate()
  const {
    projectSummaries,
    loading,
    error,
    message,
    newProjectName,
    setNewProjectName,
    newProjectDescription,
    setNewProjectDescription,
    createProject,
    editProject,
    deleteProject,
    createDashboard,
  } = useProjectManager()

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  })
  const [projectSearch, setProjectSearch] = useState('')
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false)
  const [isEditTeamOpen, setIsEditTeamOpen] = useState(false)
  const [isDeleteTeamOpen, setIsDeleteTeamOpen] = useState(false)
  const [isCreateCanvasOpen, setIsCreateCanvasOpen] = useState(false)
  const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false)
  const [editTeamName, setEditTeamName] = useState('')
  const [editTeamDescription, setEditTeamDescription] = useState('')
  const [newCanvasName, setNewCanvasName] = useState('')
  const [newCanvasDescription, setNewCanvasDescription] = useState('')
  const [newDashboardName, setNewDashboardName] = useState('')
  const [newDashboardDescription, setNewDashboardDescription] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (projectSummaries.length === 0) return
    if (!selectedProjectId || !projectSummaries.some((item) => item.project.id === selectedProjectId)) {
      setSelectedProjectId(projectSummaries[0].project.id)
    }
  }, [projectSummaries, selectedProjectId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (projectSummaries.length === 0 || !selectedProjectId) return
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, String(selectedProjectId))
  }, [projectSummaries.length, selectedProjectId])

  const filteredProjectSummaries = useMemo(() => {
    const query = projectSearch.trim().toLowerCase()
    const filtered = !query
      ? projectSummaries
      : projectSummaries.filter((summary) => {
          const name = summary.project.name.toLowerCase()
          const description = (summary.project.description ?? '').toLowerCase()
          return name.includes(query) || description.includes(query)
        })

    return [...filtered].sort((a, b) => a.project.name.localeCompare(b.project.name, 'nb', { sensitivity: 'base' }))
  }, [projectSummaries, projectSearch])

  const selectedProject = useMemo(
    () => projectSummaries.find((item) => item.project.id === selectedProjectId) ?? null,
    [projectSummaries, selectedProjectId],
  )

  const canvasDashboards = useMemo(
    () => selectedProject?.dashboards.filter((dashboard) => isCanvasDashboard(dashboard.description)) ?? [],
    [selectedProject],
  )

  const regularDashboards = useMemo(
    () => selectedProject?.dashboards.filter((dashboard) => !isCanvasDashboard(dashboard.description)) ?? [],
    [selectedProject],
  )

  const isInitialLoading = loading && projectSummaries.length === 0 && !error

  const handleCreateTeam = async () => {
    setLocalError(null)
    const createdProjectId = await createProject()
    if (!createdProjectId) {
      setLocalError('Kunne ikke opprette team.')
      return
    }
    setSelectedProjectId(createdProjectId)
    setIsCreateTeamOpen(false)
  }

  const handleOpenEditTeam = () => {
    if (!selectedProject) return
    setEditTeamName(selectedProject.project.name)
    setEditTeamDescription(selectedProject.project.description || '')
    setLocalError(null)
    setIsEditTeamOpen(true)
  }

  const handleSaveEditTeam = async () => {
    if (!selectedProject) return
    setLocalError(null)
    const result = await editProject(selectedProject.project.id, editTeamName, editTeamDescription)
    if (!result) {
      setLocalError('Kunne ikke oppdatere team.')
      return
    }
    setIsEditTeamOpen(false)
  }

  const handleDeleteTeam = async () => {
    if (!selectedProject) return
    setLocalError(null)
    const result = await deleteProject(selectedProject.project.id)
    if (!result) {
      setLocalError('Kunne ikke slette team.')
      return
    }
    setIsDeleteTeamOpen(false)
    setSelectedProjectId(null)
  }

  const handleCreateCanvas = async () => {
    if (!selectedProject) return
    if (!newCanvasName.trim()) {
      setLocalError('Canvas-navn er påkrevd.')
      return
    }
    setLocalError(null)
    const description = [CANVAS_DASHBOARD_TOKEN, newCanvasDescription.trim()].filter(Boolean).join(' ')
    const created = await createDashboard(selectedProject.project.id, newCanvasName.trim(), description)
    if (!created) {
      setLocalError('Kunne ikke opprette canvas.')
      return
    }
    setIsCreateCanvasOpen(false)
    setNewCanvasName('')
    setNewCanvasDescription('')
  }

  const handleCreateDashboard = async () => {
    if (!selectedProject) return
    if (!newDashboardName.trim()) {
      setLocalError('Dashboard-navn er påkrevd.')
      return
    }
    setLocalError(null)
    const created = await createDashboard(
      selectedProject.project.id,
      newDashboardName.trim(),
      newDashboardDescription.trim() || undefined,
    )
    if (!created) {
      setLocalError('Kunne ikke opprette dashboard.')
      return
    }
    setIsCreateDashboardOpen(false)
    setNewDashboardName('')
    setNewDashboardDescription('')
  }

  const openCanvasDashboard = (dashboardId: number, projectId: number) => {
    void navigate(`/canvas?dashboardId=${dashboardId}&projectId=${projectId}`)
  }

  const openDashboard = (dashboardId: number) => {
    void navigate(`/dashboard/${dashboardId}`)
  }

  return (
    <div className="h-full bg-transparent">
      <div className="h-full rounded-none border-0 bg-transparent overflow-hidden">
        <div className="flex h-full min-h-0 flex-col md:flex-row">
          <aside className="md:w-[280px] bg-transparent border-b md:border-b-0 md:border-r border-[var(--ax-border-neutral-subtle)] flex-shrink-0">
            <div className="flex h-full min-h-0 flex-col p-5 md:p-6">
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Search
                      label="Finn team"
                      variant="simple"
                      hideLabel={false}
                      value={projectSearch}
                      onChange={setProjectSearch}
                      onClear={() => setProjectSearch('')}
                      size="small"
                    />
                  </div>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    icon={<Plus aria-hidden size={16} />}
                    aria-label="Nytt team"
                    className="!border-[var(--ax-border-accent)] !text-[var(--ax-text-accent)] !bg-[var(--ax-bg-default)]"
                    onClick={() => setIsCreateTeamOpen(true)}
                  />
                </div>

                {isInitialLoading && (
                  <div className="py-4 flex justify-center">
                    <Loader size="medium" title="Laster team" />
                  </div>
                )}

                {!isInitialLoading && filteredProjectSummaries.length === 0 && (
                  <Alert variant="info" size="small">
                    Ingen team funnet.
                  </Alert>
                )}

                {!isInitialLoading && filteredProjectSummaries.length > 0 && (
                  <div className="max-h-[calc(100dvh-300px)] overflow-auto pr-1 pb-2">
                    <div className="flex flex-col gap-2">
                      {filteredProjectSummaries.map((summary) => {
                        const isSelected = summary.project.id === selectedProjectId
                        return (
                          <button
                            key={summary.project.id}
                            type="button"
                            onClick={() => setSelectedProjectId(summary.project.id)}
                            className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? 'bg-[var(--ax-bg-accent-moderate)] border-[var(--ax-border-accent)]'
                                : 'bg-[var(--ax-bg-default)] border-[var(--ax-border-neutral-subtle)] hover:bg-[var(--ax-bg-neutral-moderate)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-sm truncate">{summary.project.name}</div>
                              <div className="flex items-center gap-1 text-xs text-[var(--ax-text-subtle)] shrink-0">
                                <BarChartIcon aria-hidden fontSize="0.9rem" />
                                <span className="tabular-nums">{summary.chartCount}</span>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="pt-4">
                <Button
                  size="small"
                  variant="secondary"
                  className="!border-[var(--ax-border-neutral)] !text-[var(--ax-text-default)] !bg-[var(--ax-bg-default)] hover:!bg-[var(--ax-bg-neutral-moderate)]"
                  onClick={() => setIsCreateTeamOpen(true)}
                >
                  Nytt team
                </Button>
              </div>
            </div>
          </aside>

          <main
            className="flex-1 min-w-0 overflow-auto"
            style={{
              backgroundColor: 'var(--ax-bg-default)',
            }}
          >
            <div className="border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-accent-soft)] px-5 py-4 md:px-6">
              {selectedProject ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <Heading level="2" size="medium">
                      {selectedProject.project.name}
                    </Heading>
                    {selectedProject.project.description && (
                      <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                        {selectedProject.project.description}
                      </BodyShort>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ActionMenu>
                      <ActionMenu.Trigger>
                        <Button
                          size="xsmall"
                          variant="tertiary"
                          icon={<MoreVertical size={14} />}
                          className="!text-[var(--ax-text-default)] hover:!bg-[var(--ax-bg-neutral-moderate)]"
                        />
                      </ActionMenu.Trigger>
                      <ActionMenu.Content align="end">
                        <ActionMenu.Item onClick={handleOpenEditTeam}>Rediger team</ActionMenu.Item>
                        <ActionMenu.Item onClick={() => setIsDeleteTeamOpen(true)}>Slett team</ActionMenu.Item>
                      </ActionMenu.Content>
                    </ActionMenu>
                  </div>
                </div>
              ) : (
                <Heading level="2" size="medium">
                  Team
                </Heading>
              )}
            </div>

            <div className="p-5 md:p-6 space-y-7">
              {error && <Alert variant="error">{error}</Alert>}
              {message && <Alert variant="success">{message}</Alert>}
              {localError && <Alert variant="error">{localError}</Alert>}

              {selectedProject && (
                <section className="space-y-0">
                  <h3 className="mt-0 mb-2 text-[1.25rem] font-semibold leading-none text-[var(--ax-text-default)]">
                    Canvas
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {canvasDashboards.map((dashboard) => (
                      <article
                        key={dashboard.id}
                        className="group rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-5 py-4 shadow-none transition hover:border-[var(--ax-border-neutral)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openCanvasDashboard(dashboard.id, selectedProject.project.id)}
                            className={`${cardTitleClass} hover:underline`}
                          >
                            {dashboard.name}
                          </button>
                          <ActionMenu>
                            <ActionMenu.Trigger>
                              <Button
                                size="xsmall"
                                variant="tertiary"
                                icon={<MoreVertical size={18} />}
                                aria-label={`Flere valg for ${dashboard.name}`}
                                className="!h-9 !w-9 !text-[var(--ax-text-default)] hover:!bg-[var(--ax-bg-neutral-moderate)]"
                              />
                            </ActionMenu.Trigger>
                            <ActionMenu.Content align="end">
                              <ActionMenu.Item
                                onClick={() => openCanvasDashboard(dashboard.id, selectedProject.project.id)}
                              >
                                Åpne canvas
                              </ActionMenu.Item>
                              <ActionMenu.Item
                                onClick={() => void navigate(`/dashboard?projectId=${selectedProject.project.id}`)}
                              >
                                Rediger i arbeidsområde
                              </ActionMenu.Item>
                            </ActionMenu.Content>
                          </ActionMenu>
                        </div>
                      </article>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsCreateCanvasOpen(true)}
                      className="rounded-xl border border-dashed border-[var(--ax-border-neutral)] bg-[var(--ax-bg-default)] px-5 py-4 text-left transition-colors hover:bg-[var(--ax-bg-accent-soft)]"
                    >
                      <div className="flex items-center gap-2">
                        <Plus size={18} />
                        <span className={addCardTitleClass}>Legg til canvas</span>
                      </div>
                    </button>
                  </div>
                </section>
              )}

              {selectedProject && (
                <section className="space-y-0">
                  <h3 className="mt-0 mb-2 text-[1.1rem] font-semibold leading-none text-[var(--ax-text-default)]">
                    Dashboards
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {regularDashboards.map((dashboard) => (
                      <article
                        key={dashboard.id}
                        className="group rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-5 py-4 shadow-none transition hover:border-[var(--ax-border-neutral)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openDashboard(dashboard.id)}
                            className={`${cardTitleClass} hover:underline`}
                          >
                            {dashboard.name}
                          </button>
                          <ActionMenu>
                            <ActionMenu.Trigger>
                              <Button
                                size="xsmall"
                                variant="tertiary"
                                icon={<MoreVertical size={18} />}
                                aria-label={`Flere valg for ${dashboard.name}`}
                                className="!h-9 !w-9 !text-[var(--ax-text-default)] hover:!bg-[var(--ax-bg-neutral-moderate)]"
                              />
                            </ActionMenu.Trigger>
                            <ActionMenu.Content align="end">
                              <ActionMenu.Item onClick={() => openDashboard(dashboard.id)}>
                                Åpne dashboard
                              </ActionMenu.Item>
                              <ActionMenu.Item
                                onClick={() => void navigate(`/dashboard?projectId=${selectedProject.project.id}`)}
                              >
                                Rediger i arbeidsområde
                              </ActionMenu.Item>
                            </ActionMenu.Content>
                          </ActionMenu>
                        </div>
                      </article>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsCreateDashboardOpen(true)}
                      className="rounded-xl border border-dashed border-[var(--ax-border-neutral)] bg-[var(--ax-bg-default)] px-5 py-4 text-left transition-colors hover:bg-[var(--ax-bg-accent-soft)]"
                    >
                      <div className="flex items-center gap-2">
                        <Plus size={18} />
                        <span className={addCardTitleClass}>Legg til dashboard</span>
                      </div>
                    </button>
                  </div>
                </section>
              )}

              {!isInitialLoading && !selectedProject && (
                <Alert variant="info" size="small">
                  Velg et team for å se canvas og dashboards.
                </Alert>
              )}
            </div>
          </main>
        </div>
      </div>

      <Modal open={isCreateTeamOpen} onClose={() => setIsCreateTeamOpen(false)} header={{ heading: 'Nytt team' }}>
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              label="Navn"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
            />
            <TextField
              label="Beskrivelse"
              value={newProjectDescription}
              onChange={(event) => setNewProjectDescription(event.target.value)}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button size="small" onClick={() => void handleCreateTeam()} loading={loading}>
            Opprett team
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal open={isEditTeamOpen} onClose={() => setIsEditTeamOpen(false)} header={{ heading: 'Rediger team' }}>
        <Modal.Body>
          <div className="space-y-3">
            <TextField label="Navn" value={editTeamName} onChange={(event) => setEditTeamName(event.target.value)} />
            <TextField
              label="Beskrivelse"
              value={editTeamDescription}
              onChange={(event) => setEditTeamDescription(event.target.value)}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button size="small" onClick={() => void handleSaveEditTeam()} loading={loading}>
            Lagre
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal open={isDeleteTeamOpen} onClose={() => setIsDeleteTeamOpen(false)} header={{ heading: 'Slett team' }}>
        <Modal.Body>
          <BodyShort>Er du sikker på at du vil slette dette teamet?</BodyShort>
        </Modal.Body>
        <Modal.Footer>
          <Button size="small" variant="danger" onClick={() => void handleDeleteTeam()} loading={loading}>
            Slett
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isCreateCanvasOpen}
        onClose={() => setIsCreateCanvasOpen(false)}
        header={{ heading: 'Legg til canvas' }}
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField label="Navn" value={newCanvasName} onChange={(event) => setNewCanvasName(event.target.value)} />
            <TextField
              label="Beskrivelse"
              value={newCanvasDescription}
              onChange={(event) => setNewCanvasDescription(event.target.value)}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button size="small" onClick={() => void handleCreateCanvas()} loading={loading}>
            Opprett canvas
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isCreateDashboardOpen}
        onClose={() => setIsCreateDashboardOpen(false)}
        header={{ heading: 'Legg til dashboard' }}
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              label="Navn"
              value={newDashboardName}
              onChange={(event) => setNewDashboardName(event.target.value)}
            />
            <TextField
              label="Beskrivelse"
              value={newDashboardDescription}
              onChange={(event) => setNewDashboardDescription(event.target.value)}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button size="small" onClick={() => void handleCreateDashboard()} loading={loading}>
            Opprett dashboard
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

export default CanvasProjectManager
