import { Alert, BodyShort, Checkbox, Link, Loader, UNSAFE_Combobox } from '@navikt/ds-react'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { fetchCohorts, fetchCohortsDeep, cohortUsesTimeCriterion } from '../../api/cohortApi.ts'
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
    // Tracks selection by cohort *name*, not id — Aksel's UNSAFE_Combobox
    // renders each selected chip's visible text from the option's raw `value`
    // (there's no separate label-for-chip vs value-for-identity concept), so
    // whatever we put in `value` is literally what the user sees on the chip.
    // Names are guaranteed unique per website by the backend
    // (`uq_cohorts_name_website`), so they're a safe identity to select on.
    const [selectedNames, setSelectedNames] = useState<string[]>([])
    const [ratioMode, setRatioMode] = useState<boolean>(false)

    const loadCohorts = (id: string) => {
      setIsLoading(true)
      setError(null)
      fetchCohorts(id)
        // Backend's id is a Kotlin Long — serialized as a raw JSON number, not
        // a string, despite CohortDto's TS type claiming `id: string`. Coerce
        // here so every downstream comparison (options/selectedOptions here,
        // cohorts.find below) actually deals with strings, not a silent
        // number/string mismatch (that mismatch is what left the combobox's
        // own internal chip unable to match a selected value to its label).
        .then((data) => setCohorts(data.map((cohort) => ({ ...cohort, id: String(cohort.id) }))))
        .catch(() => setError('Kunne ikke laste brukergrupper. Prøv igjen senere.'))
        .finally(() => setIsLoading(false))
    }

    useEffect(() => {
      setSelectedNames([])
      setRatioMode(false)
      onRatioModeChange(false)

      if (!websiteId) {
        setCohorts([])
        setError(null)
        return
      }

      loadCohorts(websiteId)
    }, [websiteId, onRatioModeChange])

    // Refetch when tab regains focus (user may have added cohorts in the /brukergrupper tab)
    useEffect(() => {
      if (!websiteId) return
      const handleFocus = () => loadCohorts(websiteId)
      window.addEventListener('focus', handleFocus)
      return () => window.removeEventListener('focus', handleFocus)
    }, [websiteId])

    const selectedCohorts = selectedNames
      .map((name) => cohorts.find((c) => c.name === name))
      .filter((c): c is CohortDto => c !== undefined)

    const selectedIds = selectedCohorts.map((c) => c.id)

    // True only when a selected cohort's criteria actually reference event time
    // («Tidspunkt» condition or a SEQUENCE) — the hint below is noise otherwise.
    const [anySelectedUsesTime, setAnySelectedUsesTime] = useState(false)

    useEffect(() => {
      onCohortIdsChange(selectedIds)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds.join(','), onCohortIdsChange])

    useEffect(() => {
      let cancelled = false
      if (selectedIds.length === 0) {
        setAnySelectedUsesTime(false)
        return
      }
      fetchCohortsDeep(selectedIds)
        .then((lookup) => {
          if (cancelled) return
          setAnySelectedUsesTime(selectedIds.some((id) => cohortUsesTimeCriterion(lookup.get(id)?.root ?? null)))
        })
        .catch(() => {
          if (!cancelled) setAnySelectedUsesTime(false)
        })
      return () => {
        cancelled = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds.join(',')])

    useEffect(() => {
      if (selectedNames.length < 2 && ratioMode) {
        setRatioMode(false)
        onRatioModeChange(false)
      }
    }, [selectedNames.length, ratioMode, onRatioModeChange])

    const resetCohorts = () => {
      setSelectedNames([])
      setRatioMode(false)
      onRatioModeChange(false)
    }

    useImperativeHandle(ref, () => ({
      resetCohorts,
    }))

    const comboboxDisabled = ratioMode && selectedNames.length >= 2

    if (isLoading) {
      return <Loader size="small" title="Laster brukergrupper" />
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
          label="Velg brukergrupper"
          options={cohorts.map((cohort) => ({
            label: cohort.name,
            value: cohort.name,
          }))}
          selectedOptions={selectedNames}
          onToggleSelected={(option: string, isSelected: boolean) => {
            if (!option) return
            setSelectedNames((prev) => {
              if (isSelected) {
                return [...new Set([...prev, option])]
              }
              return prev.filter((name) => name !== option)
            })
          }}
          isMultiSelect
          size="small"
          disabled={comboboxDisabled}
        />

        <BodyShort size="small">
          <Link
            href={`/brukergrupper${websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''}`}
            target="_blank"
          >
            Administrer brukergrupper
          </Link>
        </BodyShort>

        {anySelectedUsesTime && (
          <Alert variant="info" size="small" className="mt-2">
            En brukergruppes eget «Tidspunkt»-kriterium bestemmer bare <strong>hvem</strong> som kvalifiserer som medlem
            — det begrenser ikke hvilken periode grafen viser data for. Bruk «Overstyr tidsperiode» under visningsvalg
            for å styre det.
          </Alert>
        )}

        {selectedNames.length >= 2 && (
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
