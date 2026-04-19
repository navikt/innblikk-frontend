import { Select } from '@navikt/ds-react'

type CanvasSectionPlacementSelectProps = {
  sectionOptions: Array<{ id: string; label: string }>
  selectedSectionId: string
  onSectionChange: (sectionId: string) => void
  label?: string
}

const CanvasSectionPlacementSelect = ({
  sectionOptions,
  selectedSectionId,
  onSectionChange,
  label = 'Plassering',
}: CanvasSectionPlacementSelectProps) => {
  if (sectionOptions.length === 0) return null

  return (
    <Select
      id="canvas-section-placement"
      label={label}
      value={selectedSectionId}
      onChange={(event) => onSectionChange(event.target.value)}
    >
      <option value="">Plasser fritt</option>
      {sectionOptions.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </Select>
  )
}

export default CanvasSectionPlacementSelect
