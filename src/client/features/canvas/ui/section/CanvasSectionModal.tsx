import { Alert, BodyShort, Button, Modal, Radio, RadioGroup, TextField } from '@navikt/ds-react'
import type { CanvasSectionLayoutMode } from '../../model/types.ts'

type CanvasSectionModalProps = {
  open: boolean
  nameValue: string
  layoutMode: CanvasSectionLayoutMode
  heading?: string
  submitLabel?: string
  error?: string | null
  isSaving?: boolean
  onNameChange: (value: string) => void
  onLayoutModeChange: (value: CanvasSectionLayoutMode) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasSectionModal = ({
  open,
  nameValue,
  layoutMode,
  heading = 'Legg til seksjon',
  submitLabel = 'Legg til',
  error,
  isSaving = false,
  onNameChange,
  onLayoutModeChange,
  onSubmit,
  onClose,
}: CanvasSectionModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading }} width="small">
    <Modal.Body>
      <div className="space-y-4">
        <TextField label="Navn" value={nameValue} onChange={(event) => onNameChange(event.target.value)} autoFocus />
        <RadioGroup
          legend="Plassering av innhold"
          value={layoutMode}
          onChange={(value: string) => onLayoutModeChange(value as CanvasSectionLayoutMode)}
          size="small"
        >
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <Radio value="grid">Automatisk (rutenett)</Radio>
              <BodyShort size="small" className="pl-7 text-[var(--ax-text-subtle)]">
                Elementer plasseres automatisk i et rutenett
              </BodyShort>
            </div>
            <div className="space-y-1">
              <Radio value="freeform">Fritt (manuell plassering)</Radio>
              <BodyShort size="small" className="pl-7 text-[var(--ax-text-subtle)]">
                Du plasserer elementer selv
              </BodyShort>
            </div>
          </div>
        </RadioGroup>
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

export default CanvasSectionModal
