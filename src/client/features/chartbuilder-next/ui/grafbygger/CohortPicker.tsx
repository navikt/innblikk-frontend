import { Alert, BodyShort, Button, Checkbox, Dialog, Link, Loader, UNSAFE_Combobox } from '@navikt/ds-react'
import { PlusIcon } from '@navikt/aksel-icons'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Events } from '@navikt/analytics-types'
import { trackEvent } from '../../../../shared/lib/trackEvent.ts'
import { fetchCohorts, fetchCohortsDeep, cohortUsesTimeCriterion } from '../../api/cohortApi.ts'
import type { CohortDto } from '../../../../shared/types/cohort.ts'
import type { Website } from '../../../../shared/types/website.ts'
import { CohortEditorPage, type CohortEditorRef } from '../../../cohortmanager-next/ui/CohortEditorPage.tsx'

export interface CohortPickerRef {
  resetCohorts: () => void
}

interface CohortPickerProps {
  websiteId: string | undefined
  /** Cohort ids restored from persisted state — hydrated into the combobox
   * once the cohort list has loaded (ids alone can't render chip labels). */
  initialCohortIds?: string[]
  initialRatioMode?: boolean
  showRatioOption?: boolean
  onCohortIdsChange: (ids: string[]) => void
  onRatioModeChange: (enabled: boolean) => void
  autoFocus?: boolean
  creationWebsite?: Website
}

