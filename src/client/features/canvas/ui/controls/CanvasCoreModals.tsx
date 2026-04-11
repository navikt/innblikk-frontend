import { useState } from 'react'
import { Alert, Button, Label, Modal, Select, TextField, UNSAFE_Combobox as Combobox } from '@navikt/ds-react'
import { FolderOpen, Plus } from 'lucide-react'
import type { CanvasChartOption, CanvasDeleteTarget } from '../../model/types.ts'
import CanvasActionMenu from '../../../../shared/ui/CanvasActionMenu.tsx'

type SelectOption = {
  id: number
  name: string
}

type CanvasCoreModalsProps = {
  shouldShowCreateCanvasModal: boolean
  isCreateTeamModalOpen: boolean
  isCreatingCanvas: boolean
  createCanvasProjectId: string
  createCanvasProjectOptions: SelectOption[]
  isLoadingExistingCanvasOptions: boolean
  existingCanvasOptions: SelectOption[]
  existingCanvasError: string | null
  createCanvasNameInput: string
  createCanvasError: string | null
  onOpenCreateTeam: () => void
  onCreateCanvasProjectIdChange: (value: string) => void
  onCreateCanvasNameChange: (value: string) => void
  onSubmitCreateCanvas: () => void
  isCreatingTeam: boolean
  createTeamNameInput: string
  createTeamDescriptionInput: string
  createTeamError: string | null
  onCloseCreateTeam: () => void
  onCreateTeamNameChange: (value: string) => void
  onCreateTeamDescriptionChange: (value: string) => void
  onSubmitCreateTeam: () => void
  isAddDashboardModalOpen: boolean
  isLoadingDashboardOptions: boolean
  selectedProjectToAddId: string
  projectOptions: SelectOption[]
  selectedDashboardToAddId: string
  dashboardOptions: SelectOption[]
  addDashboardError: string | null
  isSavingCanvasItem: boolean
  onCloseAddDashboardModal: () => void
  onAddDashboardProjectChange: (value: string) => void
  onAddDashboardSelectionChange: (value: string) => void
  onSubmitAddDashboard: () => void
  isEditDashboardModalOpen: boolean
  isLoadingEditDashboardOptions: boolean
  editDashboardSelectedProjectId: string
  editDashboardProjectOptions: SelectOption[]
  editDashboardSelectedDashboardId: string
  editDashboardOptions: SelectOption[]
  editDashboardError: string | null
  onCloseEditDashboardModal: () => void
  onEditDashboardProjectChange: (value: string) => void
  onEditDashboardSelectionChange: (value: string) => void
  onSubmitEditDashboard: () => void
  deleteTarget: CanvasDeleteTarget | null
  bulkDeleteProgress: { total: number; completed: number } | null
  onCloseDeleteModal: () => void
  onConfirmDeleteTarget: (mode?: 'section-only' | 'section-with-content') => void
  isAddChartModalOpen: boolean
  isLoadingChartOptions: boolean
  chartOptions: CanvasChartOption[]
  selectedChartOptionId: string
  addChartError: string | null
  onCloseAddChartModal: () => void
  onChartOptionChange: (value: string) => void
  onSubmitAddChart: () => void
}

