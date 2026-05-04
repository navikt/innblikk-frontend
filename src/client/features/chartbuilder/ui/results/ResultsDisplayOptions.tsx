import { Select, TextField } from '@navikt/ds-react'
import { useState, useEffect } from 'react'
import type { OrderBy } from '../../../../shared/types/chart.ts'
import ToggleOption from '../../../../shared/ui/ToggleOption.tsx'

interface ResultsDisplayOptionsProps {
  orderBy?: OrderBy | null
  setOrderBy?: (column: string, direction: 'ASC' | 'DESC') => void
  clearOrderBy?: () => void
  limit?: number | null
  setLimit?: (limit: number | null) => void
  columnOrderMode?: 'default' | 'metrics_first'
  setColumnOrderMode?: (mode: 'default' | 'metrics_first') => void
}

const ResultsDisplayOptions = ({
  orderBy,
  setOrderBy,
  clearOrderBy,
  limit,
  setLimit,
  columnOrderMode = 'default',
  setColumnOrderMode,
}: ResultsDisplayOptionsProps) => {
  const hasAnyControl = setOrderBy || setLimit || setColumnOrderMode
  const [showCustomSort, setShowCustomSort] = useState<boolean>(false)
  const [showCustomLimit, setShowCustomLimit] = useState<boolean>(false)
  const [limitInput, setLimitInput] = useState<string>(limit?.toString() ?? '')

  useEffect(() => {
    setLimitInput(limit?.toString() ?? '')
  }, [limit])

  useEffect(() => {
    setShowCustomSort(Boolean(orderBy))
  }, [orderBy])

  if (!hasAnyControl) return null

  return (
    <div className="flex flex-col gap-4 pb-2">
      {setOrderBy && clearOrderBy && (
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
            if (!checked) clearOrderBy()
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
      )}

      {setLimit && (
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
      )}

      {setColumnOrderMode && (
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
      )}
    </div>
  )
}

export default ResultsDisplayOptions
