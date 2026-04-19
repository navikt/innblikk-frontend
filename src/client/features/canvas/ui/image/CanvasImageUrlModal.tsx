import { Alert, Button, Modal, TextField } from '@navikt/ds-react'
import CanvasSectionPlacementSelect from '../controls/CanvasSectionPlacementSelect.tsx'

type CanvasImageUrlModalProps = {
  open: boolean
  heading: string
  urlValue: string
  selectedSectionId?: string
  sectionOptions?: Array<{ id: string; label: string }>
  error?: string | null
  isSaving?: boolean
  submitLabel: string
  onUrlChange: (value: string) => void
  onSectionChange?: (sectionId: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasImageUrlModal = ({
  open,
  heading,
  urlValue,
  selectedSectionId = '',
  sectionOptions = [],
  error,
  isSaving = false,
  submitLabel,
  onUrlChange,
  onSectionChange = () => {},
  onSubmit,
  onClose,
}: CanvasImageUrlModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading }} width="small">
    <Modal.Body>
      <div className="space-y-3">
        <TextField
          size="small"
          label="Bilde-URL"
          value={urlValue}
          onChange={(event) => onUrlChange(event.target.value)}
          autoFocus
        />
        <CanvasSectionPlacementSelect
          sectionOptions={sectionOptions}
          selectedSectionId={selectedSectionId}
          onSectionChange={onSectionChange}
        />
        {error && <Alert variant="error">{error}</Alert>}
      </div>
    </Modal.Body>
    <Modal.Footer>
      <Button onClick={onSubmit} size="small" loading={isSaving}>
        {submitLabel}
      </Button>
      <Button variant="secondary" size="small" onClick={onClose}>
        Avbryt
      </Button>
    </Modal.Footer>
  </Modal>
)

export default CanvasImageUrlModal