const CanvasCoreModals = ({
  shouldShowCreateCanvasModal,
  isCreateTeamModalOpen,
  isCreatingCanvas,
  createCanvasProjectId,
  createCanvasProjectOptions,
  isLoadingExistingCanvasOptions,
  existingCanvasOptions,
  existingCanvasError,
  createCanvasNameInput,
  createCanvasError,
  onOpenCreateTeam,
  onCreateCanvasProjectIdChange,
  onCreateCanvasNameChange,
  onSubmitCreateCanvas,
  isCreatingTeam,
  createTeamNameInput,
  createTeamDescriptionInput,
  createTeamError,
  onCloseCreateTeam,
  onCreateTeamNameChange,
  onCreateTeamDescriptionChange,
  onSubmitCreateTeam,
  isAddDashboardModalOpen,
  isLoadingDashboardOptions,
  selectedProjectToAddId,
  projectOptions,
  selectedDashboardToAddId,
  dashboardOptions,
  addDashboardError,
  isSavingCanvasItem,
  onCloseAddDashboardModal,
  onAddDashboardProjectChange,
  onAddDashboardSelectionChange,
  onSubmitAddDashboard,
  isEditDashboardModalOpen,
  isLoadingEditDashboardOptions,
  editDashboardSelectedProjectId,
  editDashboardProjectOptions,
  editDashboardSelectedDashboardId,
  editDashboardOptions,
  editDashboardError,
  onCloseEditDashboardModal,
  onEditDashboardProjectChange,
  onEditDashboardSelectionChange,
  onSubmitEditDashboard,
  deleteTarget,
  bulkDeleteProgress,
  onCloseDeleteModal,
  onConfirmDeleteTarget,
  isAddChartModalOpen,
  isLoadingChartOptions,
  chartOptions,
  selectedChartOptionId,
  addChartError,
  onCloseAddChartModal,
  onChartOptionChange,
  onSubmitAddChart,
}: CanvasCoreModalsProps) => {
  const [isCreateCanvasDetailsOpen, setIsCreateCanvasDetailsOpen] = useState(false)
  const [teamComboboxInput, setTeamComboboxInput] = useState('')
  const selectedTeamOption =
    createCanvasProjectOptions.find((option) => String(option.id) === createCanvasProjectId) ?? null
  const teamComboboxOptions = createCanvasProjectOptions.map((option) => option.name)

  return (
    <>
      <Modal
        open={shouldShowCreateCanvasModal && !isCreateTeamModalOpen && !isCreateCanvasDetailsOpen}
        onClose={() => {
          // Keep modal open until user creates or navigates away.
        }}
        header={{ heading: 'Canvas-oversikt', closeButton: false }}
        width="small"
        closeOnBackdropClick={false}
      >
        <Modal.Body>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="create-canvas-team-select">Team</Label>
                <Button
                  variant="tertiary"
                  size="small"
                  type="button"
                  icon={<Plus aria-hidden size={16} />}
                  onClick={() => {
                    setIsCreateCanvasDetailsOpen(false)
                    onOpenCreateTeam()
                  }}
                  disabled={isCreatingCanvas}
                >
                  Nytt team
                </Button>
              </div>
              <Combobox
                label="Team"
                hideLabel
                options={teamComboboxOptions}
                selectedOptions={selectedTeamOption ? [selectedTeamOption.name] : []}
                onToggleSelected={(option: string, isSelected: boolean) => {
                  if (!isSelected) {
                    onCreateCanvasProjectIdChange('')
                    return
                  }
                  const selectedOption = createCanvasProjectOptions.find((item) => item.name === option)
                  onCreateCanvasProjectIdChange(selectedOption ? String(selectedOption.id) : '')
                }}
                value={teamComboboxInput}
                onChange={(value) => setTeamComboboxInput(value)}
                isMultiSelect={false}
                clearButton
                disabled={isCreatingCanvas}
              />
            </div>
            <div className="pt-2">
              <div className="space-y-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label>Canvas</Label>
                  <Button
                    variant="tertiary"
                    size="small"
                    type="button"
                    icon={<Plus aria-hidden size={16} />}
                    onClick={() => setIsCreateCanvasDetailsOpen(true)}
                    disabled={!createCanvasProjectId || isLoadingExistingCanvasOptions}
                  >
                    Lag canvas
                  </Button>
                </div>
                <div className="min-h-[232px]">
                  {!createCanvasProjectId && (
                    <div className="pt-1 text-sm text-[var(--ax-text-neutral-subtle)]">Velg team først.</div>
                  )}
                  {createCanvasProjectId && isLoadingExistingCanvasOptions && (
                    <div className="pt-1 text-sm text-[var(--ax-text-neutral-subtle)]">Laster canvas...</div>
                  )}
                  {createCanvasProjectId && !isLoadingExistingCanvasOptions && existingCanvasOptions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-4 py-5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-[var(--ax-text-neutral-subtle)]">
                          <FolderOpen aria-hidden size={18} />
                        </span>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-[var(--ax-text-default)]">Ingen canvas ennå</p>
                          <p className="text-sm text-[var(--ax-text-neutral-subtle)]">
                            Opprett et nytt canvas for dette teamet.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {createCanvasProjectId && !isLoadingExistingCanvasOptions && existingCanvasOptions.length > 0 && (
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]">
                      {existingCanvasOptions.map((option, index) => (
                        <div
                          key={option.id}
                          className={`flex w-full items-center gap-2 transition-colors hover:bg-[var(--ax-bg-neutral-moderate)] ${
                            index < existingCanvasOptions.length - 1
                              ? 'border-b border-[var(--ax-border-neutral-subtle)]'
                              : ''
                          }`}
                        >
                          <a
                            href={`/canvas?projectId=${createCanvasProjectId}&dashboardId=${option.id}`}
                            className="block min-w-0 flex-1 truncate px-4 py-3 text-base font-semibold text-[var(--ax-text-default)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ax-border-accent)]"
                          >
                            {option.name}
                          </a>
                          <div className="pr-2">
                            <CanvasActionMenu
                              canvasName={option.name}
                              items={[
                                {
                                  label: 'Elementoversikt',
                                  href: `/dashboard?projectId=${createCanvasProjectId}&canvasDashboardId=${option.id}&canvasAction=inventory`,
                                },
                                {
                                  label: 'Endre info',
                                  href: `/dashboard?projectId=${createCanvasProjectId}&canvasDashboardId=${option.id}&canvasAction=edit`,
                                },
                                {
                                  label: 'Flytt canvas',
                                  href: `/dashboard?projectId=${createCanvasProjectId}&canvasDashboardId=${option.id}&canvasAction=move`,
                                },
                                {
                                  label: 'Slett canvas',
                                  href: `/dashboard?projectId=${createCanvasProjectId}&canvasDashboardId=${option.id}&canvasAction=delete`,
                                },
                              ]}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {existingCanvasError && <Alert variant="error">{existingCanvasError}</Alert>}
              </div>
            </div>
          </div>
        </Modal.Body>
      </Modal>

      <Modal
        open={isCreateCanvasDetailsOpen && shouldShowCreateCanvasModal && !isCreateTeamModalOpen}
        onClose={() => {
          if (isCreatingCanvas) return
          setIsCreateCanvasDetailsOpen(false)
        }}
        header={{ heading: 'Lag canvas' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              label="Canvas-navn"
              value={createCanvasNameInput}
              onChange={(event) => onCreateCanvasNameChange(event.target.value)}
              disabled={isCreatingCanvas}
            />
            {createCanvasError && <Alert variant="error">{createCanvasError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onSubmitCreateCanvas} size="small" loading={isCreatingCanvas}>
            Lag canvas
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setIsCreateCanvasDetailsOpen(false)}
            disabled={isCreatingCanvas}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal open={isCreateTeamModalOpen} onClose={onCloseCreateTeam} header={{ heading: 'Nytt team' }} width="small">
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              label="Navn"
              size="small"
              value={createTeamNameInput}
              onChange={(event) => onCreateTeamNameChange(event.target.value)}
            />
            <TextField
              label="Beskrivelse (valgfri)"
              size="small"
              value={createTeamDescriptionInput}
              onChange={(event) => onCreateTeamDescriptionChange(event.target.value)}
            />
            {createTeamError && <Alert variant="error">{createTeamError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button size="small" onClick={onSubmitCreateTeam} loading={isCreatingTeam}>
            Opprett
          </Button>
          <Button size="small" variant="secondary" onClick={onCloseCreateTeam} disabled={isCreatingTeam}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddDashboardModalOpen}
        onClose={onCloseAddDashboardModal}
        header={{ heading: 'Legg til dashboard i canvas' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Select
              label="Team"
              value={selectedProjectToAddId}
              onChange={(event) => onAddDashboardProjectChange(event.target.value)}
              disabled={isLoadingDashboardOptions}
            >
              <option value="" disabled>
                {isLoadingDashboardOptions ? 'Laster team...' : 'Velg team'}
              </option>
              {projectOptions.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </Select>
            {(isLoadingDashboardOptions || dashboardOptions.length > 0) && (
              <Select
                label="Dashboard"
                value={selectedDashboardToAddId}
                onChange={(event) => onAddDashboardSelectionChange(event.target.value)}
                disabled={isLoadingDashboardOptions}
              >
                <option value="" disabled>
                  {isLoadingDashboardOptions ? 'Laster dashboards...' : 'Velg dashboard'}
                </option>
                {dashboardOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
            {addDashboardError && <Alert variant="error">{addDashboardError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {dashboardOptions.length > 0 && (
            <Button
              onClick={onSubmitAddDashboard}
              size="small"
              loading={isSavingCanvasItem}
              disabled={!selectedDashboardToAddId}
            >
              Legg til
            </Button>
          )}
          <Button variant="secondary" size="small" onClick={onCloseAddDashboardModal}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isEditDashboardModalOpen}
        onClose={onCloseEditDashboardModal}
        header={{ heading: 'Rediger dashboard' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Select
              label="Team"
              value={editDashboardSelectedProjectId}
              onChange={(event) => onEditDashboardProjectChange(event.target.value)}
              disabled={isLoadingEditDashboardOptions}
            >
              <option value="" disabled>
                {isLoadingEditDashboardOptions ? 'Laster team...' : 'Velg team'}
              </option>
              {editDashboardProjectOptions.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </Select>
            {(isLoadingEditDashboardOptions || editDashboardOptions.length > 0) && (
              <Select
                label="Dashboard"
                value={editDashboardSelectedDashboardId}
                onChange={(event) => onEditDashboardSelectionChange(event.target.value)}
                disabled={isLoadingEditDashboardOptions}
              >
                <option value="" disabled>
                  {isLoadingEditDashboardOptions ? 'Laster dashboards...' : 'Velg dashboard'}
                </option>
                {editDashboardOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
            {editDashboardError && <Alert variant="error">{editDashboardError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {editDashboardOptions.length > 0 && (
            <Button
              onClick={onSubmitEditDashboard}
              size="small"
              loading={isSavingCanvasItem}
              disabled={!editDashboardSelectedDashboardId}
            >
              Lagre
            </Button>
          )}
          <Button variant="secondary" size="small" onClick={onCloseEditDashboardModal}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (isSavingCanvasItem) return
          onCloseDeleteModal()
        }}
        header={{
          heading:
            deleteTarget?.type === 'connection'
              ? 'Fjern kobling'
              : deleteTarget?.type === 'section'
                ? 'Fjern seksjon'
                : deleteTarget?.type === 'frames'
                  ? 'Fjern valgte kort'
                  : 'Fjern kort',
        }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <p>
              Er du sikker på at du vil fjerne{' '}
              <strong>
                {deleteTarget?.type === 'connection'
                  ? 'koblingen'
                  : deleteTarget?.type === 'section'
                    ? 'seksjonen'
                    : deleteTarget?.type === 'frames'
                      ? 'de valgte kortene'
                      : 'kortet'}
              </strong>
              {deleteTarget?.label ? (
                <>
                  {' '}
                  <strong>{deleteTarget.label}</strong>
                </>
              ) : null}
              ?
            </p>
            <p className="text-[var(--ax-text-subtle)]">Denne handlingen kan ikke angres.</p>
            {deleteTarget?.type === 'section' ? (
              <p className="text-[var(--ax-text-subtle)]">
                Seksjonen inneholder {deleteTarget.containedFrameIds.length} element(er).
              </p>
            ) : null}
            {deleteTarget?.type === 'frames' && isSavingCanvasItem && bulkDeleteProgress ? (
              <Alert variant="info" size="small">
                Sletter kort {bulkDeleteProgress.completed} av {bulkDeleteProgress.total}...
              </Alert>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {deleteTarget?.type === 'section' ? (
            <>
              <Button
                variant="secondary"
                onClick={() => onConfirmDeleteTarget('section-only')}
                loading={isSavingCanvasItem}
              >
                Fjern kun seksjon
              </Button>
              <Button
                variant="primary"
                onClick={() => onConfirmDeleteTarget('section-with-content')}
                loading={isSavingCanvasItem}
              >
                Fjern seksjon og innhold
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => onConfirmDeleteTarget()} loading={isSavingCanvasItem}>
              {deleteTarget?.type === 'connection'
                ? 'Fjern kobling'
                : deleteTarget?.type === 'frames'
                  ? isSavingCanvasItem && bulkDeleteProgress
                    ? `Sletter (${bulkDeleteProgress.completed}/${bulkDeleteProgress.total})`
                    : 'Fjern valgte'
                  : 'Fjern kort'}
            </Button>
          )}
          <Button variant="secondary" onClick={onCloseDeleteModal} disabled={isSavingCanvasItem}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddChartModalOpen}
        onClose={onCloseAddChartModal}
        header={{ heading: 'Importer graf' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            {(isLoadingChartOptions || chartOptions.length > 0) && (
              <Select
                label="Graf"
                value={selectedChartOptionId}
                onChange={(event) => onChartOptionChange(event.target.value)}
                disabled={isLoadingChartOptions}
              >
                <option value="" disabled>
                  {isLoadingChartOptions ? 'Laster grafer...' : 'Velg graf'}
                </option>
                {chartOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </Select>
            )}
            {addChartError && <Alert variant="error">{addChartError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {chartOptions.length > 0 && (
            <Button
              onClick={onSubmitAddChart}
              size="small"
              loading={isSavingCanvasItem}
              disabled={!selectedChartOptionId}
            >
              Legg til
            </Button>
          )}
          <Button variant="secondary" size="small" onClick={onCloseAddChartModal}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

export default CanvasCoreModals
