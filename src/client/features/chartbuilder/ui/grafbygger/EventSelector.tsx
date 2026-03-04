import { useState } from 'react';
import { Heading, RadioGroup, Radio, Select, UNSAFE_Combobox, Tabs, Button, Label, Skeleton, Switch, ReadMore } from '@navikt/ds-react';
import type { Filter, Parameter } from '../../../../shared/types/chart.ts';
import AlertWithCloseButton from './AlertWithCloseButton.tsx';

type Option = { label: string; value: string };

type FilterColumn = { value: string; label: string };
type FilterColumnGroup = { label: string; columns: FilterColumn[] };
type FilterColumns = Record<string, FilterColumnGroup>;

interface EventSelectorProps {
  selectedEventTypes: string[];
  handleEventTypeChange: (eventType: string, isChecked: boolean) => void;
  pageViewsMode: 'all' | 'specific' | 'interactive';
  setPageViewsMode: (mode: 'all' | 'specific' | 'interactive') => void;
  customEventsMode: 'none' | 'all' | 'specific' | 'interactive';
  setCustomEventsMode: (mode: 'none' | 'all' | 'specific' | 'interactive') => void;
  urlPathOperator: string;
  setUrlPathOperator: (operator: string) => void;
  selectedPaths: string[];
  handlePathsChange: (paths: string[], operator: string, isInteractive?: boolean) => void;
  eventNameOperator: string;
  setEventNameOperator: (operator: string) => void;
  customEvents: string[];
  handleCustomEventsChange: (events: string[], operator: string, forceEnable?: boolean) => void;
  availablePaths: string[];
  customEventsList: string[];
  filters: Filter[];
  OPERATORS: { value: string; label: string }[];
  onEnableCustomEvents?: (withParams?: boolean) => void;
  // Advanced filters props
  stagingFilter?: Filter | null;
  setStagingFilter?: (filter: Filter | null) => void;
  addFilter?: (column: string) => void;
  commitStagingFilter?: () => void;
  parameters?: Parameter[];
  uniqueParameters?: Parameter[];
  stagingAlertInfo?: { show: boolean; message: string };
  handleStagingAlertClose?: () => void;
  FILTER_COLUMNS?: FilterColumns;
  EVENT_TYPES?: Option[];
  // Active filter props
  removeFilter: (index: number) => void;
  updateFilter: (index: number, updates: Partial<Filter>) => void;
  isDateRangeFilter: (filter: Filter) => boolean;
  isEventsLoading?: boolean;
  addFilterDirectly?: (filter: Filter) => void;
}

