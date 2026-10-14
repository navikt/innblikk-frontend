import { useRef } from 'react'
import { Select, Modal, DatePicker, Button, useRangeDatepicker } from '@navikt/ds-react'
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
  className,
}: PeriodPickerProps) => {
  const dateModalRef = useRef<HTMLDialogElement>(null)
  const { isDateModalOpen, handlePeriodChange, closeDateModal } = usePeriodPicker(onPeriodChange)

  // useRangeDatepicker wires the inputs + popover + typing. Do NOT pass readOnly /
  // a manual `value` to DatePicker.Input — readOnly disables the calendar toggle
  // button entirely (inputs become "locked") and manual value fights hook state.
  const { datepickerProps, fromInputProps, toInputProps, selectedRange, setSelected } = useRangeDatepicker({
    defaultSelected: startDate && endDate ? { from: startDate, to: endDate } : undefined,
  })
  const canApply = Boolean(
    selectedRange?.from && selectedRange.to && selectedRange.to.getTime() >= selectedRange.from.getTime(),
  )

  return (
    <>
      <div className={className ?? 'w-full sm:w-auto min-w-[200px]'}>
        <Select
          label="Periode"
          size="small"
          value={period === 'custom' && startDate && endDate ? 'custom' : period}
          onChange={(event) => {
            if (event.target.value === 'custom' || event.target.value === 'custom-edit') {
              setSelected(startDate && endDate ? { from: startDate, to: endDate } : undefined)
            }
            handlePeriodChange(event)
          }}
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
            {/* strategy="fixed": popover escapes overflow clipping (AGENTS.md DatePicker gotcha) */}
            <DatePicker {...datepickerProps} strategy="fixed">
              <div className="flex flex-col gap-2">
                <DatePicker.Input
                  id="custom-start-date"
                  label="Fra dato"
                  aria-label="Fra dato"
                  size="small"
                  {...fromInputProps}
                />
                <DatePicker.Input
                  id="custom-end-date"
                  label="Til dato"
                  aria-label="Til dato"
                  size="small"
                  {...toInputProps}
                />
              </div>
            </DatePicker>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            onClick={() => {
              if (canApply && selectedRange?.from && selectedRange.to) {
                onStartDateChange(selectedRange.from)
                onEndDateChange(selectedRange.to)
                onPeriodChange('custom')
                closeDateModal()
              }
            }}
            disabled={!canApply}
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
