import { Alert, Button, Modal } from '@navikt/ds-react'
import CanvasIconPicker from './CanvasIconPicker.tsx'
import CanvasSectionPlacementSelect from '../controls/CanvasSectionPlacementSelect.tsx'

type CanvasIconColorOption = {
  id: string
  label: string
  value: string
}

type CanvasIconModalProps = {
  open: boolean
  heading: string
  selectedIconId: string
  selectedColor: string
  selectedSectionId?: string
  sectionOptions?: Array<{ id: string; label: string }>
  colorOptions: CanvasIconColorOption[]
  error?: string | null
  isSaving?: boolean
  submitLabel: string
  onSelectIcon: (iconId: string) => void
  onSelectColor: (color: string) => void
  onSectionChange?: (sectionId: string) => void
  onSubmit: () => void
  onClose: () => void
}

const CanvasIconModal = ({
  open,
  heading,
  selectedIconId,
  selectedColor,
  selectedSectionId = '',
  sectionOptions = [],
  colorOptions,
  error,
  isSaving = false,
  submitLabel,
  onSelectIcon,
  onSelectColor,
  onSectionChange = () => {},
  onSubmit,
  onClose,
}: CanvasIconModalProps) => {
  const resolveSwatchColor = (value: string): string =>
    value.trim().toLowerCase() === '#111111' ? 'var(--ax-text-default)' : value

  return (
    <Modal open={open} onClose={onClose} header={{ heading }} width="small">
      <Modal.Body>
        <div className="space-y-3">
          <CanvasIconPicker selectedIconId={selectedIconId} onSelectIcon={onSelectIcon} />
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
          {submitLabel}
        </Button>
        <Button variant="secondary" size="small" onClick={onClose}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default CanvasIconModal
