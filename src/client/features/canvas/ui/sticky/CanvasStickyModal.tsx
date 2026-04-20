import { Alert, Button, Modal, Select, Textarea } from '@navikt/ds-react'
import type { CSSProperties } from 'react'
import type { CanvasStickyColorOption } from './CanvasStickyColorRegistry.ts'
import CanvasSectionPlacementSelect from '../controls/CanvasSectionPlacementSelect.tsx'

type CanvasStickyModalProps = {
  open: boolean
  value: string
  selectedColorId: string
  selectedSectionId: string
  sectionOptions: Array<{ id: string; label: string }>
  colorOptions: CanvasStickyColorOption[]
  error?: string | null
  isSaving?: boolean
  onChange: (value: string) => void
  onColorChange: (colorId: string) => void
  onSectionChange: (sectionId: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasStickyModal = ({
  open,
  value,
  selectedColorId,
  selectedSectionId,
  sectionOptions,
  colorOptions,
  error,
  isSaving = false,
  onChange,
  onColorChange,
  onSectionChange,
  onSubmit,
  onClose,
}: CanvasStickyModalProps) => {
  const selectedOption = colorOptions.find((option) => option.id === selectedColorId) ?? colorOptions[0]
  const stickyPreviewStyle = {
    backgroundColor: selectedOption?.background,
    borderColor: selectedOption?.border,
    '--sticky-modal-text': selectedOption?.text,
    '--sticky-modal-border': selectedOption?.border,
    '--sticky-modal-textarea-bg': selectedOption?.textareaBackground,
    '--sticky-modal-placeholder': selectedOption?.placeholder,
  } as CSSProperties

  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Legg til Post-it-lapp' }} width="small">
      <Modal.Body>
        <div className="space-y-3 rounded-xl border p-3" style={stickyPreviewStyle}>
          <Textarea
            id="canvas-sticky-modal-text"
            label="Tekst"
            minRows={6}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="[&_label]:text-[color:var(--sticky-modal-text)] [&_textarea]:border-[color:var(--sticky-modal-border)] [&_textarea]:bg-[color:var(--sticky-modal-textarea-bg)] [&_textarea]:text-[color:var(--sticky-modal-text)] [&_textarea::placeholder]:text-[color:var(--sticky-modal-placeholder)]"
          />
          {error && <Alert variant="error">{error}</Alert>}
        </div>
        <div className="mt-4 space-y-4">
          <Select
            label="Farge på lapp"
            value={selectedOption?.id ?? ''}
            onChange={(event) => onColorChange(event.target.value)}
          >
            {colorOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          <CanvasSectionPlacementSelect
            sectionOptions={sectionOptions}
            selectedSectionId={selectedSectionId}
            onSectionChange={onSectionChange}
          />
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
}

export default CanvasStickyModal
