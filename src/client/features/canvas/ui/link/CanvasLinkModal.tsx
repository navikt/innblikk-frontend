import { Alert, Button, Modal, TextField, Textarea } from '@navikt/ds-react'
import CanvasSectionPlacementSelect from '../controls/CanvasSectionPlacementSelect.tsx'

type CanvasLinkModalProps = {
  open: boolean
  titleValue: string
  hrefValue: string
  descriptionValue: string
  selectedSectionId?: string
  sectionOptions?: Array<{ id: string; label: string }>
  error?: string | null
  isSaving?: boolean
  onTitleChange: (value: string) => void
  onHrefChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onSectionChange?: (sectionId: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasLinkModal = ({
  open,
  titleValue,
  hrefValue,
  descriptionValue,
  selectedSectionId = '',
  sectionOptions = [],
  error,
  isSaving = false,
  onTitleChange,
  onHrefChange,
  onDescriptionChange,
  onSectionChange = () => {},
  onSubmit,
  onClose,
}: CanvasLinkModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading: 'Legg til lenke' }} width="small">
    <Modal.Body>
      <div className="space-y-3">
        <TextField
          label="Tittel"
          value={titleValue}
          onChange={(event) => onTitleChange(event.target.value)}
          autoFocus
        />
        <TextField label="URL" value={hrefValue} onChange={(event) => onHrefChange(event.target.value)} />
        <Textarea
          label="Beskrivelse (valgfri)"
          minRows={3}
          value={descriptionValue}
          onChange={(event) => onDescriptionChange(event.target.value)}
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
        Legg til
      </Button>
      <Button variant="secondary" size="small" onClick={onClose}>
        Avbryt
      </Button>
    </Modal.Footer>
  </Modal>
)

export default CanvasLinkModal
