import { Alert, Button, Label, Modal, Select, TextField } from '@navikt/ds-react'
import { Plus } from 'lucide-react'
import type { CanvasChartOption, CanvasDeleteTarget } from '../../model/types.ts'

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
  onConfirmDeleteTarget: () => void
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
  return (
    <>
      <Modal
        open={shouldShowCreateCanvasModal && !isCreateTeamModalOpen}
        onClose={() => {
          // Keep modal open until user creates or navigates away.
        }}
        header={{ heading: 'Lag canvas', closeButton: false }}
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
                  onClick={onOpenCreateTeam}
                  disabled={isCreatingCanvas}
                >
                  Nytt team
                </Button>
              </div>
              <Select
                id="create-canvas-team-select"
                label="Team"
                hideLabel
                value={createCanvasProjectId}
                onChange={(event) => onCreateCanvasProjectIdChange(event.target.value)}
                disabled={isCreatingCanvas}
              >
                <option value="" disabled>
                  {createCanvasProjectOptions.length === 0 ? 'Laster team...' : 'Velg team'}
                </option>
                {createCanvasProjectOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>
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
            {deleteTarget?.type === 'frames' && isSavingCanvasItem && bulkDeleteProgress ? (
              <Alert variant="info" size="small">
                Sletter kort {bulkDeleteProgress.completed} av {bulkDeleteProgress.total}...
              </Alert>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="danger" onClick={onConfirmDeleteTarget} loading={isSavingCanvasItem}>
            {deleteTarget?.type === 'connection'
              ? 'Fjern kobling'
              : deleteTarget?.type === 'frames'
                ? isSavingCanvasItem && bulkDeleteProgress
                  ? `Sletter (${bulkDeleteProgress.completed}/${bulkDeleteProgress.total})`
                  : 'Fjern valgte'
                : 'Fjern kort'}
          </Button>
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
