import { Alert, Button, Modal, Textarea } from '@navikt/ds-react'

type CanvasStickyModalProps = {
  open: boolean
  value: string
  error?: string | null
  isSaving?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasStickyModal = ({
  open,
  value,
  error,
  isSaving = false,
  onChange,
  onSubmit,
  onClose,
}: CanvasStickyModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading: 'Legg til Post-it-lapp' }} width="small">
    <Modal.Body>
      <div className="space-y-3 rounded-xl border border-[#f1dc7d] bg-[#fff5b8] p-3">
        <Textarea
          label="Tekst"
          minRows={6}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="[&_label]:text-[#4a3d00] [&_textarea]:border-[#e5cd69] [&_textarea]:bg-[#fff7ca] [&_textarea]:text-[#4a3d00] [&_textarea::placeholder]:text-[#7a6b2a]"
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

export default CanvasStickyModal
