import { Heading, DatePicker, Tabs, Button, Alert, TextField, Select } from '@navikt/ds-react'
import { format, startOfMonth, subMonths, startOfYear, subDays } from 'date-fns'
import type { Filter } from '../../../../shared/types/chart.ts'
import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react'

// Date range suggestions for quick date filtering
const DATE_RANGE_SUGGESTIONS = [
  {
    id: 'today',
    label: 'I dag',
    getRange: () => {
      const today = new Date()
      return {
        from: today,
        to: today,
      }
    },
  },
  {
    id: 'yesterday',
    label: 'I går',
    getRange: () => {
      const yesterday = subDays(new Date(), 1)
      return {
        from: yesterday,
        to: yesterday,
      }
    },
  },
  {
    id: 'thismonth',
    label: 'Denne måneden',
    getRange: () => ({
      from: startOfMonth(new Date()),
      to: new Date(),
    }),
  },
  {
    id: 'lastmonth',
    label: 'Forrige måned',
    getRange: () => {
      const today = new Date()
      const firstDayOfCurrentMonth = startOfMonth(today)
      const lastMonth = subMonths(firstDayOfCurrentMonth, 1)
      const endOfLastMonth = subDays(firstDayOfCurrentMonth, 1)
      return {
        from: lastMonth,
        to: endOfLastMonth,
      }
    },
  },
  {
    id: 'thisyear',
    label: 'I år',
    getRange: () => ({
      from: startOfYear(new Date()),
      to: new Date(),
    }),
  },
]

// Add dynamic date range options
const DYNAMIC_DATE_RANGES = [
  {
    id: 'last7days',
    label: 'Siste 7 dager',
    fromSQL: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)',
    toSQL: 'CURRENT_TIMESTAMP()',
  },
  {
    id: 'last30days',
    label: 'Siste 30 dager',
    fromSQL: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)',
    toSQL: 'CURRENT_TIMESTAMP()',
  },
  {
    id: 'today_dynamic',
    label: 'I dag',
    fromSQL: 'DATE_TRUNC(CURRENT_TIMESTAMP(), DAY)',
    toSQL: 'CURRENT_TIMESTAMP()',
  },
  {
    id: 'yesterday_dynamic',
    label: 'I går',
    fromSQL: 'DATE_TRUNC(DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY), DAY)',
    toSQL: 'DATE_SUB(DATE_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 1 SECOND)',
  },
  {
    id: 'this_week',
    label: 'Denne uken',
    fromSQL: 'DATE_TRUNC(CURRENT_TIMESTAMP(), WEEK(MONDAY))',
    toSQL: 'CURRENT_TIMESTAMP()',
  },
  {
    id: 'last_week',
    label: 'Forrige uke',
    fromSQL: 'TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)), INTERVAL 1 WEEK))',
    toSQL: 'TIMESTAMP(DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)))',
  },
  {
    id: 'thismonth_dynamic',
    label: 'Denne måneden',
    fromSQL: 'DATE_TRUNC(CURRENT_TIMESTAMP(), MONTH)',
    toSQL: 'CURRENT_TIMESTAMP()',
  },
  {
    id: 'lastmonth_dynamic',
    label: 'Forrige måned',
    fromSQL: 'TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH))',
    toSQL: 'TIMESTAMP(DATE_TRUNC(CURRENT_DATE(), MONTH))',
  },
  {
    id: 'thisyear_dynamic',
    label: 'I år',
    fromSQL: 'DATE_TRUNC(CURRENT_TIMESTAMP(), YEAR)',
    toSQL: 'CURRENT_TIMESTAMP()',
  },
  {
    id: 'lastyear_dynamic',
    label: 'I fjor',
    fromSQL: 'TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 1 YEAR))',
    toSQL: 'TIMESTAMP(DATE_TRUNC(CURRENT_DATE(), YEAR))',
  },
]

// Add time unit options
const TIME_UNITS = [
  { value: 'minute', label: 'Minutter' },
  { value: 'hour', label: 'Timer' },
  { value: 'day', label: 'Dager' },
  { value: 'week', label: 'Uker' },
  { value: 'month', label: 'Måneder' },
  { value: 'quarter', label: 'Kvartaler' },
  { value: 'year', label: 'År' },
]

interface DateRangePickerProps {
  filters: Filter[]
  setFilters: (filters: Filter[]) => void
  maxDaysAvailable: number
  selectedDateRange: string
  setSelectedDateRange: (range: string) => void
  customPeriodInputs: Record<number, { amount: string; unit: string }>
  setCustomPeriodInputs: (inputs: Record<number, { amount: string; unit: string }>) => void
  interactiveMode: boolean
  /**
   * When true, suppresses the heading and the inner bordered/padded box so the
   * content can be rendered inside an external container (e.g. ToggleOption panel).
   */
  bare?: boolean
}

