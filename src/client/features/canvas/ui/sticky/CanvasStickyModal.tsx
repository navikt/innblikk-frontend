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
}: CanvasStickyModalProps) => {
  const selectedOption = colorOptions.find((option) => option.id === selectedColorId) ?? colorOptions[0]

  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Legg til Post-it-lapp' }} width="small">
      <Modal.Body>
        <div
          className="space-y-3 rounded-xl border p-3"
          style={{
            backgroundColor: selectedOption?.background,
            borderColor: selectedOption?.border,
          }}
        >
          <Textarea
            id="canvas-sticky-modal-text"
            label="Tekst"
            minRows={6}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="[&_label]:text-[var(--ax-text-default)]"
          />
          <div className="space-y-1.5 pt-2">
            <div className="flex flex-wrap gap-3">
              {colorOptions.map((option) => {
                const isSelected = selectedColorId === option.id
                return (
                  <div key={option.id} className="flex w-12 flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onColorChange(option.id)}
                      className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition-shadow ${
                        isSelected
                          ? 'border-[var(--ax-border-accent)] shadow-[0_0_0_3px_var(--ax-bg-default),0_0_0_5px_var(--ax-border-accent)]'
                          : 'border-[var(--ax-border-neutral-subtle)]'
                      }`}
                      aria-label={`Velg farge ${option.label}`}
                      title={option.label}
                    >
                      <span
                        aria-hidden="true"
                        className="h-8 w-8 rounded-full border-2"
                        style={{
                          backgroundColor: option.background,
                          borderColor: option.border,
                        }}
                      />
                      {isSelected && (
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ax-border-accent)] text-[10px] font-bold text-white">
                          ✓
                        </span>
                      )}
                    </button>
                    <div className="text-center text-[11px] leading-tight text-[var(--ax-text-subtle)]">
                      {option.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
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
}

export default CanvasStickyModal
