import { Alert, Button, Checkbox, Modal, Pagination, Select, Table, TextField } from '@navikt/ds-react'
import { useState } from 'react'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'

type CanvasAdminModalsProps = {
  isCanvasSettingsModalOpen: boolean
  onCloseCanvasSettings: () => void
  canvasSettingsInfo: string | null
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
    hasMore: boolean
    frames: Array<{ id: string; label: string }>
  }>
  onDeleteInventoryType: (params: { key: string; label: string; count: number }) => void
  onSelectInventoryFrames: (frameIds: string[]) => void
}

const CanvasAdminModals = ({
  isCanvasSettingsModalOpen,
  onCloseCanvasSettings,
  canvasSettingsInfo,
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
  const INVENTORY_PAGE_SIZE = 20
  const [selectedInventoryFrameIdsByType, setSelectedInventoryFrameIdsByType] = useState<Record<string, string[]>>({})
  const [inventoryPageByType, setInventoryPageByType] = useState<Record<string, number>>({})

  const closeInventory = () => {
    setSelectedInventoryFrameIdsByType({})
    setInventoryPageByType({})
    onCloseInventory()
  }

  const toggleSelectedInventoryFrame = (typeKey: string, frameId: string, checked: boolean) => {
    setSelectedInventoryFrameIdsByType((current) => {
      const currentFrameIds = current[typeKey] ?? []
      if (checked) {
        if (currentFrameIds.includes(frameId)) return current
        return { ...current, [typeKey]: [...currentFrameIds, frameId] }
      }
      return { ...current, [typeKey]: currentFrameIds.filter((id) => id !== frameId) }
    })
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
            {canvasSettingsInfo && (
              <Alert variant="info" size="small">
                {canvasSettingsInfo}
              </Alert>
            )}
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
              <Table size="small">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell />
                    <Table.HeaderCell scope="col">Type</Table.HeaderCell>
                    <Table.HeaderCell scope="col" align="right">
                      Antall
                    </Table.HeaderCell>
                    <Table.HeaderCell scope="col" align="right">
                      Handlinger
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {inventoryItems.map((item) => {
                    const selectedFrameIds = selectedInventoryFrameIdsByType[item.key] ?? []
                    const selectedFrameIdSet = new Set(selectedFrameIds)
                    const selectedCount = item.frames.filter((frame) => selectedFrameIdSet.has(frame.id)).length
                    const totalPages = Math.max(1, Math.ceil(item.frames.length / INVENTORY_PAGE_SIZE))
                    const requestedPage = inventoryPageByType[item.key] ?? 1
                    const currentPage = Math.min(requestedPage, totalPages)
                    const startIndex = (currentPage - 1) * INVENTORY_PAGE_SIZE
                    const paginatedFrames = item.frames.slice(startIndex, startIndex + INVENTORY_PAGE_SIZE)
                    const fromRow = item.frames.length === 0 ? 0 : startIndex + 1
                    const toRow = Math.min(startIndex + INVENTORY_PAGE_SIZE, item.frames.length)

                    return (
                      <Table.ExpandableRow
                        key={item.key}
                        togglePlacement="left"
                        content={
                          <div className="space-y-2 bg-[var(--ax-bg-neutral-soft)]">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="xsmall"
                                disabled={selectedCount === 0}
                                onClick={() => onSelectInventoryFrames(selectedFrameIds)}
                              >
                                Velg markerte {selectedCount > 0 ? `(${selectedCount})` : ''}
                              </Button>
                            </div>
                            <div className="overflow-auto rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]">
                              {item.frames.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                                  Ingen elementer av denne typen.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="px-3 pt-2 text-xs text-[var(--ax-text-subtle)]">
                                    {item.hasMore
                                      ? `Viser ${fromRow}-${toRow} av de første ${item.frames.length} elementene (totalt ${item.count}).`
                                      : `Viser ${fromRow}-${toRow} av ${item.frames.length}`}
                                  </div>
                                  <Table size="small">
                                    <Table.Header>
                                      <Table.Row>
                                        <Table.HeaderCell scope="col" className="w-20">
                                          Velg
                                        </Table.HeaderCell>
                                        <Table.HeaderCell scope="col">Element</Table.HeaderCell>
                                      </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                      {paginatedFrames.map((frame) => (
                                        <Table.Row key={frame.id}>
                                          <Table.DataCell>
                                            <Checkbox
                                              size="small"
                                              hideLabel
                                              checked={selectedFrameIdSet.has(frame.id)}
                                              onChange={(event) =>
                                                toggleSelectedInventoryFrame(item.key, frame.id, event.target.checked)
                                              }
                                            >
                                              Velg {frame.label || frame.id}
                                            </Checkbox>
                                          </Table.DataCell>
                                          <Table.HeaderCell scope="row" className="min-w-0">
                                            <div className="min-w-0">
                                              <div className="truncate text-sm text-[var(--ax-text-default)]">
                                                {frame.label || item.label}
                                              </div>
                                            </div>
                                          </Table.HeaderCell>
                                        </Table.Row>
                                      ))}
                                    </Table.Body>
                                  </Table>
                                  {totalPages > 1 && (
                                    <div className="flex justify-end px-2 pb-2">
                                      <Pagination
                                        page={currentPage}
                                        onPageChange={(page) =>
                                          setInventoryPageByType((current) => ({ ...current, [item.key]: page }))
                                        }
                                        count={totalPages}
                                        size="small"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        }
                      >
                        <Table.HeaderCell scope="row">{item.label}</Table.HeaderCell>
                        <Table.DataCell align="right">{item.count}</Table.DataCell>
                        <Table.DataCell align="right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="danger"
                              size="xsmall"
                              disabled={item.count === 0 || isSavingCanvasItem}
                              onClick={() =>
                                onDeleteInventoryType({
                                  key: item.key,
                                  label: item.label,
                                  count: item.count,
                                })
                              }
                            >
                              Slett alle
                            </Button>
                          </div>
                        </Table.DataCell>
                      </Table.ExpandableRow>
                    )
                  })}
                </Table.Body>
              </Table>
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
