import { Alert, Button, Modal } from '@navikt/ds-react'
import CanvasIllustrationPicker from './CanvasIllustrationPicker.tsx'
import CanvasSectionPlacementSelect from '../controls/CanvasSectionPlacementSelect.tsx'

type CanvasIllustrationModalProps = {
  open: boolean
  isEdit: boolean
  selectedPath: string
  selectedSectionId?: string
  sectionOptions?: Array<{ id: string; label: string }>
  error?: string | null
  isSaving?: boolean
  onSelectPath: (path: string) => void
  onSectionChange?: (sectionId: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasIllustrationModal = ({
  open,
  isEdit,
  selectedPath,
  selectedSectionId = '',
  sectionOptions = [],
  error,
  isSaving = false,
  onSelectPath,
  onSectionChange = () => {},
  onSubmit,
  onClose,
}: CanvasIllustrationModalProps) => (
  <Modal
    open={open}
    onClose={onClose}
    header={{ heading: isEdit ? 'Rediger Nav-illustrasjon' : 'Legg til Nav-illustrasjon' }}
    width="medium"
  >
    <Modal.Body>
      <div className="space-y-3">
        <CanvasIllustrationPicker selectedPath={selectedPath} onSelectPath={onSelectPath} />
        {!isEdit && (
          <CanvasSectionPlacementSelect
            sectionOptions={sectionOptions}
            selectedSectionId={selectedSectionId}
            onSectionChange={onSectionChange}
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

export default CanvasIllustrationModal
