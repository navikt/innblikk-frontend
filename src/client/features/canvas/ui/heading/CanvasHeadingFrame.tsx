type CanvasHeadingFrameProps = {
  id: string
  headingText?: string
  label: string
  fontSizePx: number
  isEditing: boolean
  onChange: (id: string, nextValue: string) => void
  onBlur: (id: string) => void
  onStartEditing: (id: string) => void
}

const CanvasHeadingFrame = ({
  id,
  headingText,
  label,
  fontSizePx,
  isEditing,
  onChange,
  onBlur,
  onStartEditing,
}: CanvasHeadingFrameProps) => {
  if (isEditing) {
    return (
      <div className="overflow-visible pt-0 pr-0 pb-0">
        <textarea
          value={headingText || ''}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          lang="nb-NO"
          placeholder="Skriv overskrift"
          className="block w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
          style={{
            fontSize: `${fontSizePx}px`,
            lineHeight: 1.05,
            fontWeight: 700,
          }}
          rows={1}
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className="overflow-visible pt-0 pr-0 pb-0">
      <h2
        className="cursor-text select-text whitespace-pre-wrap break-words text-[var(--ax-text-default)] m-0"
        onClick={() => onStartEditing(id)}
        style={{
          fontSize: `${fontSizePx}px`,
          lineHeight: 1.05,
          fontWeight: 700,
        }}
      >
        {headingText || label || 'Skriv overskrift'}
      </h2>
    </div>
  )
}

export default CanvasHeadingFrame
