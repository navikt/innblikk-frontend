import { Alert, Button, Modal, Select, TextField } from '@navikt/ds-react'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'
import type { Website } from '../../../shared/types/website.ts'

type CanvasAdminModalsProps = {
  isCanvasSettingsModalOpen: boolean
  onCloseCanvasSettings: () => void
  selectedWebsite: Website | null
  onSelectedWebsiteChange: (website: Website | null) => void
  renameCanvasInput: string
  onRenameCanvasInputChange: (value: string) => void
  renameCanvasError: string | null
  onRenameCanvas: () => void
  isSavingCanvasItem: boolean
  isCreateTabModalOpen: boolean
  onCloseCreateTab: () => void
  newTabName: string
  onNewTabNameChange: (value: string) => void
  createTabError: string | null
  onCreateTab: () => void
  creatingTab: boolean
  isManageTabsModalOpen: boolean
  onCloseManageTabs: () => void
  manageTabId: string
  onManageTabSelect: (tabId: string) => void
  manageTabName: string
  onManageTabNameChange: (value: string) => void
  manageTabError: string | null
  canvasCategories: GraphCategoryDto[]
  getCanvasCategoryDisplayName: (name?: string) => string
  selectedManageTabInfoText: string | null
  savingManageTab: boolean
  deletingManageTab: boolean
  canSaveManageTab: boolean
  canDeleteManageTab: boolean
  onRenameTab: () => void
  onDeleteTab: () => void
}

const CanvasAdminModals = ({
  isCanvasSettingsModalOpen,
  onCloseCanvasSettings,
  selectedWebsite,
  onSelectedWebsiteChange,
  renameCanvasInput,
  onRenameCanvasInputChange,
  renameCanvasError,
  onRenameCanvas,
  isSavingCanvasItem,
  isCreateTabModalOpen,
  onCloseCreateTab,
  newTabName,
  onNewTabNameChange,
  createTabError,
  onCreateTab,
  creatingTab,
  isManageTabsModalOpen,
  onCloseManageTabs,
  manageTabId,
  onManageTabSelect,
  manageTabName,
  onManageTabNameChange,
  manageTabError,
  canvasCategories,
  getCanvasCategoryDisplayName,
  selectedManageTabInfoText,
  savingManageTab,
  deletingManageTab,
  canSaveManageTab,
  canDeleteManageTab,
  onRenameTab,
  onDeleteTab,
}: CanvasAdminModalsProps) => (
  <>
    <Modal
      open={isCanvasSettingsModalOpen}
      onClose={onCloseCanvasSettings}
      header={{ heading: 'Canvas-innstillinger' }}
      width="small"
    >
      <Modal.Body>
        <div className="space-y-3">
          <WebsitePicker
            selectedWebsite={selectedWebsite}
            onWebsiteChange={onSelectedWebsiteChange}
            disableAutoRestore
            variant="default"
            customLabel="Nettside"
          />
          <TextField
            label="Canvas-navn"
            value={renameCanvasInput}
            onChange={(event) => onRenameCanvasInputChange(event.target.value)}
          />
          {renameCanvasError && <Alert variant="error">{renameCanvasError}</Alert>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onRenameCanvas} size="small" loading={isSavingCanvasItem}>
          Lagre
        </Button>
        <Button variant="secondary" size="small" onClick={onCloseCanvasSettings}>
          Lukk
        </Button>
      </Modal.Footer>
    </Modal>

    <Modal open={isCreateTabModalOpen} onClose={onCloseCreateTab} header={{ heading: 'Legg til fane' }} width="small">
      <Modal.Body>
        <div className="space-y-3">
          <TextField
            label="Fanenavn"
            value={newTabName}
            onChange={(event) => onNewTabNameChange(event.target.value)}
            autoFocus
          />
          {createTabError && <Alert variant="error">{createTabError}</Alert>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onCreateTab} size="small" loading={creatingTab}>
          Legg til
        </Button>
        <Button variant="secondary" size="small" onClick={onCloseCreateTab} disabled={creatingTab}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>

    <Modal
      open={isManageTabsModalOpen}
      onClose={onCloseManageTabs}
      header={{ heading: 'Administrer faner' }}
      width="small"
    >
      <Modal.Body>
        <div className="space-y-3">
          <Select
            label="Hvilken fane vil du endre?"
            value={manageTabId}
            onChange={(event) => onManageTabSelect(event.target.value)}
            disabled={savingManageTab || deletingManageTab || canvasCategories.length === 0}
          >
            <option value="" disabled>
              {canvasCategories.length === 0 ? 'Ingen faner funnet' : 'Velg fane'}
            </option>
            {canvasCategories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {getCanvasCategoryDisplayName(category.name)}
              </option>
            ))}
          </Select>
          <TextField
            label="Fanenavn"
            value={manageTabName}
            onChange={(event) => onManageTabNameChange(event.target.value)}
            disabled={savingManageTab || deletingManageTab || canvasCategories.length === 0}
          />
          {selectedManageTabInfoText && (
            <div className="text-sm text-[var(--ax-text-subtle)]">{selectedManageTabInfoText}</div>
          )}
          {manageTabError && <Alert variant="error">{manageTabError}</Alert>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onRenameTab} size="small" loading={savingManageTab} disabled={!canSaveManageTab}>
          Lagre navn
        </Button>
        <Button
          variant="danger"
          size="small"
          onClick={onDeleteTab}
          loading={deletingManageTab}
          disabled={!canDeleteManageTab}
        >
          Slett fane
        </Button>
        <Button
          variant="secondary"
          size="small"
          onClick={onCloseManageTabs}
          disabled={savingManageTab || deletingManageTab}
        >
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  </>
)

export default CanvasAdminModals
