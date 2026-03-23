import { useRef } from 'react'
import { Select, Modal, DatePicker, Button } from '@navikt/ds-react'
import { format } from 'date-fns'
import type { PeriodPickerProps } from '../model/types.ts'
import { formatDateRange } from '../utils/periodPicker.ts'
import { usePeriodPicker } from '../hooks/usePeriodPicker.ts'

export const PeriodPicker = ({
  period,
  onPeriodChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  lastMonthLabel = 'Forrige måned',
  currentMonthLabel = 'Denne måneden',
  showShortPeriods = true,
}: PeriodPickerProps) => {
  const dateModalRef = useRef<HTMLDialogElement>(null)
  const { isDateModalOpen, handlePeriodChange, closeDateModal } = usePeriodPicker(onPeriodChange)

  return (
    <>
      <div className="w-full sm:w-auto min-w-[200px]">
        <Select
          label="Periode"
          size="small"
          value={period === 'custom' && startDate && endDate ? 'custom' : period}
          onChange={handlePeriodChange}
        >
          {/* Period options in requested order */}
          {showShortPeriods && (
            <>
              <option value="today">I dag</option>
              <option value="yesterday">I går</option>
              <option value="this_week">Denne uken</option>
              <option value="last_7_days">Siste 7 dager</option>
              <option value="last_week">Forrige uke</option>
              <option value="last_28_days">Siste 28 dager</option>
            </>
          )}
          <option value="current_month">{currentMonthLabel}</option>
          <option value="last_month">{lastMonthLabel}</option>
          {period === 'custom' && startDate && endDate ? (
            <>
              <option value="custom">{formatDateRange(startDate, endDate)}</option>
              <option value="custom-edit">Endre datoer</option>
            </>
          ) : (
            <option value="custom">Egendefinert</option>
          )}
        </Select>
      </div>

      <Modal
        ref={dateModalRef}
        open={isDateModalOpen}
        onClose={closeDateModal}
        header={{ heading: 'Velg datoperiode', closeButton: true }}
      >
        <Modal.Body>
          <div className="flex flex-col gap-4">
            <DatePicker
              mode="range"
              selected={{ from: startDate, to: endDate }}
              onSelect={(range) => {
                if (range) {
                  onStartDateChange(range.from)
                  onEndDateChange(range.to)
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <DatePicker.Input
                  id="custom-start-date"
                  label="Fra dato"
                  size="small"
                  value={startDate ? format(startDate, 'dd.MM.yyyy') : ''}
                />
                <DatePicker.Input
                  id="custom-end-date"
                  label="Til dato"
                  size="small"
                  value={endDate ? format(endDate, 'dd.MM.yyyy') : ''}
                />
              </div>
            </DatePicker>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            onClick={() => {
              if (startDate && endDate) {
                onPeriodChange('custom')
                closeDateModal()
              }
            }}
            disabled={!startDate || !endDate}
          >
            Bruk datoer
          </Button>
          <Button type="button" variant="secondary" onClick={closeDateModal}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

export default PeriodPicker