const EventSelector = ({
  selectedEventTypes,
  handleEventTypeChange,
  pageViewsMode,
  setPageViewsMode,
  customEventsMode,
  setCustomEventsMode,
  urlPathOperator,
  setUrlPathOperator,
  selectedPaths,
  handlePathsChange,
  availablePaths,
  customEventsList,
  OPERATORS,
  eventNameOperator,
  setEventNameOperator,
  customEvents,
  handleCustomEventsChange,
  onEnableCustomEvents,
  filters,
  stagingFilter,
  setStagingFilter,
  addFilter,
  commitStagingFilter,
  parameters = [],
  uniqueParameters = [],
  stagingAlertInfo,
  handleStagingAlertClose,
  FILTER_COLUMNS,
  EVENT_TYPES,
  removeFilter,
  updateFilter,
  isDateRangeFilter,
  isEventsLoading = false,
  addFilterDirectly
}: EventSelectorProps) => {

  const getCleanParamName = (param: Parameter): string => {
    const parts = param.key.split('.');
    return parts[parts.length - 1];
  };

  const getParamDisplayName = (param: Parameter): string => {
    const parts = param.key.split('.');
    return parts[parts.length - 1];
  };

  // Helper function for combobox options
  const getOptionsForColumn = (column: string, customEventsListIn: string[], availablePathsIn: string[]): Option[] => {
    switch (column) {
      case 'event_name':
        return customEventsListIn.map(event => ({ label: event || '', value: event || '' }));
      case 'url_path':
        return availablePathsIn.map(path => ({ label: path, value: path }));
      case 'event_type':
        return EVENT_TYPES ?? [];
      default:
        return [];
    }
  };

  const activeFilterCount = filters.filter(f => !isDateRangeFilter(f)).length;

  // State for event param filter in "Utvalgte hendelser" mode
  const [selectedEventParam, setSelectedEventParam] = useState<string>('');
  const [eventParamOperator, setEventParamOperator] = useState<string>('=');
  const [eventParamValue, setEventParamValue] = useState<string>('');

  // Track whether user requested params for this session; derive loading state from props
  const [hasRequestedParams, setHasRequestedParams] = useState(false);

  const isParamsLoading = hasRequestedParams && isEventsLoading;

  // Get parameters filtered by selected events
  const filteredParameters = parameters.filter(param => {
    if (customEvents.length === 0) return true;
    const eventName = param.key.includes('.') ? param.key.split('.')[0] : 'Andre';
    return customEvents.some(e => e.toLowerCase() === eventName.toLowerCase());
  });

  // Get unique filtered parameters
  const filteredUniqueParams = filteredParameters.reduce((acc: Parameter[], param) => {
    const baseName = getCleanParamName(param);
    if (!acc.some(p => getCleanParamName(p) === baseName)) {
      acc.push(param);
    }
    return acc;
  }, []);

  // Handle adding/updating the event param filter
  const handleAddEventParamFilter = (valueOverride?: string) => {
    const value = valueOverride ?? eventParamValue;
    if (!selectedEventParam || !value) return;

    // Check if a filter for this column already exists
    const existingFilterIndex = filters.findIndex(f => f.column === selectedEventParam);

    if (existingFilterIndex >= 0) {
      // Update the existing filter
      updateFilter(existingFilterIndex, {
        operator: eventParamOperator,
        value: value
      });
    } else {
      // Create a new filter
      const newFilter: Filter = {
        column: selectedEventParam,
        operator: eventParamOperator,
        value: value
      };

      // Use addFilterDirectly if available to directly add to filters
      if (addFilterDirectly) {
        addFilterDirectly(newFilter);
      }
    }

    // Don't reset the form - keep the selection visible so user can see what's applied
  };

  // Handle fetching params for events
  const handleFetchEventParams = () => {
    setHasRequestedParams(true);
    if (onEnableCustomEvents) onEnableCustomEvents(true);
  };

  return (
    <div className='mb-4'>
      <Heading level="2" size="xsmall" spacing className="mt-6">
        Hendelser
      </Heading>

      <div className="mt-3 bg-(--ax-bg-default) p-4 rounded-md border shadow-inner">
        <Tabs defaultValue="sidestier" size="small">
          <Tabs.List>
            <Tabs.Tab value="sidestier" label="Sidevisninger" />
            <Tabs.Tab value="hendelser" label="Egne hendelser" />
            <Tabs.Tab value="flere_valg" label="Filtre" />
            <Tabs.Tab value="active_filters" label={`Aktive filtre (${activeFilterCount})`} />
          </Tabs.List>

          <Tabs.Panel value="sidestier" className="pt-6">
            <div className="space-y-4">

              <Switch
                checked={selectedEventTypes.includes('pageviews')}
                onChange={(e) => handleEventTypeChange('pageviews', e.target.checked)}
                description='Sider velges via filter i dashboardet'
              >
                Sidevisninger
              </Switch>

              {selectedEventTypes.includes('pageviews') && (
                <div className="pl-0 mt-4">
                  <ReadMore header="Overstyr sidevalg" size="small">
                    <div className="pt-2">
                      <RadioGroup
                        legend="Valg for sidevisninger"
                        value={pageViewsMode}
                        onChange={(val) => {
                          const newMode = val as 'all' | 'specific' | 'interactive';
                          setPageViewsMode(newMode);

                          // Clear existing paths
                          handlePathsChange([], 'IN');

                          // Add interactive filter if selected - use Metabase parameter syntax directly
                          if (newMode === 'interactive') {
                            // Use Metabase parameter syntax: {{url_sti}}
                            handlePathsChange(['{{url_sti}}'], '=', true);
                          }
                        }}
                      >
                        <Radio value="interactive">Mottaker velger side via filter</Radio>
                        <Radio value="all">Alle (hele nettstedet)</Radio>
                        <Radio value="specific">Lås til utvalgte sider</Radio>
                      </RadioGroup>
                    </div>
                  </ReadMore>

                  <div className="mt-4">
                    {pageViewsMode === 'specific' && (
                      <div className="bg-(--ax-bg-default) p-4 rounded border">
                        <div className="mb-3">
                          <Select
                            label="URL"
                            value={urlPathOperator}
                            onChange={(e) => {
                              const newOperator = e.target.value;
                              setUrlPathOperator(newOperator);

                              if ((newOperator === 'IN' && selectedPaths.length <= 1) ||
                                (urlPathOperator === 'IN' && newOperator !== 'IN')) {
                                const pathValue = selectedPaths.length > 0 ? selectedPaths[0] : '';
                                handlePathsChange(
                                  newOperator === 'IN' ? selectedPaths : [pathValue],
                                  newOperator
                                );
                              } else {
                                handlePathsChange(selectedPaths, newOperator);
                              }
                            }}
                            size="small"
                            className="w-full md:w-1/3"
                          >
                            {OPERATORS.map(op => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        {urlPathOperator === 'IN' ? (
                          <UNSAFE_Combobox
                            label="Velg URL-stier"
                            description="Flere stier kan velges for 'er lik' operator"
                            options={availablePaths.map(path => ({
                              label: path,
                              value: path
                            }))}
                            selectedOptions={selectedPaths}
                            onToggleSelected={(option: string, isSelected: boolean) => {
                              if (option) {
                                const newSelection = isSelected
                                  ? [...selectedPaths, option]
                                  : selectedPaths.filter(p => p !== option);
                                handlePathsChange(newSelection, urlPathOperator);
                              }
                            }}
                            isMultiSelect
                            size="small"
                            allowNewValues
                          />
                        ) : (
                          <UNSAFE_Combobox
                            label="Legg til en eller flere URL-stier"
                            description={
                              urlPathOperator === 'LIKE' ? "Søket vil inneholde verdien uavhengig av posisjon" :
                                urlPathOperator === 'STARTS_WITH' ? "Søket vil finne stier som starter med verdien" :
                                  urlPathOperator === 'ENDS_WITH' ? "Søket vil finne stier som slutter med verdien" :
                                    null
                            }
                            options={availablePaths.map(path => ({
                              label: path,
                              value: path
                            }))}
                            selectedOptions={selectedPaths.length > 0 ? [selectedPaths[0]] : []}
                            onToggleSelected={(option: string, isSelected: boolean) => {
                              if (option) {
                                handlePathsChange(isSelected ? [option] : [], urlPathOperator);
                              }
                            }}
                            isMultiSelect={false}
                            size="small"
                            allowNewValues
                          />
                        )}
                        {selectedPaths.length === 0 && (
                          <div className="mt-2 text-xs text-(--ax-text-subtle)">
                            Når tom vises alle sidevisninger
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="hendelser" className="pt-6">
            <div className="space-y-4">
              <RadioGroup
                legend="Jeg ønsker å inkludere..."
                value={customEventsMode}
                onChange={(val) => {
                  const newMode = val as 'none' | 'all' | 'specific' | 'interactive';

                  // Only trigger data loading if events haven't been loaded yet
                  if (newMode !== 'none' && onEnableCustomEvents && customEventsList.length === 0) {
                    onEnableCustomEvents(false);
                  }

                  // Handle 'none' mode
                  if (newMode === 'none') {
                    handleEventTypeChange('custom_events', false);
                  }

                  // Force update custom_events type if entering specific/interactive/all mode
                  // We remove the check to ensure filters are always re-synced correctly
                  if (newMode === 'specific' || newMode === 'interactive' || newMode === 'all') {
                    handleEventTypeChange('custom_events', true);
                  }

                  setCustomEventsMode(newMode);

                  // Clear events selection when changing modes
                  if (newMode === 'interactive') {
                    handleCustomEventsChange([], 'IN');
                  }

                  // Special handling for interactive mode
                  if (newMode === 'interactive') {
                    handleCustomEventsChange(['{{event_name}}'], '=');
                  }
                }}
              >
                <Radio value="none">Ingen egendefinerte hendelser</Radio>
                <Radio value="specific">Utvalgte hendelser / hendelsesdetaljer</Radio>
                <Radio value="all">Alle hendelser</Radio>
                <Radio value="interactive">Filter der mottaker velger selv i dashboardet</Radio>
              </RadioGroup>
              <div className="mt-4">
                {(customEventsMode === 'specific') && (
                  <div className="bg-(--ax-bg-default) p-4 rounded border">
                    {isEventsLoading && !isParamsLoading && customEventsList.length === 0 && (
                      <div className="mb-4 space-y-3">
                        <Skeleton variant="text" width="40%" />
                        <Skeleton variant="rectangle" height={40} />
                        <Skeleton variant="rectangle" height={40} />
                      </div>
                    )}
                    {customEventsMode === 'specific' && (!isEventsLoading || isParamsLoading) && (
                      <>
                        <div className="mb-3">
                          <Select
                            label="Hendelsesnavn"
                            value={eventNameOperator}
                            onChange={(e) => {
                              const newOperator = e.target.value;
                              setEventNameOperator(newOperator);

                              // Update events format when switching between operators
                              if (customEvents.length > 0) {
                                if (newOperator === 'IN' || eventNameOperator === 'IN') {
                                  handleCustomEventsChange(
                                    customEvents,
                                    newOperator
                                  );
                                }
                              }
                            }}
                            size="small"
                            className="w-full md:w-1/3"
                          >
                            {OPERATORS.map(op => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </>
                    )}
                    {customEventsMode === 'specific' && (!isEventsLoading || isParamsLoading) && (
                      <>
                        {eventNameOperator === 'IN' ? (
                          <UNSAFE_Combobox
                            label="Velg hendelser"
                            description="Flere hendelser kan velges for 'er lik' operator"
                            options={customEventsList.map(event => ({
                              label: event,
                              value: event
                            }))}
                            selectedOptions={customEvents}
                            onToggleSelected={(option: string, isSelected: boolean) => {
                              if (option) {
                                const newSelection = isSelected
                                  ? [...customEvents, option]
                                  : customEvents.filter(e => e !== option);
                                handleCustomEventsChange(newSelection, eventNameOperator);
                              }
                            }}
                            isMultiSelect
                            size="small"
                            allowNewValues
                          />
                        ) : (
                          <UNSAFE_Combobox
                            label="Velg hendelse"
                            description={
                              eventNameOperator === 'LIKE' ? "Søket vil matche hendelser som inneholder verdien" :
                                eventNameOperator === 'STARTS_WITH' ? "Søket vil finne hendelser som starter med verdien" :
                                  eventNameOperator === 'ENDS_WITH' ? "Søket vil finne hendelser som slutter med verdien" :
                                    null
                            }
                            options={customEventsList.map(event => ({
                              label: event,
                              value: event
                            }))}
                            selectedOptions={customEvents.length > 0 ? [customEvents[0]] : []}
                            onToggleSelected={(option: string, isSelected: boolean) => {
                              if (option) {
                                handleCustomEventsChange(isSelected ? [option] : [], eventNameOperator);
                              }
                            }}
                            isMultiSelect={false}
                            size="small"
                            allowNewValues
                          />
                        )}
                      </>
                    )}


                    {/* Hendelsesdata filter section */}
                    <div className="mt-6 pt-4 border-t border-(--ax-border-neutral-subtle)">
                      {(isParamsLoading || isEventsLoading) ? (
                        <div className="space-y-3">
                          <Skeleton variant="text" width="50%" />
                          <Skeleton variant="rectangle" height={40} />
                          <div className="flex gap-2">
                            <Skeleton variant="rectangle" height={40} width="33%" />
                            <Skeleton variant="rectangle" height={40} className="flex-1" />
                          </div>
                        </div>
                      ) : parameters.length === 0 ? (
                        <>
                          <Label as="p" size="small" className="mb-2">
                            Velg hendelsesdetaljer (valgfritt)
                          </Label>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={handleFetchEventParams}
                          >
                            Hent hendelsesdetaljer
                          </Button>
                        </>
                      ) : (
                        <div className="space-y-3">
                          {/* Parameter selector */}
                          <UNSAFE_Combobox
                            label="Velg hendelsesdetaljer (valgfritt)"
                            options={filteredUniqueParams.map(param => ({
                              label: getParamDisplayName(param),
                              value: `param_${getCleanParamName(param)}`
                            }))}
                            selectedOptions={selectedEventParam ? [selectedEventParam] : []}
                            onToggleSelected={(option: string, isSelected: boolean) => {
                              if (isSelected && option) {
                                setSelectedEventParam(option);
                                setEventParamValue('');
                              } else {
                                setSelectedEventParam('');
                              }
                            }}
                            isMultiSelect={false}
                            size="small"
                            shouldAutocomplete={false}
                          />

                          {/* Operator and value when param is selected */}
                          {selectedEventParam && (
                            <>
                              <div className="flex gap-2 items-end">
                                <Select
                                  label="Operator"
                                  value={eventParamOperator}
                                  onChange={(e) => setEventParamOperator(e.target.value)}
                                  size="small"
                                  className="w-1/3"
                                >
                                  {OPERATORS.map(op => (
                                    <option key={op.value} value={op.value}>
                                      {op.label}
                                    </option>
                                  ))}
                                </Select>

                                <div className="flex-1">
                                  <UNSAFE_Combobox
                                    label="Verdi"
                                    options={[]}
                                    selectedOptions={eventParamValue ? [eventParamValue] : []}
                                    onToggleSelected={(option: string, isSelected: boolean) => {
                                      if (option) {
                                        const newValue = isSelected ? option : '';
                                        setEventParamValue(newValue);
                                        if (isSelected && newValue && selectedEventParam) {
                                          handleAddEventParamFilter(newValue);
                                        }
                                      }
                                    }}
                                    isMultiSelect={false}
                                    size="small"
                                    allowNewValues
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {customEventsMode === 'interactive' && (
                  <div className="bg-(--ax-bg-default) p-4 rounded border">
                    <div className="flex items-center gap-3">
                      <div className="shrink-0">
                        <span className="flex items-center justify-center w-6 h-6 bg-green-100 rounded-full">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-600">
                            <path d="M13.3 4.3L6 11.6L2.7 8.3C2.3 7.9 1.7 7.9 1.3 8.3C0.9 8.7 0.9 9.3 1.3 9.7L5.3 13.7C5.5 13.9 5.7 14 6 14C6.3 14 6.5 13.9 6.7 13.7L14.7 5.7C15.1 5.3 15.1 4.7 14.7 4.3C14.3 3.9 13.7 3.9 13.3 4.3Z" fill="currentColor" />
                          </svg>
                        </span>
                      </div>
                      <div>
                        <p className="text-(--ax-text-default)">Hendelsesnavn kan velges som filtervalg</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </Tabs.Panel>

          <Tabs.Panel value="flere_valg" className="pt-6">
            <div className="mb-4">
              <div className="flex gap-2 items-center bg-(--ax-bg-default) p-3 rounded-md border border-(--ax-border-neutral) mt-3 mb-6">
                <Select
                  label="Legg til filtre"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      // Check if auto-enabling custom events is needed
                      if ((val === 'event_name' || val === '_custom_param_') && customEventsMode === 'none') {
                        setCustomEventsMode('all');
                        handleEventTypeChange('custom_events', true);
                      }

                      // Only fetch params if specifically choosing param filter
                      if (val === '_custom_param_' && onEnableCustomEvents) {
                        onEnableCustomEvents(true);
                      }

                      if (addFilter) {
                        addFilter(val);
                      }
                      (e.target as HTMLSelectElement).value = '';
                    }
                  }}
                  size="small"
                  className="grow"
                >
                  <option value="">Velg filter...</option>
                  {FILTER_COLUMNS && Object.entries(FILTER_COLUMNS).map(([groupKey, group]) => (
                    <optgroup key={groupKey} label={group.label}>
                      {group.columns
                        .filter((col) => col.value !== 'created_at')
                        .flatMap((col) => [
                          <option key={col.value} value={col.value}>
                            {col.label}
                          </option>,
                          ...(col.value === 'event_name'
                            ? [<option key={`${col.value}_custom_param_`} value="_custom_param_">Hendelsesdetaljer</option>]
                            : [])
                        ])}
                    </optgroup>
                  ))}
                </Select>
              </div>

              {stagingAlertInfo?.show && (
                <div className="mb-4 mt-4">
                  <AlertWithCloseButton variant="success" onClose={handleStagingAlertClose}>
                    {stagingAlertInfo.message}
                  </AlertWithCloseButton>
                </div>
              )}

              {stagingFilter && setStagingFilter && (
                <div className="mt-3 bg-(--ax-bg-default) p-4 rounded-md border shadow-sm">
                  <div className="flex-1">
                    <div className="grid gap-4">
                      {/* Column Selector */}
                      <div>
                        <Select
                          label="Kolonne"
                          value={stagingFilter.column.startsWith('param_') ? stagingFilter.column : stagingFilter.column}
                          onChange={(e) => setStagingFilter({ ...stagingFilter, column: e.target.value, operator: '=', value: '' })}
                          size="small"
                        >
                          {FILTER_COLUMNS && Object.entries(FILTER_COLUMNS).map(([groupKey, group]) => (
                            <optgroup key={groupKey} label={group.label}>
                              {group.columns.map((col) => (
                                <option key={col.value} value={col.value}>
                                  {col.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                          {parameters.length > 0 && (
                            <>
                              <option value="_custom_param_">Hendelsesdetaljer</option>
                              {/* Keep the current parameter in the list if it's selected, so the Select shows the right label */}
                              {stagingFilter.column.startsWith('param_') && (() => {
                                const selectedParam = uniqueParameters.find(
                                  p => `param_${getCleanParamName(p)}` === stagingFilter.column
                                );
                                return (
                                  <option value={stagingFilter.column}>
                                    {selectedParam ? getParamDisplayName(selectedParam) : stagingFilter.column.replace('param_', '')}
                                  </option>
                                );
                              })()}
                            </>
                          )}
                        </Select>
                      </div>

                      {/* Parameter Selector (Visible when 'Hendelsesdata...' is selected) */}
                      {stagingFilter.column === '_custom_param_' && (
                        <div>
                          {isEventsLoading ? (
                            <div className="space-y-2">
                              <Skeleton variant="text" width="30%" />
                              <Skeleton variant="rectangle" height={40} />
                            </div>
                          ) : parameters.length === 0 ? (
                            <div className="flex flex-col gap-2">
                              <p className="text-sm text-(--ax-text-subtle)">Fant ingen hendelsesdetaljer. Du må hente data før du kan filtrere.</p>
                              <Button
                                variant="secondary"
                                size="small"
                                onClick={() => onEnableCustomEvents && onEnableCustomEvents(true)}
                                type="button"
                              >
                                Hent hendelsesdetaljer
                              </Button>
                            </div>
                          ) : (
                            <UNSAFE_Combobox
                              label="Velg hendelsesdetalj"
                              description="Søk etter hendelsesdetaljen du vil filtrere på"
                              options={uniqueParameters.map(param => ({
                                label: getParamDisplayName(param),
                                value: `param_${getCleanParamName(param)}`
                              }))}
                              selectedOptions={[]}
                              onToggleSelected={(option, isSelected) => {
                                if (isSelected && option) {
                                  setStagingFilter({
                                    ...stagingFilter,
                                    column: option, // This will switch the view to the standard operator/value selectors
                                    operator: '=',
                                    value: ''
                                  });
                                }
                              }}
                              isMultiSelect={false}
                              size="small"
                              shouldAutocomplete={true}
                            />
                          )}
                        </div>
                      )}

                      {/* Operator and Value Selectors (Visible when a valid column is selected) */}
                      {stagingFilter.column !== '_custom_param_' && (
                        <div className="flex gap-2 items-end">
                          {stagingFilter.column !== 'created_at' && !stagingFilter.interactive && (
                            <Select
                              label="Operator"
                              value={stagingFilter.operator || '='}
                              onChange={(e) => setStagingFilter({ ...stagingFilter, operator: e.target.value })}
                              size="small"
                              className="w-1/3"
                            >
                              <option value="INTERACTIVE">Mottaker velger selv</option>
                              {OPERATORS.map(op => (
                                <option key={op.value} value={op.value}>
                                  {op.label}
                                </option>
                              ))}
                            </Select>
                          )}

                          <div className="flex-1">
                            {/* Interactive Filter Info */}
                            {stagingFilter.operator === 'INTERACTIVE' && (
                              <div className="mt-0 bg-blue-50 p-2 rounded text-sm h-full flex flex-col justify-center">
                                <p className="font-medium text-xs">
                                  Mottaker velger selv
                                </p>
                                <p className="text-xs text-(--ax-text-subtle) truncate">
                                  Param: {stagingFilter.column === 'url_path' ? 'url_sti' :
                                    stagingFilter.column === 'event_name' ? 'hendelse' :
                                      stagingFilter.column.toLowerCase().replace(/[^a-z0-9_]/g, '_')}
                                </p>
                              </div>
                            )}

                            {/* Value Input/Select */}
                            {!['IS NULL', 'IS NOT NULL', 'INTERACTIVE'].includes(stagingFilter.operator || '') && (
                              <>
                                {stagingFilter.column === 'event_type' && EVENT_TYPES ? (
                                  <Select
                                    label="Verdi"
                                    value={stagingFilter.value || ''}
                                    onChange={(e) => setStagingFilter({ ...stagingFilter, value: e.target.value })}
                                    size="small"
                                  >
                                    <option value="">Velg hendelsestype</option>
                                    {EVENT_TYPES.map(type => (
                                      <option key={type.value} value={type.value}>
                                        {type.label}
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  <UNSAFE_Combobox
                                    label="Verdi"
                                    description={null}
                                    options={getOptionsForColumn(stagingFilter.column, customEventsList, availablePaths)}
                                    selectedOptions={stagingFilter.multipleValues?.map(v => v || '') ||
                                      (stagingFilter.value ? [stagingFilter.value] : [])}
                                    onToggleSelected={(option: string, isSelected: boolean) => {
                                      if (option) {
                                        const currentValues = stagingFilter.multipleValues ||
                                          (stagingFilter.value ? [stagingFilter.value] : []);
                                        const newValues = isSelected
                                          ? [...new Set([...currentValues, option])]
                                          : currentValues.filter(val => val !== option);

                                        setStagingFilter({
                                          ...stagingFilter,
                                          operator: newValues.length > 1 ? 'IN' : stagingFilter.operator,
                                          multipleValues: newValues.length > 0 ? newValues : undefined,
                                          value: newValues.length > 0 ? newValues[0] : ''
                                        });
                                      }
                                    }}
                                    isMultiSelect={true}
                                    size="small"
                                    allowNewValues={stagingFilter.column !== 'event_type'}
                                    shouldAutocomplete={false}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => commitStagingFilter?.()}
                      disabled={!stagingFilter.operator || (!['IS NULL', 'IS NOT NULL', 'INTERACTIVE'].includes(stagingFilter.operator) && !stagingFilter.value)}
                    >
                      Legg til filter
                    </Button>
                    <Button
                      variant="tertiary"
                      size="small"
                      onClick={() => setStagingFilter(null)}
                    >
                      Avbryt
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="active_filters" className="pt-6">
            {filters.length === 0 && (
              <div className="text-sm text-(--ax-text-subtle)">
                Ingen aktive filtre. Legg til et filter for å få mer spesifikke data.
              </div>
            )}

            {filters.length > 0 && (
              <div className="space-y-3">
                {/* Only show non-date range filters in the regular filter list */}
                {filters.map((filter, index) => !isDateRangeFilter(filter) && (
                  <div key={index} className="bg-(--ax-bg-default) p-3 rounded border border-(--ax-border-neutral)">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2 items-end flex-wrap">
                          <Select
                            label="Kolonne"
                            value={filter.column}
                            onChange={(e) => updateFilter(index, { column: e.target.value, operator: '=', value: '' })}
                            size="small"
                            className="min-w-[150px]"
                          >
                            {FILTER_COLUMNS && Object.entries(FILTER_COLUMNS).map(([groupKey, group]) => (
                              <optgroup key={groupKey} label={group.label}>
                                {group.columns.map((col) => (
                                  <option key={col.value} value={col.value}>
                                    {col.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                            {parameters.length > 0 && (
                              <optgroup label="Hendelsesdetaljer">
                                {uniqueParameters.map(param => (
                                  <option
                                    key={`param_${param.key}`}
                                    value={`param_${getCleanParamName(param)}`}
                                  >
                                    {getParamDisplayName(param)}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </Select>

                          {/* Add interactive toggle button */}
                          {filter.interactive ? (
                            <div className="mb-1">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--ax-bg-accent-soft)] text-[var(--ax-text-accent)]">
                                Mottaker velger selv
                              </span>
                            </div>
                          ) : (
                            // Only show for non-interactive eligible filters
                            <Button
                              variant="tertiary"
                              size="small"
                              className="mb-1"
                              onClick={() => {
                                // Simple inline interactive toggle without alert
                                const paramName = filter.column === 'url_path' ? 'url_sti' :
                                  filter.column === 'event_name' ? 'hendelse' :
                                    filter.column.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                                updateFilter(index, {
                                  operator: '=',
                                  value: `{{${paramName}}}`,
                                  metabaseParam: true,
                                  interactive: true
                                });
                              }}
                            >
                              Gjør til filtervalg
                            </Button>
                          )}

                          {filter.column !== 'created_at' && !filter.interactive && (
                            <Select
                              label="Operator"
                              value={filter.operator || '='}
                              onChange={(e) => updateFilter(index, { operator: e.target.value, value: '' })}
                              size="small"
                              className="min-w-[100px]"
                            >
                              {OPERATORS.map(op => (
                                <option key={op.value} value={op.value}>
                                  {op.label}
                                </option>
                              ))}
                            </Select>
                          )}
                        </div>

                        {/* Show parameter name for interactive filters */}
                        {filter.interactive ? (
                          <div className="bg-[var(--ax-bg-accent-soft)] p-2 rounded text-sm text-[var(--ax-text-default)]">
                            Parameter: <strong>{filter.value?.toString().replace('{{', '').replace('}}', '')}</strong>
                          </div>
                        ) : (
                          // Existing value inputs for non-interactive filters
                          !['IS NULL', 'IS NOT NULL'].includes(filter.operator || '') && (
                            <div>
                              <UNSAFE_Combobox
                                label="Verdi"
                                description={null}
                                options={getOptionsForColumn(filter.column, customEventsList, availablePaths)} // Pass correct arrays
                                selectedOptions={Array.isArray(filter.multipleValues) ? filter.multipleValues.map(v => v || '') :
                                  (filter.value ? [filter.value] : [])}
                                onToggleSelected={(option: string, isSelected: boolean) => {
                                  if (option) {
                                    const currentValues = Array.isArray(filter.multipleValues) ? filter.multipleValues :
                                      (filter.value ? [filter.value] : []);
                                    const newValues = isSelected
                                      ? [...new Set([...currentValues, option])]
                                      : currentValues.filter(val => val !== option);

                                    updateFilter(index, {
                                      operator: newValues.length > 1 ? 'IN' : filter.operator,
                                      multipleValues: newValues.length > 0 ? newValues : undefined,
                                      value: newValues.length > 0 ? newValues[0] : ''
                                    });
                                  }
                                }}
                                isMultiSelect={true}
                                size="small"
                                allowNewValues={filter.column !== 'event_type'}
                                shouldAutocomplete={false}
                              />
                            </div>
                          )
                        )}
                      </div>
                      <Button
                        variant="tertiary-neutral"
                        size="small"
                        onClick={() => removeFilter(index)}
                        className="mt-6"
                      >
                        Fjern
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tabs.Panel>
        </Tabs>
      </div>
    </div >
  );
};

export default EventSelector;
