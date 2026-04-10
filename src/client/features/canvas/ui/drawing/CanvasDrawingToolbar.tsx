import { Button } from '@navikt/ds-react'
import { Undo2 } from 'lucide-react'

type CanvasColorOption = {
  id: string
  label: string
  value: string
}

type CanvasDrawingToolbarProps = {
  topOffsetPx: number
  colorOptions: CanvasColorOption[]
  strokeWidthOptions: number[]
  drawingStrokeColor: string
  drawingStrokeWidth: number
  hasAnyStroke: boolean
  onStrokeColorChange: (value: string) => void
  onStrokeWidthChange: (value: number) => void
  onComplete: () => Promise<void>
  onUndo: () => void
  onCancel: () => void
}

const CanvasDrawingToolbar = ({
  topOffsetPx,
  colorOptions,
  strokeWidthOptions,
  drawingStrokeColor,
  drawingStrokeWidth,
  hasAnyStroke,
  onStrokeColorChange,
  onStrokeWidthChange,
  onComplete,
  onUndo,
  onCancel,
}: CanvasDrawingToolbarProps) => (
  <div
    className="absolute left-1/2 z-[110] -translate-x-1/2 rounded-xl border border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] px-3 py-2 shadow-lg"
    style={{ top: `${topOffsetPx}px` }}
  >
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-[var(--ax-text-default)]">
        Tegnemodus: tegn flere strøk og velg Ferdig
      </span>
      <div className="flex items-center gap-1">
        {colorOptions.map((colorOption) => {
          const isSelected = drawingStrokeColor === colorOption.value
          return (
            <button
              key={colorOption.id}
              type="button"
              onClick={() => onStrokeColorChange(colorOption.value)}
              className={`h-6 w-6 rounded-full border-2 ${
                isSelected ? 'border-[var(--ax-border-accent)]' : 'border-[var(--ax-border-neutral-subtle)]'
              }`}
              aria-label={`Velg farge ${colorOption.label}`}
              title={colorOption.label}
            >
              <span
                aria-hidden="true"
                className="block h-full w-full rounded-full border border-black/10"
                style={{ backgroundColor: colorOption.value }}
              />
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-1 text-xs text-[var(--ax-text-subtle)]">
        <span>Tykkelse</span>
        <select
          value={String(drawingStrokeWidth)}
          onChange={(event) => onStrokeWidthChange(Number(event.target.value))}
          className="rounded border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-2 py-1 text-sm text-[var(--ax-text-default)]"
        >
          {strokeWidthOptions.map((strokeWidth) => (
            <option key={strokeWidth} value={String(strokeWidth)}>
              {strokeWidth}px
            </option>
          ))}
        </select>
      </label>
      <Button size="xsmall" onClick={() => void onComplete()}>
        Ferdig
      </Button>
      <Button size="xsmall" variant="secondary" onClick={onUndo} disabled={!hasAnyStroke} icon={<Undo2 size={14} />}>
        Angre
      </Button>
      <Button size="xsmall" variant="secondary" onClick={onCancel}>
        Avbryt
      </Button>
    </div>
  </div>
)

export default CanvasDrawingToolbar
