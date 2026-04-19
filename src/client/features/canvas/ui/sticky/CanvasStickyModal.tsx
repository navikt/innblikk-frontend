import { Alert, Button, Modal, Textarea } from '@navikt/ds-react'
import { useRef } from 'react'
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
  const colorButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const stickyPreviewStyle = {
    backgroundColor: selectedOption?.background,
    borderColor: selectedOption?.border,
    '--sticky-modal-text': selectedOption?.text,
    '--sticky-modal-border': selectedOption?.border,
    '--sticky-modal-textarea-bg': selectedOption?.textareaBackground,
    '--sticky-modal-placeholder': selectedOption?.placeholder,
  } as CSSProperties

  const selectedColorIndex = Math.max(
    0,
    colorOptions.findIndex((option) => option.id === selectedColorId),
  )

  const focusAndSelectColorByIndex = (nextIndex: number) => {
    const normalizedIndex = (nextIndex + colorOptions.length) % colorOptions.length
    const nextOption = colorOptions[normalizedIndex]
    if (!nextOption) return
    onColorChange(nextOption.id)
    colorButtonRefs.current[normalizedIndex]?.focus()
  }

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
          <div className="space-y-1.5 pt-2">
            <div
              id="canvas-sticky-color-group-label"
              className="text-sm font-medium text-[color:var(--sticky-modal-text)]"
            >
              Farge på lapp
            </div>
            <div
              role="radiogroup"
              aria-labelledby="canvas-sticky-color-group-label"
              className="flex flex-wrap gap-3"
              onKeyDown={(event) => {
                if (colorOptions.length <= 1) return
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  focusAndSelectColorByIndex(selectedColorIndex + 1)
                  return
                }
                if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  focusAndSelectColorByIndex(selectedColorIndex - 1)
                  return
                }
                if (event.key === 'Home') {
                  event.preventDefault()
                  focusAndSelectColorByIndex(0)
                  return
                }
                if (event.key === 'End') {
                  event.preventDefault()
                  focusAndSelectColorByIndex(colorOptions.length - 1)
                }
              }}
            >
              {colorOptions.map((option, index) => {
                const isSelected = selectedColorId === option.id
                return (
                  <div key={option.id} className="flex w-12 flex-col items-center gap-1">
                    <button
                      type="button"
                      ref={(element) => {
                        colorButtonRefs.current[index] = element
                      }}
                      onClick={() => onColorChange(option.id)}
                      className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition-shadow ${
                        isSelected
                          ? 'border-[var(--ax-border-accent)] shadow-[0_0_0_3px_var(--ax-bg-default),0_0_0_5px_var(--ax-border-accent)]'
                          : 'border-[var(--ax-border-neutral-subtle)]'
                      }`}
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={option.label}
                      tabIndex={isSelected ? 0 : -1}
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
                    <div className="text-center text-[11px] leading-tight text-[color:var(--sticky-modal-text)]">
                      {option.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {error && <Alert variant="error">{error}</Alert>}
        </div>
        <div className="mt-4">
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
