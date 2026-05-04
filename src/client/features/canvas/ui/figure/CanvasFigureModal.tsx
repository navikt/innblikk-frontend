import type { ComponentType } from 'react'
import { Alert, Button, Modal } from '@navikt/ds-react'

type FigureIconProps = {
  size?: number
  'aria-hidden'?: boolean
}

type CanvasFigureOption = {
  id: string
  label: string
  Icon: ComponentType<FigureIconProps>
}

type CanvasIconColorOption = {
  id: string
  label: string
  value: string
}

type CanvasFigureModalProps = {
  open: boolean
  isEdit: boolean
  selectedType: string
  selectedColor: string
  figureOptions: CanvasFigureOption[]
  colorOptions: CanvasIconColorOption[]
  error?: string | null
  isSaving?: boolean
  onSelectType: (type: string) => void
  onSelectColor: (color: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasFigureModal = ({
  open,
  isEdit,
  selectedType,
  selectedColor,
  figureOptions,
  colorOptions,
  error,
  isSaving = false,
  onSelectType,
  onSelectColor,
  onSubmit,
  onClose,
}: CanvasFigureModalProps) => {
  const resolveSwatchColor = (value: string): string =>
    value.trim().toLowerCase() === '#111111' ? 'var(--ax-text-default)' : value

  return (
    <Modal
      open={open}
      onClose={onClose}
      header={{ heading: isEdit ? 'Rediger figur' : 'Legg til figur' }}
      width="small"
    >
      <Modal.Body>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-[var(--ax-text-default)]">Figurtype</div>
            <div className="grid grid-cols-2 gap-2">
              {figureOptions.map((figureOption) => {
                const isSelected = selectedType === figureOption.id
                const FigureIcon = figureOption.Icon
                return (
                  <button
                    key={figureOption.id}
                    type="button"
                    onClick={() => onSelectType(figureOption.id)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left ${
                      isSelected
                        ? 'border-[var(--ax-border-accent)] bg-[var(--ax-bg-accent-soft)]'
                        : 'border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]'
                    }`}
                  >
                    <FigureIcon size={16} aria-hidden={true} />
                    <span className="text-sm text-[var(--ax-text-default)]">{figureOption.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-[var(--ax-text-default)]">Farge</div>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((colorOption) => {
                const isSelected = selectedColor === colorOption.value
                return (
                  <button
                    key={colorOption.id}
                    type="button"
                    onClick={() => onSelectColor(colorOption.value)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                      isSelected ? 'border-[var(--ax-border-accent)]' : 'border-[var(--ax-border-neutral-subtle)]'
                    }`}
                    aria-label={`Velg farge ${colorOption.label}`}
                    title={colorOption.label}
                  >
                    <span
                      aria-hidden="true"
                      className="h-5 w-5 rounded-full border border-black/10"
                      style={{ backgroundColor: resolveSwatchColor(colorOption.value) }}
                    />
                  </button>
                )
              })}
            </div>
          </div>
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
}

export default CanvasFigureModal
