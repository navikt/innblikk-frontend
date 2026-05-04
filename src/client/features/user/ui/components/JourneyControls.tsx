import { TextField, Select, Button } from '@navikt/ds-react'
import type { Website } from '../../../../shared/types/chart'

interface JourneyControlsProps {
  startUrl: string
  onStartUrlChange: (value: string) => void
  steps: number
  onStepsChange: (value: number) => void
  limitInput: string
  onLimitInputChange: (value: string) => void
  onLimitBlur: () => void
  journeyDirection: string
  onDirectionChange: (value: string) => void
  onSearch: () => void
  selectedWebsite: Website | null
  hasUnappliedChanges: boolean
}

export default function JourneyControls({
  startUrl,
  onStartUrlChange,
  steps,
  onStepsChange,
  limitInput,
  onLimitInputChange,
  onLimitBlur,
  journeyDirection,
  onDirectionChange,
  onSearch,
  selectedWebsite,
  hasUnappliedChanges,
}: JourneyControlsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
      <div className="w-full sm:w-[300px]">
        <TextField
          label="URL-sti"
          placeholder="/eksempel eller eksempel eller https://..."
          value={startUrl}
          onChange={(e) => onStartUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch()
            }
          }}
        />
      </div>

      <div className="w-full sm:w-auto min-w-[150px]">
        <TextField
          label="Antall steg"
          type="number"
          value={steps}
          onChange={(e) => onStepsChange(parseInt(e.target.value) || 1)}
          min={1}
          max={20}
        />
      </div>

      <div className="w-full sm:w-auto min-w-[100px]">
        <TextField
          label="Grense"
          type="number"
          value={limitInput}
          onChange={(e) => onLimitInputChange(e.target.value)}
          onBlur={onLimitBlur}
          min={5}
          max={500}
        />
      </div>

      <div className="w-full sm:w-[100px]">
        <Select label="Retning" value={journeyDirection} onChange={(e) => onDirectionChange(e.target.value)}>
          <option value="forward">Fremover</option>
          <option value="backward">Bakover</option>
        </Select>
      </div>

      <div className="w-full sm:w-auto self-end pb-[2px]">
        <Button
          onClick={onSearch}
          disabled={!selectedWebsite || !startUrl.trim()}
          variant={hasUnappliedChanges ? 'primary' : 'secondary'}
        >
          {hasUnappliedChanges ? 'Søk (filtre endret)' : 'Søk'}
        </Button>
      </div>
    </div>
  )
}
