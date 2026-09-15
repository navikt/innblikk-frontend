import { Button, TextField, Label, Accordion } from '@navikt/ds-react'
import { CogIcon } from '@navikt/aksel-icons'
import type { ChangeEvent } from 'react'

interface AdvancedOptionsProps {
  dateRangeInDays: number
  tempDateRangeInDays: number
  maxDaysAvailable: number
  setTempDateRangeInDays: (days: number) => void
  handleDateRangeChange: () => void
}

const AdvancedOptions: React.FC<AdvancedOptionsProps> = ({
  dateRangeInDays,
  tempDateRangeInDays,
  maxDaysAvailable,
  setTempDateRangeInDays,
  handleDateRangeChange,
}) => {
  return (
    <Accordion>
      <Accordion.Item>
        <Accordion.Header>
          <div className="flex items-center gap-2">
            <CogIcon aria-hidden="true" />
            <span>Avanserte valg</span>
          </div>
        </Accordion.Header>
        <Accordion.Content>
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <Label as="p">Datointervall</Label>
                <p className="text-sm text-[var(--ax-text-subtle)] mt-1">
                  Velg hvor mange dager bakover du vil se data for
                </p>
              </div>
              <div className="flex items-end gap-2">
                <TextField
                  label="Antall dager"
                  type="number"
                  size="small"
                  value={tempDateRangeInDays}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const val = parseInt(e.target.value, 10)
                    setTempDateRangeInDays(isNaN(val) ? 1 : val)
                  }}
                  min={1}
                  max={maxDaysAvailable}
                  className="w-24"
                />
                <Button variant="secondary" size="small" onClick={handleDateRangeChange} style={{ height: '42px' }}>
                  Endre
                </Button>
              </div>
            </div>

            <div className="text-sm text-[var(--ax-text-subtle)]">
              <p>
                Ser på data for de siste {dateRangeInDays} dagene
                {maxDaysAvailable > 0 && ` (maks ${maxDaysAvailable} dager tilgjengelig)`}
              </p>
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  )
}

export default AdvancedOptions
