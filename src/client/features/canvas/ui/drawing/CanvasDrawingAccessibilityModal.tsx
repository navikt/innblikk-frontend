import { Alert, Button, Modal, Switch, TextField } from '@navikt/ds-react'

type CanvasDrawingAccessibilityModalProps = {
  open: boolean
  heading?: string
  submitLabel?: string
  isDecorative: boolean
  altTextValue: string
  error?: string | null
  isSaving?: boolean
  onDecorativeChange: (value: boolean) => void
  onAltTextChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasDrawingAccessibilityModal = ({
  open,
  heading = 'Beskriv tegning',
  submitLabel = 'Legg til',
  isDecorative,
  altTextValue,
  error,
  isSaving = false,
  onDecorativeChange,
  onAltTextChange,
  onSubmit,
  onClose,
}: CanvasDrawingAccessibilityModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading }} width="small">
    <Modal.Body>
      <div className="space-y-6">
        <TextField
          size="small"
          label="Alternativ tekst"
          description="Kort tekst som forklarer tegningen for skjermleser."
          value={altTextValue}
          onChange={(event) => onAltTextChange(event.target.value)}
          disabled={isDecorative}
          autoFocus
        />
        <Switch size="small" checked={isDecorative} onChange={(event) => onDecorativeChange(event.target.checked)}>
          Tegningen er dekorativ
        </Switch>
        {error ? <Alert variant="error">{error}</Alert> : null}
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

export default CanvasDrawingAccessibilityModal
