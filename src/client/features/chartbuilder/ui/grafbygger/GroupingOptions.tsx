import { Button, Heading, Select, Label, TextField, Switch, HelpText, Tabs, Search, Accordion, Pagination } from '@navikt/ds-react';
import { MoveUp, MoveDown, Calendar, Link2, Activity, Smartphone, Globe, Monitor, Cpu, MapPin } from 'lucide-react';
import { useState, useEffect, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import type {
  Parameter,
  DateFormat,
  ColumnGroup,
  OrderBy,
  Metric,
  Filter
} from '../../../../shared/types/chart.ts';
import AlertWithCloseButton from './AlertWithCloseButton.tsx'; // Import AlertWithCloseButton
import DateRangeSelector from './DateRangeSelector.tsx';

interface DisplayOptionsProps {
  groupByFields: string[];
  parameters: Parameter[];
  dateFormat: string | null;
  orderBy: OrderBy | null;
  columnOrderMode: 'default' | 'metrics_first';
  paramAggregation: 'representative' | 'unique';
  limit: number | null;
  DATE_FORMATS: DateFormat[];
  COLUMN_GROUPS: Record<string, ColumnGroup>;
  sanitizeColumnName: (key: string) => string;
  addGroupByField: (field: string) => void;
  removeGroupByField: (field: string) => void;
  moveGroupField: (index: number, direction: 'up' | 'down') => void;
  setOrderBy: (column: string, direction: 'ASC' | 'DESC') => void;
  clearOrderBy: () => void;
  setDateFormat: (format: string) => void;
  setParamAggregation: (strategy: 'representative' | 'unique') => void;
  setLimit: (limit: number | null) => void;
  setColumnOrderMode: (mode: 'default' | 'metrics_first') => void;
  metrics: Metric[];
  filters: Filter[];
  setFilters: (filters: Filter[]) => void;
  maxDaysAvailable: number;
  onEnableCustomEvents?: () => void;
  hideHeader?: boolean;
  isEventsLoading?: boolean;
  interactiveMode: boolean;
  setInteractiveMode: (mode: boolean) => void;
}

const GroupingOptions = forwardRef(({
  groupByFields,
  parameters,
  dateFormat,
  orderBy,
  columnOrderMode,
  limit,
  DATE_FORMATS,
  COLUMN_GROUPS,
  sanitizeColumnName,
  addGroupByField,
  removeGroupByField,
  moveGroupField,
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
  onEnableCustomEvents,
  hideHeader = false,
  isEventsLoading = false,
  interactiveMode,
  setInteractiveMode
}: DisplayOptionsProps, ref) => {
  const [activeGroupingsTab, setActiveGroupingsTab] = useState<string>('basic');
  const [showCustomSort, setShowCustomSort] = useState<boolean>(false);
  const [showCustomLimit, setShowCustomLimit] = useState<boolean>(false);
  const [activeGroupings, setActiveGroupings] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;
  const [alertInfo, setAlertInfo] = useState<{ show: boolean, message: string }>({
    show: false,
    message: ''
  });
  const [limitInput, setLimitInput] = useState<string>('');
  const [eventNameWarning, setEventNameWarning] = useState<boolean>(false);
  const [isLoadingParams, setIsLoadingParams] = useState<boolean>(false);
  const [customPeriodInputs, setCustomPeriodInputs] = useState<Record<number, { amount: string, unit: string }>>({});
  const [selectedDateRange, setSelectedDateRange] = useState<string>('last7days');

  // Add a ref to store the timeout ID
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateRangePickerRef = useRef<{ clearDateRange: () => void }>(null);

  // Add a ref to store the event name warning timeout
  const eventNameWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getUniqueParameters = (params: Parameter[]): Parameter[] => {
    const uniqueParams = new Map<string, Parameter>();

    params.forEach(param => {
      const baseName = param.key.split('.').pop()!;
      if (!uniqueParams.has(baseName)) {
        uniqueParams.set(baseName, {
          key: baseName,
          type: param.type
        });
      }
    });

    return Array.from(uniqueParams.values());
  };

  const uniqueParameters = getUniqueParameters(parameters);

  // Get selected event names from filters
  const selectedEventNames = useMemo(() => {
    const eventNameFilter = filters.find(f => f.column === 'event_name');
    if (!eventNameFilter) return [];

    // Handle multiple values (IN operator)
    if (eventNameFilter.multipleValues && eventNameFilter.multipleValues.length > 0) {
      return eventNameFilter.multipleValues;
    }
    // Handle single value
    if (eventNameFilter.value && typeof eventNameFilter.value === 'string') {
      return [eventNameFilter.value];
    }
    return [];
  }, [filters]);

  const hasEventNameFilter = selectedEventNames.length > 0;

  const groupedAndFilteredParams = useMemo(() => {
    const groups: Record<string, Parameter[]> = {};
    const query = searchQuery.toLowerCase();

    parameters.forEach(param => {
      let eventName = 'Andre';

      if (param.key.includes('.')) {
        eventName = param.key.split('.')[0];
      }

      // Filter by selected event names if any are selected
      if (hasEventNameFilter) {
        const matchesSelectedEvent = selectedEventNames.some(
          selectedEvent => eventName.toLowerCase() === selectedEvent.toLowerCase()
        );
        if (!matchesSelectedEvent) {
          return;
        }
      }

      // Filter based on search query
      const baseName = param.key.split('.').pop()!;
      if (searchQuery &&
        !eventName.toLowerCase().includes(query) &&
        !baseName.toLowerCase().includes(query)) {
        return;
      }

      if (!groups[eventName]) {
        groups[eventName] = [];
      }

      // Avoid duplicates within the same event by displayed parameter name
      // (rendering uses baseName, not the full event-prefixed key).
      if (!groups[eventName].some(p => p.key.split('.').pop() === baseName)) {
        groups[eventName].push(param);
      }
    });

    return groups;
  }, [parameters, searchQuery, hasEventNameFilter, selectedEventNames]);

  // Pagination logic
  const sortedEventNames = useMemo(() => {
    return Object.keys(groupedAndFilteredParams).sort((a, b) => a.localeCompare(b, 'nb-NO'));
  }, [groupedAndFilteredParams]);

  const totalPages = Math.ceil(sortedEventNames.length / ITEMS_PER_PAGE);
  const showPagination = !hasEventNameFilter && !searchQuery && sortedEventNames.length > ITEMS_PER_PAGE;

  const paginatedEventNames = useMemo(() => {
    if (hasEventNameFilter || searchQuery) {
      // Show all when filtered
      return sortedEventNames;
    }
    // Paginate when not filtered
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedEventNames.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [sortedEventNames, currentPage, hasEventNameFilter, searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, hasEventNameFilter]);

  // Reset local loading state when parameters are loaded or external loading completes
  useEffect(() => {
    if (parameters.length > 0 || !isEventsLoading) {
      setIsLoadingParams(false);
    }
  }, [parameters.length, isEventsLoading]);

  // Check if custom events (event_type = 2) are enabled in filters
  const hasCustomEventsEnabled = filters.some(f => {
    if (f.column === 'event_type') {
      // Check single value
      if (f.value === '2') return true;
      // Check multipleValues array for IN operator
      if (f.multipleValues?.includes('2')) return true;
      // Check if value contains '2' (for comma-separated or other formats)
      if (typeof f.value === 'string' && f.value.includes('2')) return true;
    }
    if (f.column === 'event_name' && f.value && f.value !== '') return true;
    return false;
  });

  const handleAddGroupField = (field: string) => {
    // Check if user is trying to add event_name or event_type without custom events enabled
    if ((field === 'event_name' || field === 'event_type') && !hasCustomEventsEnabled) {
      // Automatically enable custom events for the user
      if (onEnableCustomEvents) {
        onEnableCustomEvents();
      }

      // Show success notification
      setEventNameWarning(true);

      // Clear any existing timeout
      if (eventNameWarningTimeoutRef.current) {
        clearTimeout(eventNameWarningTimeoutRef.current);
        eventNameWarningTimeoutRef.current = null;
      }

      // Auto-hide notification after 20 seconds
      eventNameWarningTimeoutRef.current = setTimeout(() => {
        setEventNameWarning(false);
        eventNameWarningTimeoutRef.current = null;
      }, 20000);
    }

    // Always add the field
    setActiveGroupings([...activeGroupings, field]);
    addGroupByField(field);
  };

  const handleToggleGroupField = (field: string) => {
    if (activeGroupings.includes(field)) {
      removeGroupByField(field);
      return;
    }
    handleAddGroupField(field);
  };

  const resetOptions = (silent = false) => {
    const fieldsCopy = [...groupByFields];
    fieldsCopy.forEach(field => {
      removeGroupByField(field);
    });

    clearOrderBy();
    setDateFormat('day');
    setLimit(1000);
    setColumnOrderMode('default');
    setParamAggregation('representative');

    setActiveGroupingsTab('basic');
    setShowCustomSort(false);

    if (!silent) {
      // Clear any existing timeout
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
        alertTimeoutRef.current = null;
      }

      setAlertInfo({
        show: true,
        message: 'Alle visningsvalg ble tilbakestilt'
      });

      alertTimeoutRef.current = setTimeout(() => {
        setAlertInfo(prev => ({ ...prev, show: false }));
        alertTimeoutRef.current = null;
      }, 4000);
    }
  };

  // Add handler for alert close
  const handleAlertClose = () => {
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    setAlertInfo(prev => ({ ...prev, show: false }));
  };

  // Clear timeout when component unmounts
  useEffect(() => {
    return () => {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
      if (eventNameWarningTimeoutRef.current) {
        clearTimeout(eventNameWarningTimeoutRef.current);
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    resetOptions
  }));

  useEffect(() => {
    setActiveGroupings(groupByFields);
  }, [groupByFields]);

  // Sync limitInput with limit prop
  useEffect(() => {
    setLimitInput(limit?.toString() || '');
  }, [limit]);

  return (
    <>
      {!hideHeader && (
        <div className="flex justify-between items-center mb-4">
          <Heading level="2" size="small">
            Hvordan vil du vise resultatene?
          </Heading>

          <Button
            variant="tertiary"
            size="small"
            onClick={() => resetOptions(false)} // Explicitly pass false to show alert
          >
            Tilbakestill visningsvalg
          </Button>
        </div>
      )}
      <div>
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

        {eventNameWarning && (
          <div className="mb-4">
            <AlertWithCloseButton
              variant="info"
              onClose={() => {
                if (eventNameWarningTimeoutRef.current) {
                  clearTimeout(eventNameWarningTimeoutRef.current);
                  eventNameWarningTimeoutRef.current = null;
                }
                setEventNameWarning(false);
              }}
            >
              <strong>Måling av egendefinerte hendelser aktivert:</strong> Du hadde kun valgt hendelsen "sidevisninger". Vi har automatisk aktivert hendelsen "Egendefinerte hendelser" for deg, som muliggjør gruppering på hendelsesnavn og hendelsestype.
            </AlertWithCloseButton>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Heading level="2" size="xsmall" >
              Gruppert etter...
            </Heading>
            <HelpText title="Hva er en gruppering?">
              Legg til en eller flere grupperinger, disse vises som kolonner i tabeller.
            </HelpText>
          </div>

          <div className="bg-[var(--ax-bg-default)] p-4 rounded-md border shadow-inner mb-2">
            <Tabs
              value={activeGroupingsTab}
              onChange={value => setActiveGroupingsTab(value)}
              size="small"
            >
              <Tabs.List>
                <Tabs.Tab value="basic" label="Ofte brukte" />
                <Tabs.Tab value="custom" label="Hendelsesdetaljer" />
                <Tabs.Tab value="advanced" label="Flere valg" />
              </Tabs.List>

              <Tabs.Panel value="basic" className="pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={activeGroupings.includes('created_at') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('created_at')}
                    icon={<Calendar size={16} />}
                  >
                    Dato
                  </Button>
                  <Button
                    variant={activeGroupings.includes('url_path') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('url_path')}
                    icon={<Link2 size={16} />}
                  >
                    URL-sti
                  </Button>
                  <Button
                    variant={activeGroupings.includes('referrer_domain') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('referrer_domain')}
                    icon={<Link2 size={16} />}
                  >
                    Henvisningsdomene
                  </Button>
                  <Button
                    variant={activeGroupings.includes('event_name') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('event_name')}
                    icon={<Activity size={16} />}
                  >
                    Hendelsesnavn
                  </Button>
                  <Button
                    variant={activeGroupings.includes('device') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('device')}
                    icon={<Smartphone size={16} />}
                  >
                    Enhet
                  </Button>
                  <Button
                    variant={activeGroupings.includes('browser') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('browser')}
                    icon={<Globe size={16} />}
                  >
                    Nettleser
                  </Button>
                  <Button
                    variant={activeGroupings.includes('os') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('os')}
                    icon={<Cpu size={16} />}
                  >
                    OS
                  </Button>
                  <Button
                    variant={activeGroupings.includes('language') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('language')}
                    icon={<Globe size={16} />}
                  >
                    Språk
                  </Button>
                  <Button
                    variant={activeGroupings.includes('country') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('country')}
                    icon={<MapPin size={16} />}
                  >
                    Land
                  </Button>
                  <Button
                    variant={activeGroupings.includes('screen') ? "primary" : "secondary"}
                    size="small"
                    onClick={() => handleToggleGroupField('screen')}
                    icon={<Monitor size={16} />}
                  >
                    Skjermstørrelse
                  </Button>
                </div>
              </Tabs.Panel>

              <Tabs.Panel value="custom" className="pt-4">
                {uniqueParameters.length === 0 ? (
                  <div className="flex flex-col items-start justify-center">
                    <Button
                      variant="primary"
                      size="small"
                      loading={isLoadingParams || isEventsLoading}
                      disabled={isLoadingParams || isEventsLoading}
                      onClick={() => {
                        if (onEnableCustomEvents) {
                          setIsLoadingParams(true);
                          onEnableCustomEvents();
                        }
                      }}
                    >
                      {isLoadingParams || isEventsLoading ? 'Henter hendelsesdetaljer...' : 'Hent hendelsesdetaljer'}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      <Search
                        label="Søk i egendefinerte hendelsesdetaljer"
                        hideLabel={false}
                        variant="simple"
                        size="small"
                        value={searchQuery}
                        onChange={setSearchQuery}
                        onClear={() => setSearchQuery('')}
                      />
                    </div>

                    {Object.keys(groupedAndFilteredParams).length === 0 ? (
                      <div className="text-sm text-[var(--ax-text-subtle)] mt-2">
                        {searchQuery ? 'Ingen resultater funnet.' : 'Ingen egendefinerte hendelsesdetaljer funnet for denne nettsiden.'}
                      </div>
                    ) : (
                      <>
                        {hasEventNameFilter && (
                          <div className="mb-3 text-sm text-[var(--ax-text-accent)] bg-[var(--ax-bg-accent-soft)] px-3 py-2 rounded">
                            Viser kun hendelsesdetaljer fra: {selectedEventNames.join(', ')}
                          </div>
                        )}
                        <Accordion size="small" headingSize="xsmall">
                          {paginatedEventNames.map(eventName => {
                            const params = groupedAndFilteredParams[eventName];
                            if (!params) return null;
                            return (
                              <Accordion.Item key={eventName} defaultOpen={!!searchQuery || hasEventNameFilter}>
                                <Accordion.Header>
                                  {eventName === '_manual_parameters_' ? 'Manuelt lagt til' : eventName}
                                  <span className="text-sm text-[var(--ax-text-subtle)] ml-2 font-normal">
                                    ({params.length})
                                  </span>
                                </Accordion.Header>
                                <Accordion.Content>
                                  <div className="flex flex-wrap gap-2">
                                    {params.map(param => {
                                      const baseName = param.key.split('.').pop()!;
                                      const columnValue = `param_${sanitizeColumnName(baseName)}`;
                                      const isActive = activeGroupings.includes(columnValue);

                                      return (
                                        <Button
                                          key={param.key}
                                          variant={isActive ? "primary" : "secondary"}
                                          size="small"
                                          onClick={() => handleToggleGroupField(columnValue)}
                                        >
                                          {baseName}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </Accordion.Content>
                              </Accordion.Item>
                            );
                          })}
                        </Accordion>
                        {showPagination && (
                          <div className="mt-4 flex justify-center">
                            <Pagination
                              page={currentPage}
                              onPageChange={setCurrentPage}
                              count={totalPages}
                              size="small"
                            />
                          </div>
                        )}
                        {!showPagination && sortedEventNames.length > 0 && (
                          <div className="mt-2 text-xs text-[var(--ax-text-subtle)]">
                            Viser {paginatedEventNames.length} av {sortedEventNames.length} hendelser
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </Tabs.Panel>

              <Tabs.Panel value="advanced" className="pt-4">
                <div className="flex gap-2 items-center">
                  <Select
                    label="Grupper etter"
                    description="F.eks. dato (dag, uker, måneder), enhet, nettlesertype, etc."
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddGroupField(e.target.value);
                        (e.target as HTMLSelectElement).value = '';
                      }
                    }}
                    size="small"
                    className="flex-grow"
                  >
                    <option value="">Velg gruppering...</option>
                    {Object.entries(COLUMN_GROUPS).map(([groupKey, group]) => (
                      <optgroup key={groupKey} label={group.label}>
                        {group.columns
                          .filter(col => !groupByFields.includes(col.value))
                          .map(col => (
                            <option key={col.value} value={col.value}>
                              {col.label}
                            </option>
                          ))}
                      </optgroup>
                    ))}

                    {uniqueParameters.length > 0 && (
                      <optgroup label="Hendelsesdetaljer">
                        {uniqueParameters
                          .filter(param => !groupByFields.includes(`param_${sanitizeColumnName(param.key)}`))
                          .sort((a, b) => a.key.localeCompare(b.key, 'nb-NO'))
                          .map(param => (
                            <option key={`param_${param.key}`} value={`param_${sanitizeColumnName(param.key)}`}>
                              {param.key}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </Select>
                </div>
              </Tabs.Panel>
            </Tabs>
          </div>

          {groupByFields.length > 0 && (
            <div className="pt-3 space-y-2">
              <Label as="p" size="small">
                Valgte grupperinger (sorter med pilene):
              </Label>
              <div className="mt-2 flex flex-col gap-2">
                {groupByFields.map((field, index) => {
                  const column = Object.values(COLUMN_GROUPS)
                    .flatMap(group => group.columns)
                    .find(col => col.value === field);

                  const paramName = field.startsWith('param_') ? uniqueParameters.find(
                    p => `param_${sanitizeColumnName(p.key)}` === field
                  )?.key : undefined;

                  return (
                    <div key={field} className="flex items-center justify-between bg-[var(--ax-bg-default)] px-4 py-3 rounded-md border">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-[var(--ax-text-subtle)]">
                            {index + 1}.
                          </span>
                          <span className="font-medium">
                            {paramName || column?.label || field}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {field === 'created_at' && (
                          <Select
                            label=""
                            value={dateFormat || 'day'}
                            onChange={(e) => setDateFormat(e.target.value)}
                            size="small"
                            className="!w-auto min-w-[120px]"
                          >
                            {DATE_FORMATS.map(format => (
                              <option key={format.value} value={format.value}>
                                {format.label}
                              </option>
                            ))}
                          </Select>
                        )}

                        <div className="flex gap-1">
                          {index > 0 && (
                            <Button
                              variant="secondary"
                              size="small"
                              icon={<MoveUp size={16} />}
                              onClick={() => moveGroupField(index, 'up')}
                              title="Flytt opp"
                            />
                          )}
                          {index < groupByFields.length - 1 && (
                            <Button
                              variant="secondary"
                              size="small"
                              icon={<MoveDown size={16} />}
                              onClick={() => moveGroupField(index, 'down')}
                              title="Flytt ned"
                            />
                          )}
                        </div>

                        <Button
                          variant="tertiary-neutral"
                          size="small"
                          onClick={() => removeGroupByField(field)}
                        >
                          Fjern
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <Heading level="2" size="xsmall" spacing className="mt-6">
            Visningsvalg
          </Heading>
          <div className="flex flex-col gap-4 pb-4">
            <Switch
              size="small"
              description={interactiveMode
                ? 'Tidsperiode velges via filter i dasboardet (standard)'
                : 'Bruk valgt tidsperiode fra grafbyggeren som standard'}
              checked={!interactiveMode}
              onChange={(e) => setInteractiveMode(!e.target.checked)}
            >
              Overstyr tidsperiode
            </Switch>

            <div className={interactiveMode ? 'hidden' : undefined}>
              <DateRangeSelector
                ref={dateRangePickerRef}
                filters={filters}
                setFilters={setFilters}
                maxDaysAvailable={maxDaysAvailable}
                selectedDateRange={selectedDateRange}
                setSelectedDateRange={setSelectedDateRange}
                customPeriodInputs={customPeriodInputs}
                setCustomPeriodInputs={setCustomPeriodInputs}
                interactiveMode={interactiveMode}
              />
            </div>

            <Switch
              className="mt-1"
              size="small"
              description={orderBy
                ? `Sorterer etter ${orderBy.column ? orderBy.column.toLowerCase() : 'første kolonne'} i ${orderBy.direction === 'ASC' ? 'stigende' : 'synkende'} rekkefølge`
                : 'Sorterer etter første kolonne i synkende rekkefølge'}
              checked={showCustomSort}
              onChange={() => setShowCustomSort(!showCustomSort)}
            >
              Tilpass sortering
            </Switch>

            {showCustomSort && (
              <>
                <div className="flex flex-col gap-2 bg-[var(--ax-bg-default)] p-3 rounded-md border">
                  <div className="flex gap-2">
                    <Select
                      label="Sorter etter"
                      value={orderBy?.column || ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          const direction = e.target.value === 'dato' ? 'ASC' : 'DESC';
                          setOrderBy(e.target.value, direction);
                        } else {
                          clearOrderBy();
                        }
                      }}
                      size="small"
                      className="flex-grow"
                    >
                      <option value="">Standard sortering</option>
                      <optgroup label="Grupperinger">
                        {groupByFields.map((field) => {
                          const column = Object.values(COLUMN_GROUPS)
                            .flatMap(group => group.columns)
                            .find(col => col.value === field);

                          return (
                            <option key={field} value={field === 'created_at' ? 'dato' : field}>
                              {field === "created_at" ? "Dato" : column?.label || field}
                            </option>
                          );
                        })}
                      </optgroup>
                      <optgroup label="Metrikker">
                        {metrics.map((metric, index) => (
                          <option
                            key={`metrikk_${index}`}
                            value={metric.alias || `metrikk_${index + 1}`}
                          >
                            {metric.alias || `metrikk_${index + 1}`}
                          </option>
                        ))}
                      </optgroup>
                    </Select>

                    <Select
                      label="Retning"
                      value={orderBy?.direction || 'ASC'}
                      onChange={(e) => setOrderBy(
                        orderBy?.column || "",
                        e.target.value as 'ASC' | 'DESC'
                      )}
                      size="small"
                    >
                      <option value="ASC">Stigende (A-Å, 0-9)</option>
                      <option value="DESC">Synkende (Å-A, 9-0)</option>
                    </Select>
                  </div>
                </div>
              </>
            )}

            <Switch
              size="small"
              description={limit && limit !== 1000
                ? `Begrenser til ${limit} rader`
                : 'F.eks. for en topp 10-liste (standard: 1000 rader)'}
              checked={showCustomLimit}
              onChange={(e) => {
                setShowCustomLimit(e.target.checked);
                if (!e.target.checked) {
                  setLimit(1000);
                  setLimitInput('1000');
                }
              }}
            >
              Begrens antall rader
            </Switch>

            {showCustomLimit && (
              <div className="flex gap-2 items-center bg-[var(--ax-bg-default)] p-3 rounded-md border">
                <TextField
                  label="Maksimalt antall rader"
                  type="number"
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  onBlur={() => {
                    const numValue = parseInt(limitInput, 10);
                    if (!isNaN(numValue) && numValue > 0) {
                      setLimit(numValue);
                    } else {
                      setLimit(1000);
                      setLimitInput('1000');
                    }
                  }}
                  min="1"
                  size="small"
                  className="flex-grow"
                />
              </div>
            )}

            <Switch
              size="small"
              description={columnOrderMode === 'metrics_first'
                ? 'Måltall før grupperingskolonner'
                : 'Standard rekkefølge: Grupperinger før måltall'}
              checked={columnOrderMode === 'metrics_first'}
              onChange={(e) => setColumnOrderMode(e.target.checked ? 'metrics_first' : 'default')}
            >
              Bytt kolonnerekkefølge
            </Switch>
          </div>
        </div>
      </div>
    </>
  );
});

export default GroupingOptions;
