import { Alert, Button, Modal } from '@navikt/ds-react'
import CanvasIllustrationPicker from './CanvasIllustrationPicker.tsx'

type CanvasIllustrationModalProps = {
  open: boolean
  isEdit: boolean
  selectedPath: string
  error?: string | null
  isSaving?: boolean
  onSelectPath: (path: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasIllustrationModal = ({
  open,
  isEdit,
  selectedPath,
  error,
  isSaving = false,
  onSelectPath,
  onSubmit,
  onClose,
}: CanvasIllustrationModalProps) => (
  <Modal
    open={open}
    onClose={onClose}
    header={{ heading: isEdit ? 'Rediger Nav-illustrasjon' : 'Legg til Nav-illustrasjon' }}
    width="small"
  >
    <Modal.Body>
      <div className="space-y-3">
        <CanvasIllustrationPicker selectedPath={selectedPath} onSelectPath={onSelectPath} />
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
