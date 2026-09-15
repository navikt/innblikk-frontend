import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { Filter } from '../../../../shared/types/chart.ts'
import ToggleOption from '../../../../shared/ui/ToggleOption.tsx'
import DateRangeSelector from './DateRangeSelector.tsx'

const dashboardPeriodFilter: Filter = {
  column: 'created_at',
  operator: 'SPECIAL',
  value: '{{created_at}}',
  interactive: true,
  metabaseParam: true,
}

const defaultOverrideFilters: Filter[] = [
  {
    column: 'created_at',
    operator: '>=',
    value: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)',
    dateRangeType: 'dynamic',
  },
  {
    column: 'created_at',
    operator: '<=',
    value: 'CURRENT_TIMESTAMP()',
    dateRangeType: 'dynamic',
  },
]

export default function PeriodOverrideOption({
  filters,
  setFilters,
  maxDaysAvailable,
}: {
  filters: Filter[]
  setFilters: Dispatch<SetStateAction<Filter[]>>
  maxDaysAvailable: number
}) {
  const dateFilters = filters.filter((filter) => filter.column === 'created_at')
  const useSelectedPeriod = dateFilters.some((filter) => !filter.interactive)
  const [selectedDateRange, setSelectedDateRange] = useState('last7days')
  const [customPeriodInputs, setCustomPeriodInputs] = useState<Record<number, { amount: string; unit: string }>>({})

  useEffect(() => {
    if (dateFilters.length) return
    setFilters((previous) =>
      previous.some((filter) => filter.column === 'created_at') ? previous : [...previous, dashboardPeriodFilter],
    )
  }, [dateFilters.length, setFilters])

  return (
    <ToggleOption
      label="Overstyr tidsperiode"
      description={
        useSelectedPeriod
          ? 'Bruker valgt tidsperiode fra grafbyggeren som standard'
          : 'Tidsperioden velges via filter i dashboardet (standard)'
      }
      checked={useSelectedPeriod}
      onChange={(checked) => {
        setSelectedDateRange('last7days')
        const next = checked ? defaultOverrideFilters : [dashboardPeriodFilter]
        setFilters((previous) => [...previous.filter((filter) => filter.column !== 'created_at'), ...next])
      }}
    >
      <DateRangeSelector
        filters={filters}
        setFilters={(next) => setFilters(next)}
        maxDaysAvailable={maxDaysAvailable}
        selectedDateRange={selectedDateRange}
        setSelectedDateRange={setSelectedDateRange}
        customPeriodInputs={customPeriodInputs}
        setCustomPeriodInputs={setCustomPeriodInputs}
        interactiveMode={false}
        bare
      />
    </ToggleOption>
  )
}
