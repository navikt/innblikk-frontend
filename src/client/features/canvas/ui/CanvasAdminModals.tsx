import { Alert, Button, Modal, Select, TextField } from '@navikt/ds-react'
import { Fragment, useState } from 'react'
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
  isInventoryModalOpen: boolean
  onCloseInventory: () => void
  inventoryItems: Array<{
    key: string
    label: string
    count: number
    frameIds: string[]
    frames: Array<{ id: string; label: string }>
  }>
  onDeleteInventoryType: (params: { label: string; count: number; frameIds: string[] }) => void
  onSelectInventoryFrames: (frameIds: string[]) => void
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
  isInventoryModalOpen,
  onCloseInventory,
  inventoryItems,
  onDeleteInventoryType,
  onSelectInventoryFrames,
}: CanvasAdminModalsProps) => {
  const [expandedInventoryTypeKeys, setExpandedInventoryTypeKeys] = useState<string[]>([])
  const closeInventory = () => {
    setExpandedInventoryTypeKeys([])
    onCloseInventory()
  }

  const toggleExpandedInventoryType = (key: string) => {
    setExpandedInventoryTypeKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )
  }

  return (
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

      <Modal
        open={isInventoryModalOpen}
        onClose={closeInventory}
        header={{ heading: 'Elementoversikt' }}
        width="medium"
      >
        <Modal.Body>
          <div className="space-y-3">
            <p className="text-sm text-[var(--ax-text-subtle)]">
              Totalt antall elementer i aktiv fane:{' '}
              <strong>{inventoryItems.reduce((total, item) => total + item.count, 0)}</strong>
            </p>
            <div className="overflow-auto rounded-md border border-[var(--ax-border-neutral-subtle)]">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[var(--ax-bg-neutral-soft)] text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 text-right font-semibold">Antall</th>
                    <th className="px-3 py-2 text-right font-semibold">Handlinger</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryItems.map((item) => {
                    const isExpanded = expandedInventoryTypeKeys.includes(item.key)
                    return (
                      <Fragment key={item.key}>
                        <tr className="border-t border-[var(--ax-border-neutral-subtle)] align-top">
                          <td className="px-3 py-2 font-medium text-[var(--ax-text-default)]">{item.label}</td>
                          <td className="px-3 py-2 text-right text-[var(--ax-text-default)]">{item.count}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="xsmall"
                                disabled={item.count === 0}
                                onClick={() => toggleExpandedInventoryType(item.key)}
                              >
                                {isExpanded ? 'Skjul' : 'Vis'}
                              </Button>
                              <Button
                                variant="secondary"
                                size="xsmall"
                                disabled={item.count === 0}
                                onClick={() => onSelectInventoryFrames(item.frameIds)}
                              >
                                Velg alle
                              </Button>
                              <Button
                                variant="danger"
                                size="xsmall"
                                disabled={item.count === 0 || isSavingCanvasItem}
                                onClick={() =>
                                  onDeleteInventoryType({
                                    label: item.label,
                                    count: item.count,
                                    frameIds: item.frameIds,
                                  })
                                }
                              >
                                Slett alle
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t border-[var(--ax-border-neutral-subtle)]">
                            <td colSpan={3} className="bg-[var(--ax-bg-neutral-soft)] px-3 py-2">
                              {item.frames.length === 0 ? (
                                <div className="text-xs text-[var(--ax-text-subtle)]">
                                  Ingen elementer av denne typen.
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {item.frames.map((frame) => (
                                    <div key={frame.id} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="truncate text-[var(--ax-text-default)]">
                                        {frame.label || frame.id}
                                      </span>
                                      <Button
                                        variant="tertiary"
                                        size="xsmall"
                                        onClick={() => onSelectInventoryFrames([frame.id])}
                                      >
                                        Velg
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="small" onClick={closeInventory}>
            Lukk
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

export default CanvasAdminModals