interface DateRange {
  from: Date | undefined
  to?: Date | undefined
}

// Update the component parameters to include the new props
const DateRangeSelector = forwardRef(
  (
    {
      filters,
      setFilters,
      maxDaysAvailable,
      selectedDateRange,
      setSelectedDateRange,
      interactiveMode,
      bare = false,
    }: DateRangePickerProps,
    ref,
  ) => {
    // Calculate available date range
    const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined)
    // Add state for date mode (fixed vs dynamic)
    const [dateMode, setDateMode] = useState<'frequent' | 'dynamic' | 'fixed'>('frequent')
    const [selectedUnit, setSelectedUnit] = useState('day')
    // Change default value to 30 instead of 1
    const [numberOfUnits, setNumberOfUnits] = useState('30')

    const fromDate = useMemo(() => {
      if (!maxDaysAvailable) return undefined
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - maxDaysAvailable)
      return startDate
    }, [maxDaysAvailable])

    // Generate SQL for date range
    const generateDateRangeSQL = (from: Date, to: Date): { fromSQL: string; toSQL: string } => {
      const fromSql = `TIMESTAMP('${format(from, 'yyyy-MM-dd')}')`
      const toSql = `TIMESTAMP('${format(to, 'yyyy-MM-dd')}T23:59:59')`
      return { fromSQL: fromSql, toSQL: toSql }
    }

    // Function to generate SQL for previous periods - updated for better BigQuery compatibility
    const generatePreviousPeriodSQL = (amount: string, unit: string): { fromSQL: string; toSQL: string } => {
      // Handle different time units correctly for BigQuery
      switch (unit.toLowerCase()) {
        case 'minute':
          return {
            fromSQL: `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${amount} MINUTE)`,
            toSQL: `CURRENT_TIMESTAMP()`,
          }
        case 'hour':
          return {
            fromSQL: `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${amount} HOUR)`,
            toSQL: `CURRENT_TIMESTAMP()`,
          }
        case 'day':
          return {
            fromSQL: `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${amount} DAY)`,
            toSQL: `CURRENT_TIMESTAMP()`,
          }
        case 'week':
          // For weeks, we need to use DATE_SUB with DATE_TRUNC
          return {
            fromSQL: `TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL ${amount} WEEK))`,
            toSQL: `CURRENT_TIMESTAMP()`,
          }
        case 'month':
          // For months, use DATE_SUB with DATE_TRUNC
          return {
            fromSQL: `TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL ${amount} MONTH))`,
            toSQL: `CURRENT_TIMESTAMP()`,
          }
        case 'quarter':
          // For quarters (3 months)
          return {
            fromSQL: `TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL ${Number(amount) * 3} MONTH))`,
            toSQL: `CURRENT_TIMESTAMP()`,
          }
        case 'year':
          // For years, use DATE_SUB with DATE_TRUNC
          return {
            fromSQL: `TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL ${amount} YEAR))`,
            toSQL: `CURRENT_TIMESTAMP()`,
          }
        default:
          // Default to days if unit not recognized
          return {
            fromSQL: `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${amount} DAY)`,
            toSQL: `CURRENT_TIMESTAMP()`,
          }
      }
    }

    // Apply a custom date range picked from the calendar
    const applyCustomDateRange = (from: Date, to: Date) => {
      setSelectedDateRange('custom')

      // Generate SQL expressions
      const { fromSQL, toSQL } = generateDateRangeSQL(from, to)

      // Find existing date filters
      const filtersWithoutDate = filters.filter((f) => f.column !== 'created_at')

      // Create new date range filters
      const newFilters = [
        {
          column: 'created_at',
          operator: '>=',
          value: fromSQL,
          dateRangeType: 'custom',
        },
        {
          column: 'created_at',
          operator: '<=',
          value: toSQL,
          dateRangeType: 'custom',
        },
      ]

      // Update filters
      setFilters([...filtersWithoutDate, ...newFilters])
    }

    // Apply a preset date range
    const applyDateRange = (rangeId: string) => {
      if (rangeId === 'all') {
        setSelectedDateRange('all')
        setFilters(filters.filter((f) => f.column !== 'created_at'))
        setSelectedRange(undefined)
        return
      }

      if (selectedDateRange === rangeId) {
        setSelectedDateRange('all')
        setFilters(filters.filter((f) => f.column !== 'created_at'))
        setSelectedRange(undefined)
        return
      }

      // Handle fixed date ranges
      if (dateMode === 'fixed') {
        const dateRange = DATE_RANGE_SUGGESTIONS.find((dr) => dr.id === rangeId)
        if (!dateRange) return

        setSelectedDateRange(rangeId)

        // Get date range from the suggestion
        const range = dateRange.getRange()

        // Apply the range
        applyCustomDateRange(range.from, range.to)

        // Update the date picker UI
        setSelectedRange({
          from: range.from,
          to: range.to,
        })
      }
      // Handle dynamic date ranges
      else {
        const dynamicRange = DYNAMIC_DATE_RANGES.find((dr) => dr.id === rangeId)
        if (!dynamicRange) return

        setSelectedDateRange(rangeId)

        // Find existing date filters
        const filtersWithoutDate = filters.filter((f) => f.column !== 'created_at')

        // Create new dynamic date range filters
        const newFilters = [
          {
            column: 'created_at',
            operator: '>=',
            value: dynamicRange.fromSQL,
            dateRangeType: 'dynamic',
          },
          {
            column: 'created_at',
            operator: '<=',
            value: dynamicRange.toSQL,
            dateRangeType: 'dynamic',
          },
        ]

        // Update filters
        setFilters([...filtersWithoutDate, ...newFilters])

        // Clear the date picker UI since it's not relevant for dynamic dates
        setSelectedRange(undefined)
      }
    }

    const syncInteractiveModeFilters = (checked: boolean) => {
      if (checked) {
        // Remove existing date filters
        const filtersWithoutDate = filters.filter((f) => f.column !== 'created_at')

        // Add Metabase parameter filter
        setFilters([
          ...filtersWithoutDate,
          {
            column: 'created_at',
            operator: 'SPECIAL',
            value: '{{created_at}}',
            metabaseParam: true,
            interactive: true,
          },
        ])

        // Clear date range selection
        setSelectedDateRange('')
        setSelectedRange(undefined)
      } else {
        // Remove interactive date filter
        const filtersWithoutInteractive = filters.filter((f) => !(f.column === 'created_at' && f.interactive === true))
        setFilters(filtersWithoutInteractive)

        // Ensure we clear the current internal state
        setTimeout(() => {
          // Apply "All" by default when turning off interactive mode
          applyDateRange('all')
        }, 0)
      }
    }

    // Add function to clear date range
    const clearDateRange = () => {
      setSelectedRange(undefined)
      setSelectedDateRange('all')
      setDateMode('frequent') // Reset to default tab
      setFilters(filters.filter((f) => f.column !== 'created_at'))
      setSelectedUnit('day') // Reset unit selection
      setNumberOfUnits('1') // Reset number of units
    }

    // Add useEffect to watch for filter changes
    const hasDateFilter = useMemo(() => filters.some((f) => f.column === 'created_at'), [filters])

    useEffect(() => {
      if (!hasDateFilter && selectedRange) {
        const timer = window.setTimeout(() => {
          setSelectedRange(undefined)
        }, 0)
        return () => window.clearTimeout(timer)
      }
    }, [hasDateFilter, selectedRange])

    useEffect(() => {
      syncInteractiveModeFilters(interactiveMode)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interactiveMode])

    // Get message about available data range
    const getStartDateDisplay = (): string => {
      if (!maxDaysAvailable) return 'Velg nettside for å se tilgjengelig data.'

      const today = new Date()
      const startDate = new Date(today)
      startDate.setDate(today.getDate() - maxDaysAvailable)

      const day = String(startDate.getDate()).padStart(2, '0')
      const month = String(startDate.getMonth() + 1).padStart(2, '0')
      const year = startDate.getFullYear()

      return `Data er tilgjengelig fra ${day}.${month}.${year} til i dag.`
    }

    // Format dates for display in inputs
    const formatDate = (date: Date | undefined): string => {
      return date ? format(date, 'dd.MM.yyyy') : ''
    }

    // Expose clearDateRange to parent through ref
    useImperativeHandle(ref, () => ({
      clearDateRange: () => {
        setSelectedRange(undefined)
        setSelectedDateRange('all')
        setDateMode('frequent')
        setFilters(filters.filter((f) => f.column !== 'created_at'))
        setSelectedUnit('day')
        setNumberOfUnits('1')
      },
    }))

    const handleTabChange = (value: string) => {
      setDateMode(value as 'frequent' | 'dynamic' | 'fixed')
      // The Relative tab's filter is implicitly "active" the moment it's
      // selected — apply the current Antall/Periode values right away
      // instead of requiring an explicit "Bruk" click.
      if (value === 'dynamic' && !interactiveMode) {
        applyRelativePeriod(numberOfUnits, selectedUnit)
      }
    }

    /** Applies the "last N units" relative filter — called on every Antall/Periode change, no explicit "Bruk" needed. */
    const applyRelativePeriod = (amount: string, unit: string) => {
      const sql = generatePreviousPeriodSQL(amount, unit)
      const filtersWithoutDate = filters.filter((f) => f.column !== 'created_at')
      setFilters([
        ...filtersWithoutDate,
        {
          column: 'created_at',
          operator: '>=',
          value: sql.fromSQL,
          dateRangeType: 'dynamic',
        },
        {
          column: 'created_at',
          operator: '<=',
          value: sql.toSQL,
          dateRangeType: 'dynamic',
        },
      ])
    }

    return (
      <div className={bare ? undefined : 'mb-6 pt-2'}>
        {!bare && (
          <Heading level="3" size="xsmall" spacing>
            For hvilken tidsperiode?
          </Heading>
        )}

        <div className={bare ? undefined : 'mt-3 bg-[var(--ax-bg-default)] p-4 rounded-md border shadow-inner'}>
          {interactiveMode && (
            <Alert variant="info" size="small" className="mb-4">
              Mottaker velger datoperiode i Metabase. Slå av i Visningsvalg for å sette en fast standard her.
            </Alert>
          )}

          <fieldset disabled={interactiveMode} className={interactiveMode ? 'opacity-60' : undefined}>
            <Tabs value={dateMode} onChange={handleTabChange} size="small">
              <Tabs.List>
                <Tabs.Tab value="frequent" label="Ofte brukte" />
                <Tabs.Tab value="dynamic" label="Relative" />
                <Tabs.Tab value="fixed" label="Bestemte" />
              </Tabs.List>

              {/* Frequent dates panel */}
              <Tabs.Panel value="frequent" className="pt-6">
                <div className="flex flex-wrap gap-3">
                  {DYNAMIC_DATE_RANGES.map((period) => (
                    <Button
                      key={period.id}
                      variant={selectedDateRange === period.id ? 'primary' : 'secondary'}
                      size="small"
                      onClick={() => {
                        if (!interactiveMode) {
                          applyDateRange(period.id)
                        }
                      }}
                      disabled={interactiveMode}
                    >
                      {period.label}
                    </Button>
                  ))}
                  {/*<Button 
                variant={!hasDateFilter() || selectedDateRange === 'all' ? "primary" : "secondary"}
                size="small"
                onClick={() => applyDateRange('all')}
                disabled={interactiveMode}
              >
                Alt
              </Button>*/}
                </div>
              </Tabs.Panel>

              {/* Dynamic dates panel — "last N units", auto-applied on any change (no
                  "Bruk"/"Fjern" needed, this tab being selected IS the active filter).
                  The "current period" variant lived here too, but was redundant with
                  "Ofte brukte"'s own presets, so removed. */}
              <Tabs.Panel value="dynamic" className="pt-6">
                <div className="flex items-end gap-6">
                  <TextField
                    label="Antall"
                    type="number"
                    min={1}
                    size="small"
                    className="w-20"
                    value={numberOfUnits}
                    onChange={(e) => {
                      setNumberOfUnits(e.target.value)
                      if (!interactiveMode) {
                        applyRelativePeriod(e.target.value, selectedUnit)
                      }
                    }}
                  />
                  <Select
                    label="Periode"
                    size="small"
                    className="flex-1"
                    value={selectedUnit}
                    onChange={(e) => {
                      setSelectedUnit(e.target.value)
                      if (!interactiveMode) {
                        applyRelativePeriod(numberOfUnits, e.target.value)
                      }
                    }}
                  >
                    {TIME_UNITS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Tabs.Panel>

              {/* Fixed dates panel with DatePicker */}
              <Tabs.Panel value="fixed" className="pt-6">
                <DatePicker
                  mode="range"
                  selected={selectedRange}
                  onSelect={(range) => {
                    if (range) {
                      setSelectedRange(range)
                      if (range.from && range.to) {
                        applyCustomDateRange(range.from, range.to)
                      }
                    }
                  }}
                  fromDate={fromDate}
                  showWeekNumber
                >
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <DatePicker.Input
                        label="Fra dato"
                        id="date-from"
                        value={formatDate(selectedRange?.from)}
                        size="small"
                      />
                    </div>
                    <div>
                      <DatePicker.Input
                        label="Til dato"
                        id="date-to"
                        value={formatDate(selectedRange?.to)}
                        size="small"
                      />
                    </div>
                    {selectedRange?.from && (
                      <Button variant="tertiary" size="small" onClick={clearDateRange} className="mb-[2px]">
                        Fjern
                      </Button>
                    )}
                  </div>
                </DatePicker>
              </Tabs.Panel>
            </Tabs>
          </fieldset>

          {!interactiveMode && <div className="mt-5 text-sm text-[var(--ax-text-subtle)]">{getStartDateDisplay()}</div>}
        </div>
      </div>
    )
  },
)

export default DateRangeSelector
