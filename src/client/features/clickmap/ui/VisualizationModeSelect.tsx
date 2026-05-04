import { Select } from '@navikt/ds-react'
import { CLICKMAP_VISUALIZATION_MODE_OPTIONS, type VisualizationMode } from '../model/visualizationMode.ts'

type VisualizationModeSelectProps = {
  value: VisualizationMode | ''
  onChange: (nextMode: VisualizationMode | '') => void
  label?: string
  size?: 'medium' | 'small'
  className?: string
  disabled?: boolean
  allowNoneOption?: boolean
  noneOptionLabel?: string
}

const VisualizationModeSelect = ({
  value,
  onChange,
  label = 'Karttype',
  size = 'small',
  className,
  disabled = false,
  allowNoneOption = false,
  noneOptionLabel = 'Ingen karttype',
}: VisualizationModeSelectProps) => {
  return (
    <Select
      size={size}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as VisualizationMode | '')}
      className={className}
      disabled={disabled}
    >
      {allowNoneOption && <option value="">{noneOptionLabel}</option>}
      {CLICKMAP_VISUALIZATION_MODE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  )
}

export default VisualizationModeSelect
