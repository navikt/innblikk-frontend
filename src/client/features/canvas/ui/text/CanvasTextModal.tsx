import { Alert, Button, Modal, Textarea } from '@navikt/ds-react'

type CanvasTextModalProps = {
  open: boolean
  value: string
  error?: string | null
  isSaving?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasTextModal = ({
  open,
  value,
  error,
  isSaving = false,
  onChange,
  onSubmit,
  onClose,
}: CanvasTextModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading: 'Legg til tekst' }} width="small">
    <Modal.Body>
      <div className="space-y-3">
        <Textarea label="Tekst" minRows={6} value={value} onChange={(event) => onChange(event.target.value)} />
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
