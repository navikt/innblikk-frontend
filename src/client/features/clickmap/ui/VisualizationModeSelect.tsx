import { Select } from '@navikt/ds-react'
import { Events } from '@navikt/analytics-types'
import { trackEvent } from '../../../shared/lib/trackEvent.ts'
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
      onChange={(event) => {
        trackEvent(Events.NEDTREKKSLISTE_VALG_ENDRET, {
          seksjon: 'klikkart',
          komponentId: 'karttype',
          valgtVerdi: event.target.value,
        })
        onChange(event.target.value as VisualizationMode | '')
      }}
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
