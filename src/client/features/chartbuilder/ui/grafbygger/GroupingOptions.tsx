import { Button, Heading, Select, Label, TextField, Switch, HelpText } from '@navikt/ds-react';
import { ChevronDownIcon, ChevronUpIcon } from '@navikt/aksel-icons';
import { MoveUp, MoveDown } from 'lucide-react';
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
  const [showCustomSort, setShowCustomSort] = useState<boolean>(false);
  const [showCustomLimit, setShowCustomLimit] = useState<boolean>(false);
  const [showReorderGroupings, setShowReorderGroupings] = useState<boolean>(false);
  const [isGroupingSelectorOpen, setIsGroupingSelectorOpen] = useState<boolean>(false);
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

  const groupedGroupingOptions = useMemo(() => {
    const baseGroups = Object.entries(COLUMN_GROUPS).map(([groupKey, group]) => ({
      key: groupKey,
      label: group.label,
      options: group.columns.map(col => ({ value: col.value, label: col.label }))
    }));

    const parameterOptions = uniqueParameters
      .map(param => ({
        value: `param_${sanitizeColumnName(param.key)}`,
        label: param.key
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nb-NO'));

    baseGroups.push({
      key: 'event_details',
      label: 'Hendelsesdetaljer',
      options: parameterOptions
    });

    return baseGroups;
  }, [COLUMN_GROUPS, uniqueParameters, sanitizeColumnName]);

  const groupingLabelByValue = useMemo(() => {
    return new Map(
      groupedGroupingOptions.flatMap(group =>
        group.options.map(option => [option.value, option.label] as const)
      )
    );
  }, [groupedGroupingOptions]);

  const selectedGroupingLabel = useMemo(() => {
    if (groupByFields.length === 0) return 'Velg grupperinger';
    const firstLabel = groupingLabelByValue.get(groupByFields[0]) || groupByFields[0];
    if (groupByFields.length === 1) return firstLabel;
    return `${firstLabel} +${groupByFields.length - 1}`;
  }, [groupByFields, groupingLabelByValue]);

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
    addGroupByField(field);
  };

  const handleToggleGroupField = (field: string) => {
    if (groupByFields.includes(field)) {
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
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Heading level="2" size="xsmall">
                Gruppert etter...
              </Heading>
              <HelpText title="Hva er en gruppering?">
                Legg til en eller flere grupperinger, disse vises som kolonner i tabeller.
              </HelpText>
            </div>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded-md border border-(--ax-border-neutral) bg-(--ax-bg-default) pl-3 pr-1 py-1.5 text-left text-base"
              onClick={() => setIsGroupingSelectorOpen(prev => !prev)}
            >
              <span>{selectedGroupingLabel}</span>
              <span className="text-(--ax-text-default) shrink-0">
                {isGroupingSelectorOpen ? <ChevronUpIcon aria-hidden fontSize="1.25rem" /> : <ChevronDownIcon aria-hidden fontSize="1.25rem" />}
              </span>
            </button>
            {isGroupingSelectorOpen && (
              <div className="mt-0 rounded-md border border-(--ax-border-neutral) bg-(--ax-bg-default) p-2 space-y-2">
                {groupedGroupingOptions.map(group => (
                  <div key={group.key}>
                    <div className="px-2 py-1 text-xs font-semibold text-(--ax-text-subtle)">
                      {group.label}
                    </div>
                    <div>
                      {group.key === 'event_details' && group.options.length === 0 && (
                        <div className="px-2 py-1.5">
                          <Button
                            variant="secondary"
                            size="xsmall"
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
                      )}
                      {group.options.map(option => {
                        const isSelected = groupByFields.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-(--ax-bg-neutral-soft)"
                            onClick={() => handleToggleGroupField(option.value)}
                          >
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border ${isSelected
                                ? 'border-(--ax-border-accent) bg-(--ax-bg-accent-soft) text-(--ax-text-accent)'
                                : 'border-(--ax-border-neutral) bg-(--ax-bg-default)'}`}
                            >
                              {isSelected ? '✓' : ''}
                            </span>
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {groupByFields.length > 1 && (
            <Switch
              size="small"
              checked={showReorderGroupings}
              onChange={(e) => setShowReorderGroupings(e.target.checked)}
              description="Vis liste for å endre rekkefølge med piler"
            >
              Endre rekkefølge på grupperinger
            </Switch>
          )}

          {showReorderGroupings && groupByFields.length > 1 && (
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
