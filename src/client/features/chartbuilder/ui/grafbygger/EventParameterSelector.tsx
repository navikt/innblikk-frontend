import { useState, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  Heading,
  Button,
  VStack,
  HStack,
  Accordion,
  BodyShort,
  Alert,
  Modal,
  Box,
  Tag,
  ReadMore,
  ExpansionCard,
  Search,
  List,
} from '@navikt/ds-react'
import type { Parameter } from '../../../../shared/types/chart.ts'
import { FILTER_COLUMNS } from '../../../../shared/lib/constants.ts'
// import AlertWithCloseButton from '../chartbuilder/AlertWithCloseButton';

interface EventParameterSelectorProps {
  availableEvents: string[]
  parameters: Parameter[]
  setParameters: Dispatch<SetStateAction<Parameter[]>>
  initiallySelectAll?: boolean // New optional prop to control initial selection
  // New props for date range settings
  maxDaysAvailable?: number
  dateRangeInDays?: number
  tempDateRangeInDays?: number
  setTempDateRangeInDays?: (days: number) => void
  handleDateRangeChange?: () => void
  dateChanged?: boolean
  isLoading?: boolean
  includeParams?: boolean // Whether parameters were loaded (expensive query)
  onLoadDetailsClick?: () => void // Callback when user wants to load details
}

// Enhanced structure to maintain event-parameter relationships
interface EventParams {
  [eventName: string]: string[]
}

// Constants for the fake event
const MANUAL_EVENT_NAME = '_manual_parameters_'
const MANUAL_EVENT_DISPLAY_NAME = 'manuelt lagt til'

// Add this constant near the top of the file with other constants
const EXCLUDED_PARAMS = ['url_fullpath', 'url_fullurl', 'referrer_fullpath', 'referrer_fullurl', 'website_domain']

