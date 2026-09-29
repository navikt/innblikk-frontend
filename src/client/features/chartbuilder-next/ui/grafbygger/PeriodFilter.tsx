import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { Filter } from '../../../../shared/types/chart.ts'
import ToggleOption from '../../../../shared/ui/ToggleOption.tsx'

const dashboardPeriodFilter: Filter = {
  column: 'created_at',
  operator: 'SPECIAL',
  value: '{{created_at}}',
  interactive: true,
  metabaseParam: true,
}

/**
 * Dashboard period override. ON (default): the chart keeps the {{created_at}}
 * placeholder and a dashboard date filter can override the period; the
 * results-pane "Periode" select provides the default range. OFF: the
 * placeholder is removed so the picker's dates are baked into the SQL —
 * dashboard date filters then have nothing to act on.
 *
 * The picker itself (results pane, next to URL-sti) is the single period
 * control either way; this toggle only governs whether dashboards may
 * override it.
 */
export default function PeriodOverrideOption({
  filters,
  setFilters,
}: {
  filters: Filter[]
  setFilters: Dispatch<SetStateAction<Filter[]>>
  maxDaysAvailable?: number
}) {
  const dashboardOverrideEnabled = filters.some((f) => f.column === 'created_at' && f.interactive === true)

  // Seed the {{created_at}} placeholder when no date filter exists — but only
  // when the user hasn't explicitly turned the override off (that also leaves
  // zero created_at filters, and must not be undone by this effect).
  const userDisabledRef = useRef(false)
  useEffect(() => {
    if (userDisabledRef.current) return
    if (filters.some((f) => f.column === 'created_at')) return
    setFilters((previous) =>
      previous.some((filter) => filter.column === 'created_at') ? previous : [...previous, dashboardPeriodFilter],
    )
  }, [filters, setFilters])

  return (
    <ToggleOption
      label="La dashboardet overstyre tidsperioden"
      description={
        dashboardOverrideEnabled
          ? 'Tidsperioden kan overstyres av et filter i dashboardet (standard)'
          : 'Valgt tidsperiode låses i grafen — dashboard-filter har ingen effekt'
      }
      checked={dashboardOverrideEnabled}
      onChange={(checked) => {
        userDisabledRef.current = !checked
        setFilters((previous) => {
          const withoutDate = previous.filter((filter) => filter.column !== 'created_at')
          return checked ? [...withoutDate, dashboardPeriodFilter] : withoutDate
        })
      }}
    />
  )
}
