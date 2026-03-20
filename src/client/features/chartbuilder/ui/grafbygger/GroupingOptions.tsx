import { Button, Heading, Select, Label, Switch, HelpText } from '@navikt/ds-react';
import { ChevronDownIcon, ChevronUpIcon } from '@navikt/aksel-icons';
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
  hideHeader?: boolean;
  isEventsLoading?: boolean;
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
  hideHeader = false,
  isEventsLoading = false
}: GroupingOptionsProps) => {
  const [showReorderGroupings, setShowReorderGroupings] = useState<boolean>(false);
  const [isGroupingSelectorOpen, setIsGroupingSelectorOpen] = useState<boolean>(false);
  const [eventNameWarning, setEventNameWarning] = useState<boolean>(false);
  const [isLoadingParams, setIsLoadingParams] = useState<boolean>(false);

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
        options: [...eventBasicsWithoutDate, ...otherParameterOptions],
        isEventDetailsEmpty: otherParameterOptions.length === 0
      });
    }

    return reorderedGroups;
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

  // Clear timeout when component unmounts
  useEffect(() => {
    return () => {
      if (eventNameWarningTimeoutRef.current) {
        clearTimeout(eventNameWarningTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {!hideHeader && (
        <div className="mb-4">
          <Heading level="2" size="small">
            Gruppert etter...
          </Heading>
        </div>
      )}
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
                      {group.isEventDetailsEmpty && (
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
                          <div key={option.value}>
                            <button
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
                            {option.value === 'created_at' && isSelected && (
                              <div className="px-8 pb-2">
                                <Select
                                  label="Gruppert etter..."
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
                          </div>
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
      </div>
    </>
  );
};

export default GroupingOptions;