const EventParameterSelector: React.FC<EventParameterSelectorProps> = ({
  availableEvents,
  parameters,
  setParameters,
  initiallySelectAll = true, // Default to true to select all events initially
  // Add new props with default values
  // maxDaysAvailable = 0,
  // tempDateRangeInDays = 3,
  // setTempDateRangeInDays = () => {},
  // handleDateRangeChange = () => {},
  // dateChanged = false,
  includeParams = false, // Default to false (cheap query)
  onLoadDetailsClick, // Callback for loading details
}) => {
  const [selectedEvents, setSelectedEvents] = useState<string[]>(initiallySelectAll ? availableEvents : [])
  // State for selected events and UI controls
  // const [newParamKey, setNewParamKey] = useState<string>('');
  // const [customParamAccordionOpen, setCustomParamAccordionOpen] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Store event-parameter mapping to ensure proper relationship (written but not yet consumed)
  const [_eventParamsMap, setEventParamsMap] = useState<EventParams>({})

  // Rename isLoading state to isLoadingParameters to avoid conflict with prop
  const [isLoadingParameters, setIsLoadingParameters] = useState<boolean>(true)

  // Extract event-parameter map from the input parameters list
  useEffect(() => {
    const eventMap: EventParams = {}

    // Build a map of events to their parameters
    parameters.forEach((param) => {
      if (param.key.includes('.')) {
        const [eventName, ...rest] = param.key.split('.')
        const paramName = rest.join('.')

        if (!eventMap[eventName]) {
          eventMap[eventName] = []
        }

        if (!eventMap[eventName].includes(paramName)) {
          eventMap[eventName].push(paramName)
        }
      }
    })

    setEventParamsMap(eventMap)
  }, [parameters])

  // Extract event-parameter map and cache all parameters by event
  useEffect(() => {
    const eventMap: EventParams = {}

    // Build a map of events to their parameters
    parameters.forEach((param) => {
      if (param.key.includes('.')) {
        const [eventName, ...rest] = param.key.split('.')
        const paramName = rest.join('.')

        if (!eventMap[eventName]) {
          eventMap[eventName] = []
        }

        if (!eventMap[eventName].includes(paramName)) {
          eventMap[eventName].push(paramName)
        }
      }
    })

    setEventParamsMap(eventMap)

    // Update our cache of parameters by event
    const parametersByEvent: Record<string, Parameter[]> = {}

    parameters.forEach((param) => {
      if (param.key.includes('.')) {
        const [eventName] = param.key.split('.')

        if (!parametersByEvent[eventName]) {
          parametersByEvent[eventName] = []
        }

        // Only add if not already in the cache
        if (!parametersByEvent[eventName].some((p) => p.key === param.key)) {
          parametersByEvent[eventName].push(param)
        }
      }
    })

    // Indicate we're done loading after initial parameters are processed
    setIsLoadingParameters(false)
  }, [parameters])

  // Check if we already have manual parameters on component mount
  useEffect(() => {
    const hasManual = parameters.some((p) => p.key.startsWith(`${MANUAL_EVENT_NAME}.`))

    // If we have manual parameters but the event is not selected, select it
    if (hasManual && !selectedEvents.includes(MANUAL_EVENT_NAME)) {
      setSelectedEvents((prev) => [...prev, MANUAL_EVENT_NAME])
    }
  }, [parameters])

  // Remove manual parameters and deselect manual event
  const confirmRemoveManualParameters = () => {
    setParameters((prev) => prev.filter((p) => !p.key.startsWith(`${MANUAL_EVENT_NAME}.`)))
    setSelectedEvents((prev) => prev.filter((e) => e !== MANUAL_EVENT_NAME))
    setShowConfirmModal(false)
  }

  // Add custom parameter
  {
    /* const addParameter = (): void => {
    if (!newParamKey.trim()) return;
    
    // Split by newlines and commas
    const newParams = newParamKey
      .split(/[\n,]/)
      .map(key => key.trim())
      .filter(key => key);

    if (newParams.length === 0) return;

    const paramsToAdd: Parameter[] = [];

    // Process each new parameter
    newParams.forEach(paramName => {
      // For manually added parameters, always use the manual event as prefix
      if (paramName.includes('.')) {
        // If it already has a dot, keep as is but change the event part
        const parts = paramName.split('.');
        const paramPart = parts.slice(1).join('.');
        paramsToAdd.push({ key: `${MANUAL_EVENT_NAME}.${paramPart}`, type: 'string' });
      } else {
        // Simple parameter, add with manual prefix
        paramsToAdd.push({ key: `${MANUAL_EVENT_NAME}.${paramName}`, type: 'string' });
      }
    });

    // Filter out duplicates
    const uniqueParams = paramsToAdd.filter(
      newParam => !parameters.some(p => p.key === newParam.key)
    );

    if (uniqueParams.length > 0) {
      // Add the manual event to selected events if not already there
      if (!selectedEvents.includes(MANUAL_EVENT_NAME)) {
        setSelectedEvents(prev => [...prev, MANUAL_EVENT_NAME]);
      }
      
      // Add the parameters
      setParameters([...parameters, ...uniqueParams]);
      setNewParamKey('');
    }
  };
  */
  }

  // Fix missing functions
  const removeParameter = (paramKey: string): void => {
    const paramBase = paramKey.split('.')[1]
    setParameters(parameters.filter((p) => !p.key.includes(`.${paramBase}`)))
  }

  const toggleParameterType = (paramKey: string, currentType: 'string' | 'number'): void => {
    const newType = currentType === 'string' ? 'number' : 'string'
    const paramBase = paramKey.split('.')[1]
    setParameters((prev) =>
      prev.map((p) => {
        if (p.key.includes(`.${paramBase}`)) {
          return { ...p, type: newType }
        }
        return p
      }),
    )
  }

  useEffect(() => {
    console.log('Initial available events:', availableEvents)
    if (initiallySelectAll && availableEvents.length > 0) {
      setSelectedEvents(availableEvents)
    }
  }, [availableEvents])

  // Helper to generate a display name for parameters
  const getParameterDisplayName = (param: Parameter): string => {
    // For non-prefixed parameters, just show the key
    if (!param.key.includes('.')) {
      return param.key
    }

    // For prefixed parameters, strip the prefix
    return param.key.split('.').slice(1).join('.')
  }

  // Get a display name for the events in the UI
  const getEventDisplayName = (eventName: string): string => {
    return eventName === MANUAL_EVENT_NAME ? MANUAL_EVENT_DISPLAY_NAME : eventName
  }

  const getGroupedParameters = () => {
    const groups: Record<string, Parameter[]> = {}

    // Create a group for each selected event
    selectedEvents.forEach((event) => {
      // Initialize the group even if there are no parameters
      groups[event] = []

      // Get all parameters for this event
      const eventParams = parameters.filter((p) => p.key.startsWith(`${event}.`))

      // Deduplicate parameters by their base name
      const uniqueParams = new Map<string, Parameter>()

      eventParams.forEach((param) => {
        const baseName = param.key.split('.')[1] // Get parameter name without event prefix
        if (!uniqueParams.has(baseName)) {
          uniqueParams.set(baseName, param)
        }
      })

      // Add parameters if we have any
      if (uniqueParams.size > 0) {
        groups[event] = Array.from(uniqueParams.values())
      }
    })

    return groups
  }

  // Filter grouped parameters based on search query
  const getFilteredGroupedParameters = () => {
    const groups = getGroupedParameters()

    if (!searchQuery.trim()) {
      return groups
    }

    const query = searchQuery.toLowerCase()
    const filtered: Record<string, Parameter[]> = {}

    Object.entries(groups).forEach(([eventName, params]) => {
      const eventDisplayName = getEventDisplayName(eventName).toLowerCase()

      // Check if event name matches
      if (eventDisplayName.includes(query)) {
        filtered[eventName] = params
        return
      }

      // Filter parameters that match the query
      const matchingParams = params.filter((param) => {
        const displayName = getParameterDisplayName(param).toLowerCase()
        return displayName.includes(query)
      })

      // Only include the event if it has matching parameters
      if (matchingParams.length > 0) {
        filtered[eventName] = matchingParams
      }
    })

    return filtered
  }

  const groupedParameters = getGroupedParameters()
  const filteredGroupedParameters = getFilteredGroupedParameters()

  // Add helper function to get total event count
  const getEventCount = () => {
    // Count events from availableEvents first (from cheap query)
    const cheapQueryEvents = availableEvents.filter((e) => !e.toLowerCase().startsWith('pageview') && !e.includes('/'))

    if (cheapQueryEvents.length > 0) {
      return cheapQueryEvents.length
    }

    // Fallback to counting from parameters (for expensive query with details)
    const uniqueEvents = new Set()
    parameters.forEach((param) => {
      if (param.key.includes('.')) {
        const [eventName] = param.key.split('.')
        if (eventName !== MANUAL_EVENT_NAME) {
          uniqueEvents.add(eventName)
        }
      }
    })
    return uniqueEvents.size
  }

  // Helper function to get parameter descriptions
  const getParamDescription = (key: string): string => {
    switch (key) {
      // Event basics
      case 'event_name':
        return 'Navnet på hendelsen som ble registrert'
      case 'event_type':
        return 'Type hendelse (sidevisning eller tilpasset)'
      case 'event_id':
        return 'Unik ID for hver hendelse'
      case 'created_at':
        return 'Dato og tid for hendelsen'
      case 'website_id':
        return 'ID for nettstedet'
      case 'website_domain':
        return 'Domenenavn for nettstedet'
      case 'website_name':
        return 'Navn på nettstedet'

      // Page details
      case 'url_path':
        return 'Sidens relative adresse'
      case 'url_query':
        return 'Parametre etter ? i adressefeltet'
      case 'page_title':
        return 'Tittelen på siden fra HTML'
      case 'referrer_domain':
        return 'Henvisningsdomene'
      case 'referrer_path':
        return 'Henvisningssti'
      case 'referrer_query':
        return 'Henvisningsspørring'

      // Visitor details
      case 'session_id':
        return 'Unik ID for hver bruker'
      case 'visit_id':
        return 'Unik ID for hvert besøk'
      case 'browser':
        return 'Chrome, Safari, Firefox osv.'
      case 'os':
        return 'Windows, macOS, iOS osv.'
      case 'device':
        return 'Mobil, desktop, tablet'
      case 'screen':
        return 'Oppløsning på brukerens skjerm'
      case 'language':
        return 'Nettleserens innstilte språk'
      case 'country':
        return 'Basert på IP-adresse'
      case 'subdivision1':
        return 'Region eller fylke'
      case 'city':
        return 'Basert på IP-adresse'

      default:
        return ''
    }
  }

  // Helper function to determine parameter type
  const getParamType = (key: string): string => {
    if (['session_id', 'visit_id', 'event_id', 'website_id'].includes(key)) {
      return 'id'
    } else if (key === 'created_at') {
      return 'tid'
    } else if (['event_type'].includes(key)) {
      return 'tall'
    } else {
      return 'tekst'
    }
  }

  return (
    <>
      <Heading level="2" size="small" spacing>
        Tilgjengelige hendelser
      </Heading>
      <ExpansionCard aria-label="Hendelsesdetaljer" defaultOpen={false} size="small">
        <ExpansionCard.Header>
          <ExpansionCard.Title as="h3" size="small">
            {getEventCount() === 0 ? (
              <>Sidevisninger</>
            ) : (
              <>{getEventCount()} egendefinerte hendelser + sidevisninger</>
            )}
          </ExpansionCard.Title>
        </ExpansionCard.Header>
        <ExpansionCard.Content>
          <VStack gap="space-6">
            {/* Parameters Section - Only shown when events are selected and not loading */}
            {!isLoadingParameters && (
              <Box className="rounded-medium">
                <Heading level="3" size="xsmall" spacing className="mt-3">
                  Egendefinerte hendelser
                </Heading>

                {!isLoadingParameters &&
                  (parameters.some((p) => p.key.startsWith(MANUAL_EVENT_NAME)) || availableEvents.length > 0) && (
                    <List as="ul" size="small" className="text-[var(--ax-text-subtle)] pb-1">
                      <List.Item>Vi henter alltid hendelser fra de siste 2 ukene.</List.Item>
                      <List.Item>Detaljer er forhåndsatt som tekst. Du kan endre til tall ved behov.</List.Item>
                    </List>
                  )}

                {/* Continue with existing Alert for no events */}
                {!isLoadingParameters &&
                  availableEvents.length === 0 &&
                  !parameters.some((p) => p.key.startsWith(MANUAL_EVENT_NAME)) && (
                    <Alert variant="info" className="mt-3">
                      Ingen egendefinerte hendelser eller detaljer funnet for de siste 2 ukene.
                    </Alert>
                  )}

                {!includeParams && onLoadDetailsClick && (
                  <div className="mb-6">
                    <Button onClick={onLoadDetailsClick} size="xsmall" variant="secondary">
                      Hent hendelsesdetaljer
                    </Button>
                  </div>
                )}

                {/* Search field for filtering events and parameters */}
                {!isLoadingParameters &&
                  (availableEvents.length > 0 || parameters.some((p) => p.key.startsWith(MANUAL_EVENT_NAME))) && (
                    <div className="mb-4">
                      <Search
                        label="Søk i hendelser og detaljer"
                        hideLabel={false}
                        variant="simple"
                        size="small"
                        value={searchQuery}
                        onChange={(value) => setSearchQuery(value)}
                        onClear={() => setSearchQuery('')}
                      />
                    </div>
                  )}

                {/* Continue with existing Accordion for custom parameters */}
                {!isLoadingParameters &&
                  (availableEvents.length > 0 || parameters.some((p) => p.key.startsWith(MANUAL_EVENT_NAME))) && (
                    <>
                      {Object.keys(filteredGroupedParameters).length === 0 && searchQuery ? (
                        <Alert variant="info" className="mt-3">
                          Ingen hendelser eller detaljer matcher søket "{searchQuery}"
                        </Alert>
                      ) : (
                        <Accordion>
                          {/* Existing custom parameter accordion items */}
                          {Object.keys(filteredGroupedParameters).map((eventName) => (
                            <Accordion.Item key={eventName}>
                              <Accordion.Header
                                className={
                                  eventName === MANUAL_EVENT_NAME
                                    ? 'bg-[var(--ax-bg-default)]'
                                    : 'bg-[var(--ax-bg-default)]'
                                }
                              >
                                <span className="flex items-center gap-2">
                                  {eventName &&
                                  getEventDisplayName(eventName) &&
                                  getEventDisplayName(eventName) !== 'null' ? (
                                    getEventDisplayName(eventName)
                                  ) : (
                                    <>
                                      sidevisning
                                      <Tag size="xsmall" variant="info" className="whitespace-nowrap">
                                        tilknyttet standard
                                      </Tag>
                                    </>
                                  )}
                                  <span className="text-sm text-[var(--ax-text-subtle)]">
                                    (
                                    {includeParams
                                      ? `${groupedParameters[eventName]?.length || 0} ${groupedParameters[eventName]?.length === 1 ? 'detalj' : 'detaljer'}`
                                      : 'detaljer ikke hentet'}
                                    )
                                  </span>
                                </span>
                              </Accordion.Header>
                              <Accordion.Content className={eventName === MANUAL_EVENT_NAME ? 'bg-blue-50/30' : ''}>
                                <VStack gap="space-4" className="-ml-8 mt-5">
                                  {filteredGroupedParameters[eventName]?.map((param) => {
                                    const displayName = getParameterDisplayName(param)

                                    return (
                                      <div
                                        key={param.key}
                                        className="flex items-center justify-between p-3 bg-[var(--ax-bg-default)] rounded border"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{displayName}</span>
                                        </div>
                                        <HStack gap="space-2">
                                          <Button
                                            variant="secondary"
                                            size="small"
                                            onClick={() => toggleParameterType(param.key, param.type)}
                                            className="min-w-[80px]"
                                          >
                                            {param.type === 'string' ? '📝 Tekst' : '🔢 Tall'}
                                          </Button>
                                          {parameters.some((p) => p.key.startsWith(MANUAL_EVENT_NAME)) && (
                                            <Button
                                              variant="tertiary"
                                              size="small"
                                              onClick={() => removeParameter(param.key)}
                                            >
                                              Fjern
                                            </Button>
                                          )}
                                        </HStack>
                                      </div>
                                    )
                                  })}
                                </VStack>
                              </Accordion.Content>
                            </Accordion.Item>
                          ))}
                        </Accordion>
                      )}
                    </>
                  )}

                <Heading level="3" size="xsmall" spacing className="mt-6">
                  Standard hendelser og detaljer
                </Heading>
                <p className="text-md text-[var(--ax-text-subtle)] mb-4">
                  Sidevisninger og besøk spores automatisk, hvis ikke deaktivert.
                </p>

                <ExpansionCard aria-label="Standarddetaljer som følger med hendelser" size="small">
                  <ExpansionCard.Header>
                    <ExpansionCard.Title as="h3" size="small">
                      <span className="items-center gap-2">
                        <BodyShort weight="semibold">Standarddetaljer som følger med hendelser</BodyShort>
                        <span className="text-sm text-[var(--ax-text-subtle)]">
                          {Object.values(FILTER_COLUMNS).reduce((sum, group) => {
                            const filteredColumns = group.columns.filter((col) => !EXCLUDED_PARAMS.includes(col.value))
                            return sum + filteredColumns.length
                          }, 0)}{' '}
                          detaljer
                        </span>
                      </span>
                    </ExpansionCard.Title>
                  </ExpansionCard.Header>
                  <ExpansionCard.Content>
                    <VStack gap="space-4">
                      <div className="flex flex-col gap-3">
                        {/* Map through FILTER_COLUMNS categories */}
                        {Object.entries(FILTER_COLUMNS).map(([key, group]) => (
                          <div key={key}>
                            <div className="mb-2">
                              <BodyShort weight="semibold">{group.label}</BodyShort>
                            </div>
                            {group.columns
                              .filter((column) => !EXCLUDED_PARAMS.includes(column.value))
                              .map((column) => (
                                <div
                                  key={column.value}
                                  className="flex items-center justify-between p-3 bg-[var(--ax-bg-default)] rounded border mb-2"
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{column.label}</span>
                                    <span className="text-xs text-[var(--ax-text-subtle)]">
                                      {getParamDescription(column.value)}
                                    </span>
                                  </div>
                                  <HStack gap="space-2">
                                    <Tag variant="neutral" size="xsmall">
                                      {getParamType(column.value)}
                                    </Tag>
                                  </HStack>
                                </div>
                              ))}
                          </div>
                        ))}
                      </div>
                    </VStack>
                  </ExpansionCard.Content>
                </ExpansionCard>
              </Box>
            )}

            {/* Date Range Settings - Moved from WebsitePicker
              <div>
                <ReadMore className="mt-0" header="Innstillinger for hendelsesinnlasting">
                  <div className="space-y-4 mt-4">
                    <div className="text-sm">
                      Endre tidsperioden for å hente hendelser og detaljer fra en tidligere dato.
                      {maxDaysAvailable > 0 && 
                        ` Du har tilgang til data fra de siste ${maxDaysAvailable} dagene.`
                      }
                    </div>
                    
                    <div className="flex items-end gap-2">
                      <TextField
                        label="Antall dager"
                        type="number"
                        size="small"
                        value={tempDateRangeInDays}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const val = parseInt(e.target.value, 10);
                          setTempDateRangeInDays(isNaN(val) ? 1 : val);
                        }}
                        min={1}
                        max={maxDaysAvailable}
                        className="w-24"
                      />
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={handleDateRangeChange}
                        className="h-[33px]"
                      >
                        Oppdater
                      </Button>
                    </div>
                    
                    {dateChanged && !isLoadingParameters && (
                      <AlertWithCloseButton variant="success">
                        Tilgjengelige hendelser og parametere ble lastet inn
                      </AlertWithCloseButton>
                    )}
                  </div>
                </ReadMore>
              </div> */}

            {/* 
              {!isLoadingParameters && (parameters.some(p => p.key.startsWith(MANUAL_EVENT_NAME)) || availableEvents.length > 0) && (
                <BodyShort size="small" spacing className="text-md text-[var(--ax-text-subtle)] mt-2">
                  <strong>Mangler noen egendefinerte hendelser?</strong>
                </BodyShort>
              )}

         
              {!isLoadingParameters && (
                <div className="-mt-4 mb-2">
                  <ReadMore 
                    header="Legg til hendelser manuelt" 
                    defaultOpen={customParamAccordionOpen}
                    onClick={() => setCustomParamAccordionOpen(!customParamAccordionOpen)}
                  >
                    <VStack gap="4">      
                      <div className="flex gap-2 mt-4 items-end">
                        <TextField 
                          label="Hendelse"
                          description="Du kan legge til flere med komma"
                          value={newParamKey}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewParamKey(e.target.value)}
                          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && addParameter()}
                          style={{ width: '100%' }}
                        />
                        <Button 
                          variant="secondary" 
                          onClick={addParameter}
                          icon={<PlusCircleIcon aria-hidden />}
                          style={{ height: '50px' }}
                        >
                          Legg til
                        </Button>
                      </div>
                    </VStack>
                  </ReadMore>
                </div>
              )}
              */}

            {/* Confirmation Modal for removing manual parameters */}
            <Modal
              open={showConfirmModal}
              onClose={() => setShowConfirmModal(false)}
              header={{ heading: 'Fjerne manuelt lagt til parametere?' }}
              width="small"
            >
              <Modal.Body>
                <p>
                  Ved å fjerne denne gruppen vil alle manuelt lagt til parametere bli slettet. Er du sikker på at du vil
                  fortsette?
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="danger" onClick={confirmRemoveManualParameters}>
                  Ja, fjern parametere
                </Button>
                <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>
                  Avbryt
                </Button>
              </Modal.Footer>
            </Modal>
          </VStack>
        </ExpansionCard.Content>
      </ExpansionCard>

      {/* ReadMore for loading event details - Only show when details not loaded */}
      {!includeParams && onLoadDetailsClick && (
        <div className="mt-4">
          <ReadMore size="small" header="Trenger du også hendelsesdetaljene?">
            <div className="text-sm text-[var(--ax-text-default)] mb-3">
              Mange grafer kan lages uten hendelsesdetaljer. Hent dem kun ved behov.
            </div>
            <Button onClick={onLoadDetailsClick} size="xsmall" variant="secondary">
              Hent hendelsesdetaljer
            </Button>
          </ReadMore>
        </div>
      )}
    </>
  )
}

export default EventParameterSelector
