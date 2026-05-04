import { Select, TextField } from '@navikt/ds-react'
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { ColumnGroup, OrderBy, Metric, Filter } from '../../../../shared/types/chart.ts'
import DateRangeSelector from './DateRangeSelector.tsx'
import ToggleOption from '../../../../shared/ui/ToggleOption.tsx'

interface DisplayOptionsProps {
  groupByFields: string[]
  orderBy: OrderBy | null
  columnOrderMode: 'default' | 'metrics_first'
  paramAggregation: 'representative' | 'unique'
  limit: number | null
  COLUMN_GROUPS: Record<string, ColumnGroup>
  setOrderBy: (column: string, direction: 'ASC' | 'DESC') => void
  clearOrderBy: () => void
  setDateFormat: (format: string) => void
  setParamAggregation: (strategy: 'representative' | 'unique') => void
  setLimit: (limit: number | null) => void
  setColumnOrderMode: (mode: 'default' | 'metrics_first') => void
  metrics: Metric[]
  filters: Filter[]
  setFilters: (filters: Filter[]) => void
  maxDaysAvailable: number

  interactiveMode: boolean
  setInteractiveMode: (mode: boolean) => void
}

const DisplayOptions = forwardRef(
  (
    {
      groupByFields,
      orderBy,
      columnOrderMode,
      limit,
      COLUMN_GROUPS,
      setOrderBy,
      clearOrderBy,
      setDateFormat,
      setParamAggregation,
      setLimit,
      setColumnOrderMode,
      metrics,
      filters,
      setFilters,
      maxDaysAvailable,
      interactiveMode,
      setInteractiveMode,
    }: DisplayOptionsProps,
    ref,
  ) => {
    const [showCustomSort, setShowCustomSort] = useState<boolean>(false)
    const [showCustomLimit, setShowCustomLimit] = useState<boolean>(false)
    const [limitInput, setLimitInput] = useState<string>('')
    const [customPeriodInputs, setCustomPeriodInputs] = useState<Record<number, { amount: string; unit: string }>>({})
    const [selectedDateRange, setSelectedDateRange] = useState<string>('last7days')

    const resetOptions = (silent = false) => {
      void silent
      clearOrderBy()
      setDateFormat('day')
      setLimit(1000)
      setColumnOrderMode('default')
      setParamAggregation('unique')
      setShowCustomSort(false)
      setShowCustomLimit(false)
      setLimitInput('1000')
    }

    useImperativeHandle(ref, () => ({
      resetOptions,
    }))

    useEffect(() => {
      setLimitInput(limit?.toString() || '')
    }, [limit])

    useEffect(() => {
      setShowCustomSort(Boolean(orderBy))
    }, [orderBy])

    return (
      <>
        <div className="flex flex-col gap-4 pb-2">
          <ToggleOption
            label="Overstyr tidsperiode"
            description={
              interactiveMode
                ? 'Tidsperiode velges via filter i dasboardet (standard)'
                : 'Bruk valgt tidsperiode fra grafbyggeren som standard'
            }
            checked={!interactiveMode}
            onChange={(checked) => setInteractiveMode(!checked)}
          >
            <DateRangeSelector
              filters={filters}
              setFilters={setFilters}
              maxDaysAvailable={maxDaysAvailable}
              selectedDateRange={selectedDateRange}
              setSelectedDateRange={setSelectedDateRange}
              customPeriodInputs={customPeriodInputs}
              setCustomPeriodInputs={setCustomPeriodInputs}
              interactiveMode={interactiveMode}
              bare
            />
          </ToggleOption>

          <ToggleOption
            label="Tilpass sortering"
            description={
              orderBy
                ? `Sorterer etter ${orderBy.column ? orderBy.column.toLowerCase() : 'første kolonne'} i ${orderBy.direction === 'ASC' ? 'stigende' : 'synkende'} rekkefølge`
                : 'Sorterer etter første kolonne i synkende rekkefølge'
            }
            checked={showCustomSort}
            onChange={(checked) => {
              setShowCustomSort(checked)
              if (!checked) {
                clearOrderBy()
              }
            }}
          >
            <div className="flex gap-2">
              <Select
                label="Sorter etter"
                value={orderBy?.column || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    const direction = e.target.value === 'dato' ? 'ASC' : 'DESC'
                    setOrderBy(e.target.value, direction)
                  } else {
                    clearOrderBy()
                  }
                }}
                size="small"
                className="flex-grow"
              >
                <option value="">Standard sortering</option>
                <optgroup label="Grupperinger">
                  {groupByFields.map((field) => {
                    const column = Object.values(COLUMN_GROUPS)
                      .flatMap((group) => group.columns)
                      .find((col) => col.value === field)

                    return (
                      <option key={field} value={field === 'created_at' ? 'dato' : field}>
                        {field === 'created_at' ? 'Dato' : column?.label || field}
                      </option>
                    )
                  })}
                </optgroup>
                <optgroup label="Metrikker">
                  {metrics.map((metric, index) => (
                    <option key={`metrikk_${index}`} value={metric.alias || `metrikk_${index + 1}`}>
                      {metric.alias || `metrikk_${index + 1}`}
                    </option>
                  ))}
                </optgroup>
              </Select>

              <Select
                label="Retning"
                value={orderBy?.direction || 'ASC'}
                onChange={(e) => setOrderBy(orderBy?.column || '', e.target.value as 'ASC' | 'DESC')}
                size="small"
              >
                <option value="ASC">Stigende (A-Å, 0-9)</option>
                <option value="DESC">Synkende (Å-A, 9-0)</option>
              </Select>
            </div>
          </ToggleOption>

          <ToggleOption
            label="Begrens antall rader"
            description={
              limit && limit !== 1000
                ? `Begrenser til ${limit} rader`
                : 'F.eks. for en topp 10-liste (standard: 1000 rader)'
            }
            checked={showCustomLimit}
            onChange={(checked) => {
              setShowCustomLimit(checked)
              if (!checked) {
                setLimit(1000)
                setLimitInput('1000')
              }
            }}
          >
            <div className="flex gap-2 items-center">
              <TextField
                label="Maksimalt antall rader"
                type="number"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                onBlur={() => {
                  const numValue = parseInt(limitInput, 10)
                  if (!isNaN(numValue) && numValue > 0) {
                    setLimit(numValue)
                  } else {
                    setLimit(1000)
                    setLimitInput('1000')
                  }
                }}
                min="1"
                size="small"
                className="flex-grow"
              />
            </div>
          </ToggleOption>

          <ToggleOption
            label="Bytt kolonnerekkefølge"
            description={
              columnOrderMode === 'metrics_first'
                ? 'Måltall før grupperingskolonner'
                : 'Standard rekkefølge: Grupperinger før måltall'
            }
            checked={columnOrderMode === 'metrics_first'}
            onChange={(checked) => setColumnOrderMode(checked ? 'metrics_first' : 'default')}
          />
        </div>
      </>
    )
  },
)

export default DisplayOptions
