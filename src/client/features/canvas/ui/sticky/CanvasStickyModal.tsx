import { Alert, Button, Modal, Textarea } from '@navikt/ds-react'
import type { CanvasStickyColorOption } from './CanvasStickyColorRegistry.ts'

type CanvasStickyModalProps = {
  open: boolean
  value: string
  selectedColorId: string
  colorOptions: CanvasStickyColorOption[]
  error?: string | null
  isSaving?: boolean
  onChange: (value: string) => void
  onColorChange: (colorId: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasStickyModal = ({
  open,
  value,
  selectedColorId,
  colorOptions,
  error,
  isSaving = false,
  onChange,
  onColorChange,
  onSubmit,
  onClose,
}: CanvasStickyModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading: 'Legg til Post-it-lapp' }} width="small">
    <Modal.Body>
      <div className="space-y-3 rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-3">
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-[var(--ax-text-default)]">Farge</div>
          <div className="flex flex-wrap gap-2">
            {colorOptions.map((option) => {
              const isSelected = selectedColorId === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onColorChange(option.id)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    isSelected ? 'border-[var(--ax-border-accent)]' : 'border-[var(--ax-border-neutral-subtle)]'
                  }`}
                  aria-label={`Velg farge ${option.label}`}
                  title={option.label}
                >
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 rounded-full border border-black/10"
                    style={{ backgroundColor: option.background }}
                  />
                </button>
              )
            })}
          </div>
        </div>
        <Textarea
          label="Tekst"
          minRows={6}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="[&_label]:text-[var(--ax-text-default)]"
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
