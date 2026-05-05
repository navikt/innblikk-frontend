import { Alert, Checkbox, Chips, Loader, UNSAFE_Combobox } from '@navikt/ds-react'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { fetchCohorts } from '../../api/cohortApi.ts'
import type { CohortDto } from '../../../../shared/types/cohort.ts'

export interface CohortPickerRef {
  resetCohorts: () => void
}

interface CohortPickerProps {
  websiteId: string | undefined
  onCohortIdsChange: (ids: string[]) => void
  onRatioModeChange: (enabled: boolean) => void
}

const CohortPicker = forwardRef<CohortPickerRef, CohortPickerProps>(
  ({ websiteId, onCohortIdsChange, onRatioModeChange }, ref) => {
    const [cohorts, setCohorts] = useState<CohortDto[]>([])
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [ratioMode, setRatioMode] = useState<boolean>(false)

    useEffect(() => {
      setSelectedIds([])
      setRatioMode(false)
      onRatioModeChange(false)

      if (!websiteId) {
        setCohorts([])
        setError(null)
        return
      }

      setIsLoading(true)
      setError(null)

      fetchCohorts(websiteId)
        .then((data) => {
          setCohorts(data)
        })
        .catch(() => {
          setError('Kunne ikke laste kohorter. Prøv igjen senere.')
        })
        .finally(() => {
          setIsLoading(false)
        })
    }, [websiteId, onRatioModeChange])

    useEffect(() => {
      onCohortIdsChange(selectedIds)
    }, [selectedIds, onCohortIdsChange])

    const resetCohorts = () => {
      setSelectedIds([])
      setRatioMode(false)
      onRatioModeChange(false)
    }

    useImperativeHandle(ref, () => ({
      resetCohorts,
    }))

    const removeSelectedId = (id: string) => {
      setSelectedIds((prev) => prev.filter((sid) => sid !== id))
    }

    const comboboxDisabled = ratioMode && selectedIds.length >= 2

    const selectedCohorts = selectedIds
      .map((id) => cohorts.find((c) => c.id === id))
      .filter((c): c is CohortDto => c !== undefined)

    if (isLoading) {
      return <Loader size="small" title="Laster kohorter" />
    }

    if (error) {
      return (
        <Alert variant="error" size="small">
          {error}
        </Alert>
      )
    }

    const [firstCohort, secondCohort] = selectedCohorts

    return (
      <div className="space-y-2">
        <UNSAFE_Combobox
          label="Velg kohorter"
          options={cohorts.map((cohort) => ({
            label: cohort.name,
            value: cohort.id,
          }))}
          selectedOptions={selectedIds}
          onToggleSelected={(option: string, isSelected: boolean) => {
            if (!option) return
            setSelectedIds((prev) => {
              if (isSelected) {
                return [...new Set([...prev, option])]
              }
              return prev.filter((id) => id !== option)
            })
          }}
          isMultiSelect
          size="small"
          disabled={comboboxDisabled}
        />

        {selectedCohorts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selectedCohorts.map((cohort) => (
              <Chips.Removable key={cohort.id} variant="neutral" onDelete={() => removeSelectedId(cohort.id)}>
                {cohort.name}
              </Chips.Removable>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ax-text-subtle)' }}>
            Ingen kohorter valgt
          </p>
        )}

        {selectedIds.length >= 2 && (
          <div className="filter-card-animate-in">
            <Checkbox
              size="small"
              checked={ratioMode}
              onChange={(e) => {
                const next = e.target.checked
                setRatioMode(next)
                onRatioModeChange(next)
              }}
            >
              Vis som ratio: {firstCohort?.name ?? ''} ÷ {secondCohort?.name ?? ''}
            </Checkbox>
          </div>
        )}
      </div>
    )
  },
)

CohortPicker.displayName = 'CohortPicker'

export default CohortPicker
