import { Alert, Select } from '@navikt/ds-react'
import { Events } from '@navikt/analytics-types'
import { trackEvent } from '../../../../shared/lib/trackEvent.ts'

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
  if (sectionOptions.length === 0) {
    return (
      <Alert variant="info" size="small">
        Tips: Seksjoner hjelper deg å strukturere innholdet. Opprett en seksjon før du legger til elementer.
      </Alert>
    )
  }

  return (
    <Select
      id="canvas-section-placement"
      label={label}
      value={selectedSectionId}
      onChange={(event) => {
        trackEvent(Events.NEDTREKKSLISTE_VALG_ENDRET, {
          seksjon: 'canvas',
          komponentId: 'seksjon-plassering',
          valgtVerdi: event.target.value,
        })
        onSectionChange(event.target.value)
      }}
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
