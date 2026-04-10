import type { Website } from '../../../../shared/types/website.ts'
import { Alert, Button, Modal, Switch, TextField } from '@navikt/ds-react'
import VisualizationModeSelect from '../../../clickmap/ui/VisualizationModeSelect.tsx'
import type { VisualizationMode } from '../../../clickmap/model/visualizationMode.ts'
import WebsitePicker from '../../../analysis/ui/WebsitePicker.tsx'

type CanvasWebsiteModalProps = {
  open: boolean
  isEdit: boolean
  selectedWebsite: Website | null
  pathValue: string
  renderEnabled: boolean
  visualizationMode: VisualizationMode | ''
  previewUrlValue: string
  error?: string | null
  isSaving?: boolean
  onWebsiteChange: (website: Website | null) => void
  onPathChange: (value: string) => void
  onRenderEnabledChange: (checked: boolean) => void
  onVisualizationModeChange: (mode: VisualizationMode | '') => void
  onPreviewUrlChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasWebsiteModal = ({
  open,
  isEdit,
  selectedWebsite,
  pathValue,
  renderEnabled,
  visualizationMode,
  previewUrlValue,
  error,
  isSaving = false,
  onWebsiteChange,
  onPathChange,
  onRenderEnabledChange,
  onVisualizationModeChange,
  onPreviewUrlChange,
  onSubmit,
  onClose,
}: CanvasWebsiteModalProps) => (
  <Modal
    open={open}
    onClose={onClose}
    header={{ heading: isEdit ? 'Rediger nettside' : 'Legg til nettside' }}
    width="small"
  >
    <Modal.Body>
      <div className="space-y-3">
        {!isEdit && (
          <WebsitePicker
            selectedWebsite={selectedWebsite}
            onWebsiteChange={onWebsiteChange}
            disableAutoRestore
            variant="default"
            customLabel="Velg nettside"
          />
        )}
        <TextField
          size="small"
          label="URL"
          value={pathValue}
          onChange={(event) => onPathChange(event.target.value)}
          autoFocus
        />
        <Switch size="small" checked={renderEnabled} onChange={(event) => onRenderEnabledChange(event.target.checked)}>
          Last inn nettsiden
        </Switch>
        <Switch
          size="small"
          checked={Boolean(visualizationMode)}
          onChange={(event) => onVisualizationModeChange(event.target.checked ? 'clickmap' : '')}
        >
          Legg til visualisering
        </Switch>
        {visualizationMode && (
          <>
            <VisualizationModeSelect
              value={visualizationMode}
              onChange={onVisualizationModeChange}
              size="small"
              label="Visualisering"
              allowNoneOption={isEdit}
              noneOptionLabel="Ingen"
            />
            <p className="text-xs text-[var(--ax-text-subtle)]">
              Velg hvordan klikkdata vises over nettsiden i kortet (klikkkart, varmekart eller scrollkart).
            </p>
          </>
        )}
        {!renderEnabled && (
          <TextField
            size="small"
            label="Valgfri visnings-URL"
            value={previewUrlValue}
            onChange={(event) => onPreviewUrlChange(event.target.value)}
            description="Vises i kortet i stedet for nettsiden. Kan være en bilde- eller innholdsside."
          />
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
    </Modal.Body>
    <Modal.Footer>
      <Button onClick={onSubmit} size="small" loading={isSaving}>
        {isEdit ? 'Lagre' : 'Legg til'}
      </Button>
      <Button variant="secondary" size="small" onClick={onClose}>
        Avbryt
      </Button>
    </Modal.Footer>
  </Modal>
)

export default CanvasWebsiteModal