const CohortPicker = forwardRef<CohortPickerRef, CohortPickerProps>(
  (
    {
      websiteId,
      initialCohortIds,
      initialRatioMode,
      showRatioOption = true,
      onCohortIdsChange,
      onRatioModeChange,
      autoFocus = false,
      creationWebsite,
    },
    ref,
  ) => {
    const [cohorts, setCohorts] = useState<CohortDto[]>([])
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const editorRef = useRef<CohortEditorRef>(null)
    const createButtonRef = useRef<HTMLButtonElement>(null)
    // Tracks selection by cohort *name*, not id — Aksel's UNSAFE_Combobox
    // renders each selected chip's visible text from the option's raw `value`
    // (there's no separate label-for-chip vs value-for-identity concept), so
    // whatever we put in `value` is literally what the user sees on the chip.
    // Names are guaranteed unique per website by the backend
    // (`uq_cohorts_name_website`), so they're a safe identity to select on.
    const [selectedNames, setSelectedNames] = useState<string[]>([])
    const [ratioMode, setRatioMode] = useState<boolean>(showRatioOption && (initialRatioMode ?? false))

    // Hydration: persisted cohort ids arrive before the cohort list (names
    // need the fetch). Until applied, suppress the empty-selection emit that
    // would otherwise wipe the restored ids from the parent config. Nothing
    // to restore → start hydrated so normal selection emits flow immediately.
    const hasIdsToRestore = (initialCohortIds?.length ?? 0) > 0
    const hydratedRef = useRef(!hasIdsToRestore)
    const pendingHydrationIdsRef = useRef<string[] | null>(hasIdsToRestore ? (initialCohortIds ?? null) : null)

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

    // Track websiteId across renders so the mount run of the effect below is
    // distinguishable from a real website switch. On mount the pending
    // hydration (queued by the ref initializers) must survive; on a switch it
    // must be dropped (restored ids belong to the previous site).
    const prevWebsiteIdRef = useRef<string | undefined>(undefined)

    useEffect(() => {
      const isWebsiteSwitch = prevWebsiteIdRef.current !== undefined && prevWebsiteIdRef.current !== websiteId
      prevWebsiteIdRef.current = websiteId

      if (!websiteId) {
        setSelectedNames([])
        setRatioMode(false)
        onRatioModeChange(false)
        setCohorts([])
        setError(null)
        hydratedRef.current = true
        pendingHydrationIdsRef.current = null
        return
      }

      if (isWebsiteSwitch) {
        hydratedRef.current = true
        pendingHydrationIdsRef.current = null
        setSelectedNames([])
        setRatioMode(false)
        onRatioModeChange(false)
      }

      loadCohorts(websiteId)
    }, [websiteId, onRatioModeChange])

    // Once the cohort list is available, map restored ids → names so the
    // combobox shows the chips the user had before the refresh.
    useEffect(() => {
      const pending = pendingHydrationIdsRef.current
      if (hydratedRef.current || !pending || cohorts.length === 0) return
      hydratedRef.current = true
      pendingHydrationIdsRef.current = null
      const names = pending
        .map((id) => cohorts.find((c) => c.id === id)?.name)
        .filter((name): name is string => name !== undefined)
      if (names.length > 0) {
        setSelectedNames(names)
      }
    }, [cohorts])

    // Refetch when tab regains focus (user may have added cohorts in the /brukergrupper tab)
    useEffect(() => {
      if (!websiteId || creating) return
      const handleFocus = () => loadCohorts(websiteId)
      window.addEventListener('focus', handleFocus)
      return () => window.removeEventListener('focus', handleFocus)
    }, [websiteId, creating])

    const selectedCohorts = selectedNames
      .map((name) => cohorts.find((c) => c.name === name))
      .filter((c): c is CohortDto => c !== undefined)

    const selectedIds = selectedCohorts.map((c) => c.id)

    // True only when a selected cohort's criteria actually reference event time
    // («Tidspunkt» condition or a SEQUENCE) — the hint below is noise otherwise.
    const [anySelectedUsesTime, setAnySelectedUsesTime] = useState(false)

    useEffect(() => {
      // Suppress the empty-selection emit while a persisted selection is still
      // waiting to be hydrated — firing here would wipe the restored ids from
      // the parent config before the cohort list arrives.
      if (!hydratedRef.current) return
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
      if ((!showRatioOption || selectedNames.length < 2) && ratioMode) {
        setRatioMode(false)
        onRatioModeChange(false)
      }
    }, [showRatioOption, selectedNames.length, ratioMode, onRatioModeChange])

    const resetCohorts = () => {
      hydratedRef.current = true
      pendingHydrationIdsRef.current = null
      setSelectedNames([])
      setRatioMode(false)
      onRatioModeChange(false)
    }

    useImperativeHandle(ref, () => ({
      resetCohorts,
    }))

    const comboboxDisabled = ratioMode && selectedNames.length >= 2

    if (isLoading && !creating) {
      return <Loader size="small" title="Laster brukergrupper" />
    }

    if (error && !creationWebsite) {
      return (
        <Alert variant="error" size="small">
          {error}
        </Alert>
      )
    }

    const [firstCohort, secondCohort] = selectedCohorts

    return (
      <div className="space-y-2">
        {error && (
          <Alert variant="error" size="small">
            {error}
          </Alert>
        )}
        <UNSAFE_Combobox
          label="Velg brukergrupper"
          autoFocus={autoFocus}
          options={cohorts.map((cohort) => ({
            label: cohort.name,
            value: cohort.name,
          }))}
          selectedOptions={selectedNames}
          onToggleSelected={(option: string, isSelected: boolean) => {
            if (!option) return
            trackEvent(Events.COMBOBOX_OPTION_TOGGLED, {
              seksjon: 'grafbygger',
              komponentId: 'brukergrupper',
              optionValue: option,
              isSelected,
              isMultiSelect: true,
            })
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

        {creationWebsite ? (
          <>
            <Button
              ref={createButtonRef}
              className="px-0"
              type="button"
              size="small"
              variant="tertiary"
              data-color="neutral"
              icon={<PlusIcon aria-hidden />}
              disabled={comboboxDisabled}
              onClick={() => setCreating(true)}
            >
              Opprett brukergruppe
            </Button>
            <Dialog
              open={creating}
              onOpenChange={(open) => {
                if (!open) editorRef.current?.requestClose()
              }}
            >
              <Dialog.Popup
                width="56rem"
                initialFocusTo={() => editorRef.current?.getInitialFocus()}
                returnFocusTo={createButtonRef}
              >
                <Dialog.Header>
                  <Dialog.Title>Ny brukergruppe</Dialog.Title>
                  <Dialog.Description>Gjelder {creationWebsite.name}.</Dialog.Description>
                </Dialog.Header>
                <Dialog.Body>
                  {creating && (
                    <CohortEditorPage
                      ref={editorRef}
                      website={creationWebsite}
                      onCancel={() => setCreating(false)}
                      onSaved={(saved) => {
                        hydratedRef.current = true
                        pendingHydrationIdsRef.current = null
                        setCohorts((current) => [
                          ...current.filter((cohort) => cohort.id !== String(saved.id)),
                          { ...saved, id: String(saved.id) },
                        ])
                        setSelectedNames((current) => [...new Set([...current, saved.name])])
                        setCreating(false)
                      }}
                    />
                  )}
                </Dialog.Body>
              </Dialog.Popup>
            </Dialog>
          </>
        ) : (
          <BodyShort size="small">
            <Link
              href={`/brukergrupper${websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''}`}
              target="_blank"
            >
              Administrer brukergrupper
            </Link>
          </BodyShort>
        )}

        {anySelectedUsesTime && (
          <Alert variant="info" size="small" className="mt-2">
            En brukergruppes eget «Tidspunkt»-kriterium bestemmer bare <strong>hvem</strong> som kvalifiserer som medlem
            — det begrenser ikke hvilken periode grafen viser data for. Bruk «Overstyr tidsperiode» under visningsvalg
            for å styre det.
          </Alert>
        )}

        {showRatioOption && selectedNames.length >= 2 && (
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
