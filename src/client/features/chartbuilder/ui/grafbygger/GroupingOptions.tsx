import { Accordion, Checkbox, Button, Select, Label, Switch, Search } from '@navikt/ds-react';
import { MoveUp, MoveDown } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import type {
  Parameter,
  DateFormat,
  ColumnGroup,
  Filter
} from '../../../../shared/types/chart.ts';
import AlertWithCloseButton from './AlertWithCloseButton.tsx'; // Import AlertWithCloseButton

interface GroupingOptionsProps {
  groupByFields: string[];
  parameters: Parameter[];
  dateFormat: string | null;
  DATE_FORMATS: DateFormat[];
  COLUMN_GROUPS: Record<string, ColumnGroup>;
  sanitizeColumnName: (key: string) => string;
  addGroupByField: (field: string) => void;
  removeGroupByField: (field: string) => void;
  moveGroupField: (index: number, direction: 'up' | 'down') => void;
  setDateFormat: (format: string) => void;
  filters: Filter[];
  onEnableCustomEvents?: () => void;
  isEventsLoading?: boolean;
  resetSignal?: number;
}

const GroupingOptions = ({
  groupByFields,
  parameters,
  dateFormat,
  DATE_FORMATS,
  COLUMN_GROUPS,
  sanitizeColumnName,
  addGroupByField,
  removeGroupByField,
  moveGroupField,
  setDateFormat,
  filters,
  onEnableCustomEvents,
  isEventsLoading = false,
  resetSignal
}: GroupingOptionsProps) => {
  const [showReorderGroupings, setShowReorderGroupings] = useState<boolean>(false);
  const [eventNameWarning, setEventNameWarning] = useState<boolean>(false);
  const [eventDetailsSearch, setEventDetailsSearch] = useState<string>('');
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

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

  const filteredParameters = useMemo(() => {
    const eventNameFilter = filters.find(filter => filter.column === 'event_name');
    if (!eventNameFilter) {
      return parameters;
    }

    const operator = eventNameFilter.operator || '=';
    const rawValue = (eventNameFilter.value || '').toLowerCase().trim();
    const rawValues = (eventNameFilter.multipleValues || [])
      .map(value => value.toLowerCase().trim())
      .filter(Boolean);

    const matchesEventName = (eventName: string): boolean => {
      const normalizedEventName = eventName.toLowerCase();

      if (operator === 'IN') {
        return rawValues.includes(normalizedEventName);
      }

      if (operator === '=') {
        return normalizedEventName === rawValue;
      }

      if (operator === 'LIKE') {
        return normalizedEventName.includes(rawValue);
      }

      if (operator === 'STARTS_WITH') {
        return normalizedEventName.startsWith(rawValue);
      }

      if (operator === 'ENDS_WITH') {
        return normalizedEventName.endsWith(rawValue);
      }

      return true;
    };

    return parameters.filter(param => {
      const splitIndex = param.key.indexOf('.');
      if (splitIndex === -1) return false;
      const eventName = param.key.slice(0, splitIndex);
      return matchesEventName(eventName);
    });
  }, [parameters, filters]);

  const uniqueParameters = getUniqueParameters(filteredParameters);

  const groupedGroupingOptions = useMemo(() => {
    const baseGroups = Object.entries(COLUMN_GROUPS).map(([groupKey, group]) => ({
      key: groupKey,
      label: group.label,
      options: group.columns.map(col => ({ value: col.value, label: col.label })),
      isEventDetailsEmpty: false
    }));

    const parameterOptions = uniqueParameters
      .map(param => ({
        value: `param_${sanitizeColumnName(param.key)}`,
        label: param.key
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nb-NO'));

    const daoOption = parameterOptions.find(option => option.label.toLowerCase() === 'dao');
    const otherParameterOptions = parameterOptions.filter(option => option !== daoOption);

    const eventBasicsGroup = baseGroups.find(group => group.key === 'eventBasics');
    const baseGroupsWithoutEventBasics = baseGroups.filter(group => group.key !== 'eventBasics');
    const dateOption = eventBasicsGroup?.options.find(option => option.value === 'created_at');
    const eventBasicsWithoutDate = eventBasicsGroup
      ? eventBasicsGroup.options.filter(option => option.value !== 'created_at')
      : [];

    const reorderedGroups: Array<{
      key: string;
      label: string;
      options: { value: string; label: string }[];
      isEventDetailsEmpty: boolean;
    }> = [];

    if (dateOption) {
      reorderedGroups.push({
        key: 'date',
        label: 'Dato',
        options: [dateOption],
        isEventDetailsEmpty: false
      });
    }

    if (daoOption) {
      reorderedGroups.push({
        key: 'dao',
        label: 'DAO',
        options: [daoOption],
        isEventDetailsEmpty: false
      });
    }

    reorderedGroups.push(...baseGroupsWithoutEventBasics);

    if (eventBasicsGroup) {
      reorderedGroups.push({
        key: 'hendelser',
        label: 'Hendelser',
        options: eventBasicsWithoutDate,
        isEventDetailsEmpty: false
      });

      reorderedGroups.push({
        key: 'hendelsesdetaljer',
        label: 'Hendelsesdetaljer',
        options: otherParameterOptions,
        isEventDetailsEmpty: otherParameterOptions.length === 0
      });
    }

    return reorderedGroups;
  }, [COLUMN_GROUPS, uniqueParameters, sanitizeColumnName]);

  /** Groups shaped for accordion and filtered search in "Hendelsesdetaljer" */
  const comboboxGroups = useMemo(() =>
    groupedGroupingOptions.map(group => {
      const options = group.key === 'hendelsesdetaljer' && eventDetailsSearch.trim()
        ? group.options.filter(option =>
          option.label.toLowerCase().includes(eventDetailsSearch.trim().toLowerCase())
        )
        : group.options;

      return {
        key: group.key,
        label: group.label,
        options: options.map(o => ({ label: o.label, value: o.value })),
        emptyPlaceholder: group.isEventDetailsEmpty ? 'Hent hendelsesdetaljer for å se valg' : undefined,
      };
    }),
    [groupedGroupingOptions, eventDetailsSearch]
  );

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

  // Clear timeout when component unmounts
  useEffect(() => {
    return () => {
      if (eventNameWarningTimeoutRef.current) {
        clearTimeout(eventNameWarningTimeoutRef.current);
      }
    };
  }, []);

  // Close all accordion items when grouping reset is triggered from parent.
  useEffect(() => {
    setOpenAccordions({});
    setEventDetailsSearch('');
  }, [resetSignal]);

  return (
    <>
      <div>
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

        <div className="space-y-4 mb-3">
          <div>
            <div>
              <Accordion size="small" indent={false}>
                {comboboxGroups.map(group => {
                  const selectedInGroup = group.options.filter(o =>
                    groupByFields.includes(o.value)
                  ).length;
                  return (
                    <Accordion.Item
                      key={group.key}
                      open={openAccordions[group.key] ?? false}
                      onOpenChange={(open) => {
                        setOpenAccordions(prev => ({ ...prev, [group.key]: open }));
                      }}
                    >
                      <Accordion.Header>
                        {selectedInGroup > 0 ? `${group.label} (${selectedInGroup})` : group.label}
                      </Accordion.Header>
                      <Accordion.Content>
                        {group.key === 'hendelsesdetaljer' && (
                          <div className="mb-3">
                            {!groupedGroupingOptions.find(g => g.key === 'hendelsesdetaljer')?.isEventDetailsEmpty && (
                              <Search
                                label="Søk i hendelsesdetaljer"
                                variant="simple"
                                size="small"
                                value={eventDetailsSearch}
                                onChange={(value) => setEventDetailsSearch(value)}
                                onClear={() => setEventDetailsSearch('')}
                              />
                            )}
                            {groupedGroupingOptions.find(g => g.key === 'hendelsesdetaljer')?.isEventDetailsEmpty && (
                              <div className="mt-2">
                                <Button
                                  variant="secondary"
                                  size="xsmall"
                                  disabled={isEventsLoading}
                                  onClick={() => {
                                    if (onEnableCustomEvents) {
                                      onEnableCustomEvents();
                                    }
                                  }}
                                >
                                  {isEventsLoading ? 'Henter hendelsesdetaljer...' : 'Hent hendelsesdetaljer'}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                        {group.options.length === 0 && group.emptyPlaceholder ? (
                          <p className="text-xs text-(--ax-text-subtle) italic">{group.emptyPlaceholder}</p>
                        ) : group.key === 'hendelsesdetaljer' && eventDetailsSearch.trim() && group.options.length === 0 ? (
                          <p className="text-xs text-(--ax-text-subtle) italic">
                            Ingen hendelsesdetaljer matcher "{eventDetailsSearch}".
                          </p>
                        ) : (
                          <ul className="list-none m-0 p-0 flex flex-col gap-1">
                            {group.options.map(option => (
                              <li key={option.value}>
                                <Checkbox
                                  size="small"
                                  checked={groupByFields.includes(option.value)}
                                  onChange={() => handleToggleGroupField(option.value)}
                                >
                                  {option.label}
                                </Checkbox>
                                {option.value === 'created_at' && groupByFields.includes('created_at') && (
                                  <div className="mt-2 ml-6">
                                    <Select
                                      label="Visning per"
                                      value={dateFormat || 'day'}
                                      onChange={(e) => setDateFormat(e.target.value)}
                                      size="small"
                                    >
                                      {DATE_FORMATS.map(format => (
                                        <option key={format.value} value={format.value}>
                                          {format.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </Accordion.Content>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </div>
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
      </div>
    </>
  );
};

export default GroupingOptions;
