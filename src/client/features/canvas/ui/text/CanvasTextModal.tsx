import { Alert, Button, Modal, Textarea } from '@navikt/ds-react'
import CanvasSectionPlacementSelect from '../controls/CanvasSectionPlacementSelect.tsx'

type CanvasTextModalProps = {
  open: boolean
  value: string
  selectedSectionId?: string
  sectionOptions?: Array<{ id: string; label: string }>
  error?: string | null
  isSaving?: boolean
  onChange: (value: string) => void
  onSectionChange?: (sectionId: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasTextModal = ({
  open,
  value,
  selectedSectionId = '',
  sectionOptions = [],
  error,
  isSaving = false,
  onChange,
  onSectionChange = () => {},
  onSubmit,
  onClose,
}: CanvasTextModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading: 'Legg til tekst' }} width="small">
    <Modal.Body>
      <div className="space-y-3">
        <Textarea label="Tekst" minRows={6} value={value} onChange={(event) => onChange(event.target.value)} />
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
        Legg til
      </Button>
      <Button variant="secondary" size="small" onClick={onClose}>
        Avbryt
      </Button>
    </Modal.Footer>
  </Modal>
)

export default CanvasTextModal
