import { useState, useEffect, useRef, useCallback } from 'react'
import { UNSAFE_Combobox, Alert, Button } from '@navikt/ds-react'
import type { EventProperty, Website } from '../model/types.ts'
import { useWebsites } from '../hooks/useWebsites.ts'
import { useWebsiteSelection } from '../hooks/useWebsiteSelection.ts'
import { API_TIMEOUT_MS, buildEventParams, calculateMaxDaysAvailable, getDateRange } from '../utils/websiteUtils.ts'
import { fetchEventProperties } from '../api/bigquery.ts'

interface EventPropertiesApiResponse {
  properties: EventProperty[]
  gbProcessed?: number
  estimatedGbProcessed?: number
}

interface WebsitePickerProps {
  selectedWebsite: Website | null
  onWebsiteChange: (website: Website | null) => void
  onEventsLoad?: (events: string[], autoParameters?: { key: string; type: 'string' }[], maxDays?: number) => void
  dateRangeInDays?: number
  shouldReload?: boolean
  onIncludeParamsChange?: (includeParams: boolean) => void
  resetIncludeParams?: boolean
  requestIncludeParams?: boolean
  variant?: 'default' | 'minimal'
  disableAutoEvents?: boolean
  requestLoadEvents?: boolean
  onLoadingChange?: (isLoading: boolean) => void
  size?: 'medium' | 'small'
  disableUrlUpdate?: boolean
}

