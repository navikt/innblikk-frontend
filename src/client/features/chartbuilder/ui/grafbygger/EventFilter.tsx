import { Button, Heading } from '@navikt/ds-react';
import { useMemo, useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { Filter, Parameter } from '../../../../shared/types/chart.ts';
import { FILTER_COLUMNS, OPERATORS } from '../../../../shared/lib/constants.ts';
import AlertWithCloseButton from './AlertWithCloseButton.tsx';
import EventSelector from './EventSelector.tsx';

// Event type options for the dropdown
const EVENT_TYPES = [
  { label: 'Sidevisninger', value: '1' },
  { label: 'Egendefinerte hendelser', value: '2' }
];

// Modified interface to receive date range info
interface ChartFiltersProps {
  filters: Filter[];
  parameters: Parameter[];
  setFilters: (filters: Filter[]) => void;
  availableEvents?: string[];
  onEnableCustomEvents?: (withParams?: boolean) => void;
  hideHeader?: boolean;
  isEventsLoading?: boolean;
}

const EventFilter = forwardRef(({
  filters,
  parameters,
  setFilters,
  availableEvents = [],
  onEnableCustomEvents,
  hideHeader = false,
  isEventsLoading = false
}: ChartFiltersProps, ref) => {
  // Change to store array instead of single string
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>(['pageviews']);
  // Add state to track custom events selection
  const [customEvents, setCustomEvents] = useState<string[]>([]);
  // Add state to track selected URL paths
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [urlPathOperator, setUrlPathOperator] = useState<string>('IN'); // Add this state
  // Add this near other state declarations
  const [stagingFilter, setStagingFilter] = useState<Filter | null>(null);
  // Add a new state for the event operator (near other state variables)
  const [eventNameOperator, setEventNameOperator] = useState<string>('IN');
  // Add these new state variables
  const [pageViewsMode, setPageViewsMode] = useState<'all' | 'specific' | 'interactive'>('interactive');
  const [customEventsMode, setCustomEventsMode] = useState<'none' | 'all' | 'specific' | 'interactive'>('none');

  // Add alert state
  const [alertInfo, setAlertInfo] = useState<{ show: boolean, message: string }>({
    show: false,
    message: ''
  });

  // Add a separate alert state for staging area
  const [stagingAlertInfo, setStagingAlertInfo] = useState<{ show: boolean, message: string }>({
    show: false,
    message: ''
  });

  // Add a ref to store the timeout ID
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Add a ref for staging alert timeout
  const stagingAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitPageviewsRef = useRef<boolean>(false);

  // Add a function to filter available events to only custom events (non-pageviews)
  const customEventsList = useMemo(() => {
    // Filter out null or undefined events and then filter for custom events
    return availableEvents
      .filter(event => event != null) // Filter out null/undefined events
      .filter(event =>
        !event.toLowerCase().startsWith('pageview') &&
        !event.includes('/')
      );
  }, [availableEvents]);

  // Update the availablePaths logic to better detect pageview paths
  const availablePaths = useMemo(() => {
    const paths = new Set<string>();
    availableEvents.forEach(event => {
      // Skip null events
      if (event == null) return;

      // Check if it's a pageview event (starts with '/' or contains 'pageview')
      if (event.startsWith('/')) {
        paths.add(event);
      }
    });

    // Sort paths alphabetically
    return Array.from(paths).sort((a, b) => a.localeCompare(b));
  }, [availableEvents]);

  // Change addFilter to accept a column parameter
  const addFilter = (column: string) => {
    if (column) {
      setStagingFilter({ column, operator: '=', value: '' });
    }
  };

  // Add helper function to commit staging filter
  const commitStagingFilter = () => {
    if (stagingFilter) {
      let currentFilters = [...filters];

      // Auto-adjust event_type if filtering by specific event_name
      if (stagingFilter.column === 'event_name') {
        const hasPageviewFilter = currentFilters.some(f => f.column === 'event_type' && f.value === '1');

        if (hasPageviewFilter) {
          // Remove pageview filter
          currentFilters = currentFilters.filter(f => f.column !== 'event_type');
          // Add custom event filter
          currentFilters.push({ column: 'event_type', operator: '=', value: '2' });
          // Update UI state
          setSelectedEventTypes(['custom_events']);
        } else {
          // Check if there is NO event_type filter, add one for custom events to be safe?
          // Usually if there is no filter, it means ALL. But event_name implies custom_events.
          const hasAnyEventTypeFilter = currentFilters.some(f => f.column === 'event_type');
          if (!hasAnyEventTypeFilter) {
            currentFilters.push({ column: 'event_type', operator: '=', value: '2' });
            setSelectedEventTypes(['custom_events']);
          }
        }
        // Ensure custom events mode is set correctly if we are forcing custom events
        // setCustomEventsMode('specific'); // Maybe not needed if we just set the filter?
      }

      // Check if this is an interactive filter
      if (stagingFilter.operator === 'INTERACTIVE') {
        // Generate parameter name based on column name
        const paramName = stagingFilter.column === 'url_path' ? 'url_sti' :
          stagingFilter.column === 'event_name' ? 'hendelse' :
            stagingFilter.column.toLowerCase().replace(/[^a-z0-9_]/g, '_');

        // Create interactive filter
        const interactiveFilter = {
          ...stagingFilter,
          operator: '=',
          value: `{{${paramName}}}`,
          metabaseParam: true,
          interactive: true
        };

        setFilters([...currentFilters, interactiveFilter]);
      } else {
        // Regular filter
        setFilters([...currentFilters, stagingFilter]);
      }

      setStagingFilter(null);

      // Show alert in the staging area
      if (stagingAlertTimeoutRef.current) {
        clearTimeout(stagingAlertTimeoutRef.current);
        stagingAlertTimeoutRef.current = null;
      }

      setStagingAlertInfo({
        show: true,
        message: `Filter lagt til under aktive filter`
      });

      // Auto-hide staging alert after 4 seconds
      stagingAlertTimeoutRef.current = setTimeout(() => {
        setStagingAlertInfo(prev => ({ ...prev, show: false }));
        stagingAlertTimeoutRef.current = null;
      }, 4000);
    }
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, updates: Partial<Filter>) => {
    setFilters(filters.map((filter, i) =>
      i === index ? { ...filter, ...updates } : filter
    ));
  };

  // Add a filter directly to the filters array (without staging)
  const addFilterDirectly = (filter: Filter) => {
    setFilters([...filters, filter]);
  };

  const isDateRangeFilter = (filter: Filter): boolean => {
    return filter.column === 'created_at' && ['>=', '<='].includes(filter.operator || '');
  };

  // Replace toggleFilterSuggestion with new handler
  const handleEventTypeChange = (eventType: string, isChecked: boolean) => {
    let newSelection = [...selectedEventTypes];

    if (isChecked) {
      if (!newSelection.includes(eventType)) {
        newSelection.push(eventType);
        // If enabling custom_events, set default mode if currently none
        if (eventType === 'custom_events' && customEventsMode === 'none') {
          setCustomEventsMode('all');
        }
      }
    } else {
      newSelection = newSelection.filter(type => type !== eventType);
    }

    setSelectedEventTypes(newSelection);

    // Remove any existing event_type filters
    const cleanFilters = filters.filter(existingFilter =>
      existingFilter.column !== 'event_type'
    );

    // Add new filters based on selection
    const filtersToApply = [...cleanFilters];

    // If both types are selected, use the IN operator
    if (newSelection.includes('pageviews') && newSelection.includes('custom_events')) {
      filtersToApply.push({
        column: 'event_type',
        operator: 'IN',
        value: '1',
        multipleValues: ['1', '2']
      });
    }
    // If only one type is selected, use the = operator
    else if (newSelection.includes('pageviews')) {
      filtersToApply.push({ column: 'event_type', operator: '=', value: '1' });
    }
    else if (newSelection.includes('custom_events')) {
      filtersToApply.push({ column: 'event_type', operator: '=', value: '2' });
    }

    setFilters(filtersToApply);

    // Only reset these selections when fully unchecking a section, not when adding
    if (!isChecked) {
      if (eventType === 'pageviews') {
        // Reset pageview-specific selections when unchecking pageviews
        setSelectedPaths([]);
        setPageViewsMode('interactive');
      } else if (eventType === 'custom_events') {
        // Reset custom events selections when unchecking custom events
        setCustomEvents([]);
        setCustomEventsMode('none');
      }
    }
  };

  // Update the handleCustomEventsChange function to handle different operators
  const handleCustomEventsChange = (selectedEvents: string[], operator: string = eventNameOperator, forceEnable: boolean = false) => {
    setCustomEvents(selectedEvents);
    setEventNameOperator(operator);

    // Find and remove any existing event_name filters
    const baseFilters = filters.filter(f => f.column !== 'event_name');

    // Logic to ensure custom events (type 2) are enabled
    // We execute this if we have specific events selected OR if we are forced to enable custom events (e.g. 'all' mode)
    if (selectedEvents.length > 0 || forceEnable) {
      // Auto-correct: Ensure event_type is correct for event queries
      const pageviewFilterIndex = baseFilters.findIndex(f => f.column === 'event_type' && f.value === '1' && f.operator === '=');

      if (pageviewFilterIndex >= 0) {
        // Upgrade strict pageview filter to include custom events
        baseFilters[pageviewFilterIndex] = {
          column: 'event_type',
          operator: 'IN',
          value: '1',
          multipleValues: ['1', '2']
        };
        setSelectedEventTypes(['pageviews', 'custom_events']);
        // Ensure UI reflects that custom events are active
        if (customEventsMode === 'none' && !forceEnable) setCustomEventsMode('specific');
      } else if (!baseFilters.some(f => f.column === 'event_type')) {
        // If NO event_filter exists, and we are enabling custom events,
        // we should probably just add it.
        // However, if no filter exists, it often means ALL events (1 and 2).
        // Check if we want to restrict to JUST custom events or allow both.
        // If forceEnable (All Custom Events) -> usually means type 2.

        // But wait, if NO filter exists, it means implicit 1 and 2.
        // So we don't strictly need to add one?
        // Yet, if we are in 'specific' mode, typically we filtered for type 2.

        // Let's stick to the previous logic: ensure explicit type 2 filter if missing.
        baseFilters.push({ column: 'event_type', operator: '=', value: '2' });
        setSelectedEventTypes(['custom_events']);
        if (customEventsMode === 'none' && !forceEnable) setCustomEventsMode('specific');
      } else {
        // If a filter exists but isn't strictly pageviews (e.g. it is already custom_events=2 or IN(1,2)),
        // we might need to ensure it includes 2.
        const existingFilter = baseFilters.find(f => f.column === 'event_type');
        if (existingFilter && existingFilter.value === '2' && existingFilter.operator === '=') {
          // Already correct.
        }
        // if existing is IN(1,2), already correct.
      }
    }

    // Only add specific event_name filters if we have selected events
    if (selectedEvents.length > 0) {
      // For IN operator, use multipleValues
      if (operator === 'IN') {
        setFilters([
          ...baseFilters,
          {
            column: 'event_name',
            operator: 'IN',
            value: selectedEvents[0],
            multipleValues: selectedEvents
          }
        ]);
      }
      // For other operators (LIKE, STARTS_WITH, etc.), use normal format
      else {
        setFilters([
          ...baseFilters,
          {
            column: 'event_name',
            operator: operator,
            value: selectedEvents[0]
          }
        ]);
      }
    } else {
      // Keep just the event_type logic updates (without specific event names)
      setFilters(baseFilters);
    }
  };

  // Update function to handle URL path selection
  const handlePathsChange = (paths: string[], operator: string = urlPathOperator, isInteractive = false) => {
    setSelectedPaths(paths);
    setUrlPathOperator(operator);

    // Find and remove any existing url_path filters
    const filtersWithoutPaths = filters.filter(f =>
      !(f.column === 'url_path')
    );

    // Only add url_path filter if paths are selected
    if (paths.length > 0) {
      // For IN operator, use multipleValues
      if (operator === 'IN') {
        setFilters([
          ...filtersWithoutPaths,
          {
            column: 'url_path',
            operator: 'IN',
            value: paths[0],
            multipleValues: paths,
            interactive: false,
            metabaseParam: false
          }
        ]);
      }
      // For other operators (LIKE, STARTS_WITH, etc.), use normal format
      else {
        setFilters([
          ...filtersWithoutPaths,
          {
            column: 'url_path',
            operator: operator,
            value: paths[0],
            interactive: isInteractive,
            metabaseParam: isInteractive
          }
        ]);
      }
    } else {
      setFilters(filtersWithoutPaths);
    }
  };

  // Add this useEffect to sync operator state with filters
  useEffect(() => {
    const urlPathFilter = filters.find(f => f.column === 'url_path');
    if (urlPathFilter && urlPathFilter.operator) {
      setUrlPathOperator(urlPathFilter.operator);
    }
  }, [filters]);

  // Add useEffect to sync operator state with filters (near other useEffects)
  useEffect(() => {
    const eventNameFilter = filters.find(f => f.column === 'event_name');
    if (eventNameFilter && eventNameFilter.operator) {
      setEventNameOperator(eventNameFilter.operator);
    }
  }, [filters]);

  // Keep URL placeholder filter in sync for "Sidevisninger -> Mottaker velger selv"
  // so Vis resultater can show URL input immediately on first load.
  useEffect(() => {
    const pageviewsSelected = selectedEventTypes.includes('pageviews');
    const hasUrlPathFilter = filters.some(f => f.column === 'url_path');

    if (pageviewsSelected && pageViewsMode === 'interactive' && !hasUrlPathFilter) {
      setFilters([
        ...filters,
        { column: 'url_path', operator: '=', value: '{{url_sti}}', interactive: true, metabaseParam: true }
      ]);
    }
  }, [selectedEventTypes, pageViewsMode, filters, setFilters]);

  // Add useEffect to apply initial pageviews filter
  useEffect(() => {
    if (didInitPageviewsRef.current) return;

    const hasUrlPathFilter = filters.some(f => f.column === 'url_path');
    const hasEventTypeFilter = filters.some(f => f.column === 'event_type');
    const hasPageviewsEnabled = !hasEventTypeFilter || filters.some(
      f => f.column === 'event_type' && (
        f.value === '1' || f.multipleValues?.includes('1')
      )
    );

    // Ensure "Mottaker velger side via filter" default on first load.
    if (!hasUrlPathFilter && hasPageviewsEnabled) {
      didInitPageviewsRef.current = true;
      const timer = setTimeout(() => {
        const nextFilters = [...filters];
        if (!hasEventTypeFilter) {
          nextFilters.push({ column: 'event_type', operator: '=', value: '1' });
        }
        nextFilters.push({ column: 'url_path', operator: '=', value: '{{url_sti}}', interactive: true, metabaseParam: true });
        setFilters(nextFilters);
      }, 0);
      return () => clearTimeout(timer);
    }

    didInitPageviewsRef.current = true;
  }, [filters, setFilters]);

  // Create a Set to track unique parameters
  const uniqueParameters = useMemo(() => {
    const seen = new Set();
    return parameters.filter(param => {
      const cleanName = param.key.split('.').pop() || '';
      if (seen.has(cleanName)) {
        return false;
      }
      seen.add(cleanName);
      return true;
    });
  }, [parameters]);

  // Update resetFilters function to accept silent parameter
  const resetFilters = (silent = false) => {
    // Ensure filters are completely cleared
    setFilters([]);

    // Reset UI state but keep 'pageviews' suggestion active
    setSelectedEventTypes(['pageviews']);
    setCustomEvents([]);
    setSelectedPaths([]);
    // Keep the pageViewsMode in 'interactive' state
    setPageViewsMode('interactive');
    setCustomEventsMode('none');
    setStagingFilter(null);

    // Force immediate UI update for filter count by using a setTimeout with 0ms
    setTimeout(() => {
      // Apply initial pageviews + interactive url_path filter
      setFilters([
        { column: 'event_type', operator: '=', value: '1' },
        { column: 'url_path', operator: '=', value: '{{url_sti}}', interactive: true, metabaseParam: true }
      ]);
    }, 0);

    // Only show alert if not silent
    if (!silent) {
      // Clear any existing timeout
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
        alertTimeoutRef.current = null;
      }

      setAlertInfo({
        show: true,
        message: 'Alle filtre ble tilbakestilt'
      });

      alertTimeoutRef.current = setTimeout(() => {
        setAlertInfo(prev => ({ ...prev, show: false }));
        alertTimeoutRef.current = null;
      }, 4000);
    }
  };

  // Add handlers for alert close
  const handleAlertClose = () => {
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    setAlertInfo(prev => ({ ...prev, show: false }));
  };

  const handleStagingAlertClose = () => {
    if (stagingAlertTimeoutRef.current) {
      clearTimeout(stagingAlertTimeoutRef.current);
      stagingAlertTimeoutRef.current = null;
    }
    setStagingAlertInfo(prev => ({ ...prev, show: false }));
  };

  // Clear timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
      if (stagingAlertTimeoutRef.current) {
        clearTimeout(stagingAlertTimeoutRef.current);
      }
    };
  }, []);

  // Expose resetFilters method through ref
  useImperativeHandle(ref, () => ({
    resetFilters,
    enableCustomEvents: () => {
      // Enable custom events if not already enabled
      if (!selectedEventTypes.includes('custom_events')) {
        handleEventTypeChange('custom_events', true);
      }
    }
  }));

  return (
    <section>
      {!hideHeader && (
        <div className="flex justify-between items-center">
          <Heading level="2" size="small" spacing>
            Hvilke hendelser vil du inkludere?
          </Heading>

          {/* Add reset button next to the heading */}
          <Button
            variant="tertiary"
            size="small"
            onClick={() => resetFilters(false)} // Explicitly pass false to show alert
            className="mb-2"
          >
            Tilbakestill filtre
          </Button>
        </div>
      )}

      <div className="space-y-6 relative">
        <div>
          {/* Show alert if it's active */}
          {alertInfo.show && (
            <div className="mb-4">
              <AlertWithCloseButton
                variant="success"
                onClose={handleAlertClose}
              >
                {alertInfo.message}
              </AlertWithCloseButton>
            </div>
          )}

          {/* Replace the Velg hendelse section with EventSelector component */}
          <EventSelector
            selectedEventTypes={selectedEventTypes}
            handleEventTypeChange={handleEventTypeChange}
            pageViewsMode={pageViewsMode}
            setPageViewsMode={setPageViewsMode}
            customEventsMode={customEventsMode}
            setCustomEventsMode={setCustomEventsMode}
            urlPathOperator={urlPathOperator}
            setUrlPathOperator={setUrlPathOperator}
            selectedPaths={selectedPaths}
            handlePathsChange={handlePathsChange}
            eventNameOperator={eventNameOperator}
            setEventNameOperator={setEventNameOperator}
            customEvents={customEvents}
            handleCustomEventsChange={handleCustomEventsChange}
            availablePaths={availablePaths}
            customEventsList={customEventsList}
            filters={filters}
            OPERATORS={OPERATORS}
            onEnableCustomEvents={onEnableCustomEvents}

            // Pass advanced filter props
            stagingFilter={stagingFilter}
            setStagingFilter={setStagingFilter}
            addFilter={addFilter}
            commitStagingFilter={commitStagingFilter}
            parameters={parameters}
            uniqueParameters={uniqueParameters}
            stagingAlertInfo={stagingAlertInfo}
            handleStagingAlertClose={handleStagingAlertClose}
            FILTER_COLUMNS={FILTER_COLUMNS}
            EVENT_TYPES={EVENT_TYPES}

            removeFilter={removeFilter}
            updateFilter={updateFilter}
            isDateRangeFilter={isDateRangeFilter}
            isEventsLoading={isEventsLoading}
            addFilterDirectly={addFilterDirectly}
          />

        </div>
      </div>
    </section>
  );
});

export default EventFilter;