const timeoutPromise = (ms: number) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`))
    }, ms)
  })
}

const DashboardWebsitePicker = ({
  selectedWebsite,
  onWebsiteChange,
  onEventsLoad,
  dateRangeInDays: externalDateRange,
  shouldReload = false,
  onIncludeParamsChange,
  resetIncludeParams = false,
  requestIncludeParams = false,
  variant = 'default',
  disableAutoEvents = false,
  requestLoadEvents = false,
  onLoadingChange,
  size = 'medium',
  disableUrlUpdate = false,
}: WebsitePickerProps) => {
  const { websites } = useWebsites()
  const { handleWebsiteChange } = useWebsiteSelection({
    websites,
    selectedWebsite,
    onWebsiteChange,
    disableUrlUpdate,
  })

  const [loadedWebsiteId, setLoadedWebsiteId] = useState<string | null>(null)
  const [dateRangeInDays, setDateRangeInDays] = useState<number>(externalDateRange || 14)
  const fetchInProgress = useRef<Record<string, boolean>>({})
  const prevExternalDateRange = useRef<number>(externalDateRange || 14)
  const prevShouldReload = useRef<boolean>(shouldReload)

  const [error, setError] = useState<string | null>(null)
  const [comboboxInputValue, setComboboxInputValue] = useState<string>('')
  const [includeParams, setIncludeParams] = useState<boolean>(false)
  const prevIncludeParams = useRef<boolean>(false)
  const [fullEventsLoadedId, setFullEventsLoadedId] = useState<string | null>(null)

  useEffect(() => {
    if (resetIncludeParams) {
      setIncludeParams(false)
    }
  }, [resetIncludeParams])

  useEffect(() => {
    if (requestIncludeParams && !includeParams) {
      setIncludeParams(true)
    }
  }, [requestIncludeParams, includeParams])

  useEffect(() => {
    onIncludeParamsChange?.(includeParams)
  }, [includeParams, onIncludeParamsChange])

  const handleLoadingState = useCallback(
    (loading: boolean) => {
      onLoadingChange?.(loading)
    },
    [onLoadingChange],
  )

  const fetchEventNames = useCallback(
    async (website: Website, daysToFetch = dateRangeInDays, metadataOnly = false) => {
      const websiteId = website.id
      if (fetchInProgress.current[websiteId]) return

      const totalDays = calculateMaxDaysAvailable(website)

      if (metadataOnly) {
        onEventsLoad?.([], [], totalDays)
        return
      }

      fetchInProgress.current[websiteId] = true
      setError(null)

      try {
        handleLoadingState(true)

        const { startAt, endAt, startDate, endDate } = getDateRange(daysToFetch)

        console.log(
          `Fetching data for ${daysToFetch} days from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
        )

        const responseData: EventPropertiesApiResponse = (await Promise.race([
          fetchEventProperties(websiteId, startAt, endAt, includeParams),
          timeoutPromise(API_TIMEOUT_MS),
        ])) as EventPropertiesApiResponse

        console.log('API Response:', responseData)

        const properties: EventProperty[] = responseData.properties || []
        const gbProcessedValue = responseData.gbProcessed
        const estimatedGbValue = responseData.estimatedGbProcessed

        console.log(
          `Fetched ${properties.length} event entries from the API, estimated ${estimatedGbValue} GB, actual ${gbProcessedValue} GB`,
        )

        const { eventNames, paramsByEvent } = buildEventParams(properties)

        console.log(`Found ${eventNames.length} unique events and ${paramsByEvent.length} parameters`)

        onEventsLoad?.(eventNames, paramsByEvent, totalDays)
      } catch (error) {
        console.error('Error fetching event data:', error)
        if (error instanceof Error) {
          const message = error.message.includes('timed out')
            ? 'Foresporselen tok for lang tid. Prov igjen senere.'
            : 'Det oppstod en feil ved lasting av data. Forsok a laste siden inn pa nytt.'
          setError(message)
        }
      } finally {
        handleLoadingState(false)
        fetchInProgress.current[websiteId] = false
      }
    },
    [onEventsLoad, handleLoadingState, includeParams, dateRangeInDays],
  )

  useEffect(() => {
    if (!selectedWebsite || !onEventsLoad) {
      if (!selectedWebsite && loadedWebsiteId) {
        setLoadedWebsiteId(null)
        setFullEventsLoadedId(null)
      }
      return
    }

    const isNewWebsite = selectedWebsite.id !== loadedWebsiteId
    const needsFullLoad = requestLoadEvents && fullEventsLoadedId !== selectedWebsite.id

    if (isNewWebsite) {
      if (disableAutoEvents && !requestLoadEvents) {
        void fetchEventNames(selectedWebsite, dateRangeInDays, true)
        setLoadedWebsiteId(selectedWebsite.id)
        setFullEventsLoadedId(null)
      } else {
        void fetchEventNames(selectedWebsite, dateRangeInDays, false)
        setLoadedWebsiteId(selectedWebsite.id)
        setFullEventsLoadedId(selectedWebsite.id)
      }
    } else if (needsFullLoad) {
      void fetchEventNames(selectedWebsite, dateRangeInDays, false)
      setFullEventsLoadedId(selectedWebsite.id)
    }
  }, [
    selectedWebsite,
    loadedWebsiteId,
    onEventsLoad,
    fetchEventNames,
    dateRangeInDays,
    disableAutoEvents,
    requestLoadEvents,
    fullEventsLoadedId,
  ])

  useEffect(() => {
    if (
      selectedWebsite &&
      loadedWebsiteId === selectedWebsite.id &&
      includeParams !== prevIncludeParams.current &&
      onEventsLoad
    ) {
      prevIncludeParams.current = includeParams
      void fetchEventNames(selectedWebsite, dateRangeInDays)
    }
  }, [includeParams, selectedWebsite, loadedWebsiteId, fetchEventNames, dateRangeInDays, onEventsLoad])

  useEffect(() => {
    if (!selectedWebsite || !onEventsLoad) return

    const dateRangeChanged = externalDateRange !== prevExternalDateRange.current
    const reloadFlagChanged = shouldReload !== prevShouldReload.current

    prevExternalDateRange.current = externalDateRange || 14
    prevShouldReload.current = shouldReload

    if (dateRangeChanged || reloadFlagChanged) {
      console.log(`Reload triggered - dateRange: ${dateRangeChanged}, reloadFlag: ${reloadFlagChanged}`)

      if (dateRangeChanged) {
        setDateRangeInDays(externalDateRange || 14)
      }

      void fetchEventNames(selectedWebsite, externalDateRange || dateRangeInDays)
    }
  }, [externalDateRange, shouldReload, selectedWebsite, fetchEventNames, dateRangeInDays, onEventsLoad])

  const sortedWebsites = [...websites].sort((a, b) => {
    const priorityIds = ['35abb2b7-3f97-42ce-931b-cf547d40d967', '83b80c84-b551-4dff-a679-f21be5fa0453']
    const aIndex = priorityIds.indexOf(a.id)
    const bIndex = priorityIds.indexOf(b.id)

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1

    return a.name.localeCompare(b.name)
  })

  return (
    <div className={`${variant === 'minimal' ? '' : ''}`}>
      <div>
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        <UNSAFE_Combobox
          label="Nettside eller app"
          size={size}
          options={sortedWebsites.map((website) => ({
            label: website.name,
            value: website.name,
            website: website,
          }))}
          selectedOptions={selectedWebsite ? [selectedWebsite.name] : []}
          onToggleSelected={(option: string, isSelected: boolean) => {
            if (isSelected) {
              const website = websites.find((w) => w.name === option)
              if (website) {
                handleWebsiteChange(website)
              }
            } else {
              handleWebsiteChange(null)
            }
          }}
          value={comboboxInputValue}
          onChange={(value) => setComboboxInputValue(value)}
          clearButton
          isMultiSelect={false}
        />
        {!selectedWebsite && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm">Hurtigvalg:</span>
            <Button
              size="xsmall"
              variant="secondary"
              onClick={() => {
                const website = websites.find((w) => w.id === '35abb2b7-3f97-42ce-931b-cf547d40d967')
                if (website) {
                  handleWebsiteChange(website)
                }
              }}
            >
              nav.no
            </Button>
            <Button
              size="xsmall"
              variant="secondary"
              onClick={() => {
                const website = websites.find((w) => w.id === '83b80c84-b551-4dff-a679-f21be5fa0453')
                if (website) {
                  handleWebsiteChange(website)
                }
              }}
            >
              navet
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardWebsitePicker
