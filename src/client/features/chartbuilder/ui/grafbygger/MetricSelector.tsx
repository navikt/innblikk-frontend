import { Button, Heading, Select, TextField, HelpText, Label, Switch, UNSAFE_Combobox } from '@navikt/ds-react';
import { ChevronDownIcon, ChevronUpIcon } from '@navikt/aksel-icons';
import { MoveUp, MoveDown } from 'lucide-react';
import { useState, useEffect, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import type {
  Parameter,
  Metric,
  MetricOption,
  ColumnOption,
  Filter,
  ColumnGroup
} from '../../../../shared/types/chart.ts';
import AlertWithCloseButton from './AlertWithCloseButton.tsx';

interface SummarizeProps {
  metrics: Metric[];
  parameters: Parameter[];
  METRICS: MetricOption[];
  COLUMN_GROUPS: Record<string, ColumnGroup>;
  getMetricColumns: (parameters: Parameter[], metric: string) => ColumnOption[];
  sanitizeColumnName: (key: string) => string;
  updateMetric: (index: number, updates: Partial<Metric>) => void;
  removeMetric: (index: number) => void;
  addMetric: (metricFunction: string, initialUpdates?: Partial<Metric>) => void;
  moveMetric: (index: number, direction: 'up' | 'down') => void;
  filters: Filter[];
  hideHeader?: boolean;
  availableEvents?: string[];
  isEventsLoading?: boolean;
}

const MetricSelector = forwardRef(({
  metrics,
  parameters,
  METRICS,
  COLUMN_GROUPS,
  getMetricColumns,
  sanitizeColumnName,
  updateMetric,
  removeMetric,
  addMetric,
  moveMetric,
  hideHeader = false,
  availableEvents = [],
  isEventsLoading = false
}: SummarizeProps, ref) => {
  type MetricDropdownOption = {
    id: string;
    label: string;
    metricFunction: string;
    section: string;
    column?: string;
    alias?: string;
    showInMinutes?: boolean;
    defaultColumn?: string;
    mode: 'preset' | 'function';
  };

  const [alertInfo, setAlertInfo] = useState<{ show: boolean, message: string }>({
    show: false,
    message: ''
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editingMetrics, setEditingMetrics] = useState<number[]>([]);
  const [showActiveMetrics, setShowActiveMetrics] = useState<boolean>(false);
  const [isMoreMetricsOpen, setIsMoreMetricsOpen] = useState<boolean>(false);

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

  const resetConfig = (silent = false) => {
    const metricsCopy = [...metrics];
    metricsCopy.forEach(() => {
      removeMetric(0);
    });

    if (!silent) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setAlertInfo({
        show: true,
        message: 'Alle målinger ble tilbakestilt'
      });

      timeoutRef.current = setTimeout(() => {
        setAlertInfo(prev => ({ ...prev, show: false }));
        timeoutRef.current = null;
      }, 4000);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleAlertClose = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setAlertInfo(prev => ({ ...prev, show: false }));
  };

  useEffect(() => {
    const event = new CustomEvent('summarizeStepStatus', {
      detail: {
        hasUserSelectedMetrics: metrics.length > 0
      }
    });
    document.dispatchEvent(event);
  }, [metrics]);

  useImperativeHandle(ref, () => ({
    resetConfig
  }));

  const isShortcutMetric = (metric: Metric): boolean => {
    const shortcutMetrics = [
      { function: 'distinct', column: 'session_id' },
      { function: 'distinct', column: 'visit_id' },
      { function: 'count', column: 'session_id' },
      { function: 'count', column: undefined, alias: 'Antall_sidevisninger' },
      { function: 'count', column: undefined, alias: 'Antall_hendelser' },
      { function: 'percentage', column: 'session_id', alias: 'Andel_av_besokende_pa_side' },
      { function: 'percentage', column: 'session_id' },
      { function: 'percentage', column: 'event_id', alias: 'Andel_av_hendelser_pa_side' },
      { function: 'percentage', column: 'event_id' },
      { function: 'andel', column: 'session_id' },
      { function: 'bounce_rate', column: 'visit_id' },
      { function: 'average', column: 'visit_duration', showInMinutes: true },
      { function: 'average', column: 'visit_duration', showInMinutes: false }
    ];

    return shortcutMetrics.some(shortcut => {
      if (shortcut.function !== metric.function) return false;
      if (shortcut.column !== metric.column) return false;
      if (shortcut.alias && shortcut.alias !== metric.alias) return false;
      if (shortcut.showInMinutes !== undefined && shortcut.showInMinutes !== metric.showInMinutes) return false;
      return true;
    });
  };

  const toggleEditMetric = (index: number) => {
    setEditingMetrics(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  const shouldShowDetailedView = (metric: Metric, index: number): boolean => {
    return editingMetrics.includes(index) || !isShortcutMetric(metric);
  };

  const getMetricDisplayName = (metric: Metric): string => {
    if (metric.function === 'distinct' && metric.column === 'session_id') {
      return 'Antall unike besøkende';
    }
    if (metric.function === 'distinct' && metric.column === 'visit_id') {
      return 'Økter / besøk';
    }

    if (metric.function === 'count' && metric.alias === 'Antall_sidevisninger') {
      return 'Antall sidevisninger';
    }
    if (metric.function === 'count' && metric.alias === 'Antall_hendelser') {
      return 'Antall hendelser';
    }
    if (metric.function === 'percentage' && metric.column === 'session_id' && metric.alias === 'Andel_av_besokende_pa_side') {
      return 'Andel av besøkende på side';
    }
    if (metric.function === 'percentage' && metric.column === 'session_id') {
      return 'Andel av besøkende';
    }
    if (metric.function === 'percentage' && metric.column === 'event_id' && metric.alias === 'Andel_av_hendelser_pa_side') {
      return 'Andel av hendelser på side';
    }
    if (metric.function === 'percentage' && metric.column === 'event_id') {
      return 'Andel av hendelser';
    }
    if (metric.function === 'andel' && metric.column === 'session_id') {
      return 'Andel av totale besøkende';
    }
    if (metric.function === 'bounce_rate' && metric.column === 'visit_id') {
      return 'Fluktrate';
    }
    if (metric.function === 'average' && metric.column === 'visit_duration') {
      return metric.showInMinutes
        ? 'Besøksvarighet i minutter'
        : 'Besøksvarighet i sekunder';
    }
    return METRICS.find(m => m.value === metric.function)?.label || 'Måling';
  };

  const moreMetricGroups = useMemo(() => {
    const presetOptions: MetricDropdownOption[] = [
      {
        id: 'preset_distinct_session_id_unike',
        label: 'Antall unike besøkende',
        metricFunction: 'distinct',
        section: 'Antall',
        column: 'session_id',
        alias: 'Unike_besokende',
        mode: 'preset'
      },
      {
        id: 'preset_distinct_visit_id_okter',
        label: 'Økter / besøk',
        metricFunction: 'distinct',
        section: 'Antall',
        column: 'visit_id',
        alias: 'Okter_besok',
        mode: 'preset'
      },
      {
        id: 'preset_count_sidevisninger',
        label: 'Antall sidevisninger',
        metricFunction: 'count',
        section: 'Antall',
        alias: 'Antall_sidevisninger',
        mode: 'preset'
      },
      {
        id: 'preset_count_hendelser',
        label: 'Antall hendelser',
        metricFunction: 'count',
        section: 'Antall',
        alias: 'Antall_hendelser',
        mode: 'preset'
      },
      {
        id: 'preset_andel_totale_besokende',
        label: 'Andel av totale besøkende',
        metricFunction: 'andel',
        section: 'Andel',
        column: 'session_id',
        alias: 'Andel_av_totale_besokende',
        mode: 'preset'
      },
      {
        id: 'preset_percentage_besokende_pa_side',
        label: 'Andel av besøkende på side',
        metricFunction: 'percentage',
        section: 'Andel',
        column: 'session_id',
        alias: 'Andel_av_besokende_pa_side',
        mode: 'preset'
      },
      {
        id: 'preset_percentage_hendelser_pa_side',
        label: 'Andel av hendelser på side',
        metricFunction: 'percentage',
        section: 'Andel',
        column: 'event_id',
        alias: 'Andel_av_hendelser_pa_side',
        mode: 'preset'
      },
      {
        id: 'preset_bounce_rate',
        label: 'Fluktrate',
        metricFunction: 'bounce_rate',
        section: 'Andel',
        column: 'visit_id',
        alias: 'Fluktrate',
        mode: 'preset'
      },
      {
        id: 'preset_average_visit_duration_min',
        label: 'Besøksvarighet i minutter',
        metricFunction: 'average',
        section: 'Tid',
        column: 'visit_duration',
        alias: 'Gjennomsnittlig_besokstid_minutter',
        showInMinutes: true,
        mode: 'preset'
      },
      {
        id: 'preset_average_visit_duration_sec',
        label: 'Besøksvarighet i sekunder',
        metricFunction: 'average',
        section: 'Tid',
        column: 'visit_duration',
        alias: 'Gjennomsnittlig_besokstid_sekunder',
        showInMinutes: false,
        mode: 'preset'
      }
    ];

    const getFunctionSection = (metricValue: string): string => {
      if (['count', 'distinct', 'count_where', 'sum'].includes(metricValue)) return 'Antall';
      if (['percentage', 'andel', 'bounce_rate'].includes(metricValue)) return 'Andel';
      if (['average', 'median'].includes(metricValue)) return 'Tid';
      return 'Avansert';
    };

    const functionOptions: MetricDropdownOption[] = METRICS.map(metric => ({
      id: `function_${metric.value}`,
      label: metric.label,
      metricFunction: metric.value,
      section: getFunctionSection(metric.value),
      defaultColumn: metric.value === 'percentage' || metric.value === 'andel' ? 'session_id' : undefined,
      mode: 'function'
    }));

    const allOptions = [...presetOptions, ...functionOptions];
    const sectionOrder = ['Antall', 'Andel', 'Tid', 'Avansert'];

    return sectionOrder
      .map(section => ({
        key: section.toLowerCase().replace(/\s+/g, '_'),
        label: section,
        options: allOptions.filter(option => option.section === section)
      }))
      .filter(section => section.options.length > 0);
  }, [METRICS]);

  const findMetricIndex = (
    functionType: string,
    column?: string,
    alias?: string,
    checkMinutes?: boolean
  ): number => {
    return metrics.findIndex(metric =>
      metric.function === functionType &&
      metric.column === column &&
      (alias === undefined || metric.alias === alias) &&
      (checkMinutes === undefined || metric.showInMinutes === checkMinutes)
    );
  };

  const isDropdownOptionSelected = (option: MetricDropdownOption): boolean => {
    if (option.mode === 'function') {
      return metrics.some(metric => {
        if (metric.function !== option.metricFunction) return false;
        // Function-options should only represent "generic" metrics,
        // not preset variants with aliases.
        if (metric.alias) return false;
        if (option.defaultColumn) return metric.column === option.defaultColumn;
        return true;
      });
    }

    return findMetricIndex(
      option.metricFunction,
      option.column,
      option.alias,
      option.showInMinutes
    ) >= 0;
  };

  const selectedDropdownOptions = moreMetricGroups.flatMap(group =>
    group.options.filter(option => isDropdownOptionSelected(option))
  );

  const moreMetricsButtonLabel = useMemo(() => {
    if (selectedDropdownOptions.length === 0) return 'Velg målinger';
    if (selectedDropdownOptions.length === 1) return selectedDropdownOptions[0].label;
    return `${selectedDropdownOptions[0].label} +${selectedDropdownOptions.length - 1}`;
  }, [selectedDropdownOptions]);

  const metricNeedsInput = (metric: Metric): boolean => {
    const requiresColumn = new Set(['sum', 'average', 'median', 'distinct', 'percentage', 'andel', 'bounce_rate']);
    if (metric.function === 'count_where') {
      return !metric.column || !metric.whereColumn || !metric.whereValue;
    }
    if (requiresColumn.has(metric.function)) {
      return !metric.column;
    }
    return false;
  };

  const addConfiguredMetric = (
    metricType: string,
    column?: string,
    alias?: string,
    showInMinutes?: boolean
  ) => {
    const updates: Partial<Metric> = {};
    if (column) updates.column = column;
    if (alias) updates.alias = alias;
    if (showInMinutes !== undefined) updates.showInMinutes = showInMinutes;
    addMetric(metricType, updates);
  };

  const toggleDropdownMetricOption = (option: MetricDropdownOption) => {
    if (option.mode === 'function') {
      const matchingIndices = metrics
        .map((metric, index) => ({ metric, index }))
        .filter(({ metric }) => {
          if (metric.function !== option.metricFunction) return false;
          if (metric.alias) return false;
          if (option.defaultColumn) return metric.column === option.defaultColumn;
          return true;
        })
        .map(({ index }) => index);

      if (matchingIndices.length > 0) {
        [...matchingIndices].reverse().forEach(index => removeMetric(index));
        return;
      }

      addMetric(
        option.metricFunction,
        option.defaultColumn ? { column: option.defaultColumn } : undefined
      );
      return;
    }

    const existingMetricIndex = findMetricIndex(
      option.metricFunction,
      option.column,
      option.alias,
      option.showInMinutes
    );

    if (existingMetricIndex >= 0) {
      removeMetric(existingMetricIndex);
      return;
    }

    addConfiguredMetric(
      option.metricFunction,
      option.column,
      option.alias,
      option.showInMinutes
    );
  };

  const dropdownOptionNeedsInput = (option: MetricDropdownOption): boolean => {
    if (!isDropdownOptionSelected(option)) return false;

    if (option.mode === 'function') {
      const functionMetrics = metrics.filter(metric => metric.function === option.metricFunction);
      return functionMetrics.some(metricNeedsInput);
    }

    const metricIndex = findMetricIndex(
      option.metricFunction,
      option.column,
      option.alias,
      option.showInMinutes
    );

    if (metricIndex < 0) return false;
    return metricNeedsInput(metrics[metricIndex]);
  };

  return (
    <>
      {!hideHeader && (
        <div className="flex justify-end items-center mb-4">
          <Button
            variant="tertiary"
            size="small"
            onClick={() => resetConfig(false)}
          >
            Tilbakestill målinger
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

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Heading level="2" size="xsmall" >
              Vis...
            </Heading>
            <HelpText title="Hva er en måling?">
              Legg til en eller flere målinger, disse vises som kolonner i tabeller og grafer.
            </HelpText>
          </div>

          <div className="space-y-4">
            <div>
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-md border border-(--ax-border-neutral) bg-(--ax-bg-default) pl-3 pr-1 py-1.5 text-left text-base"
                onClick={() => setIsMoreMetricsOpen(prev => !prev)}
              >
                <span>{moreMetricsButtonLabel}</span>
                <span className="text-(--ax-text-default) shrink-0">
                  {isMoreMetricsOpen ? <ChevronUpIcon aria-hidden fontSize="1.25rem" /> : <ChevronDownIcon aria-hidden fontSize="1.25rem" />}
                </span>
              </button>
              {isMoreMetricsOpen && (
                <div className="mt-0 rounded-md border border-(--ax-border-neutral) bg-(--ax-bg-default) p-2 space-y-2">
                  {moreMetricGroups.map(group => (
                    <div key={group.key}>
                      <div className="px-2 py-1 text-xs font-semibold text-(--ax-text-subtle)">
                        {group.label}
                      </div>
                      <div>
                        {group.options.map(option => {
                          const isSelected = isDropdownOptionSelected(option);
                          const needsInput = dropdownOptionNeedsInput(option);
                          return (
                            <div key={option.id}>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-(--ax-bg-neutral-soft)"
                                onClick={() => toggleDropdownMetricOption(option)}
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
                              {isSelected && needsInput && (
                                <div className="mt-1 pl-8 pr-2 pb-1">
                                  <div className="rounded-md border border-(--ax-border-accent) bg-(--ax-bg-accent-soft) px-3 py-2 text-sm">
                                    Krever flere valg før målingen er ferdig satt opp.
                                    <button
                                      type="button"
                                      className="ml-1 underline"
                                      onClick={() => setShowActiveMetrics(true)}
                                    >
                                      Vis aktive valg
                                    </button>
                                  </div>
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

            {metrics.length > 0 && (
              <Switch
                size="small"
                checked={showActiveMetrics}
                onChange={(e) => setShowActiveMetrics(e.target.checked)}
              >
                Aktive målingsvalg ({metrics.length})
              </Switch>
            )}

            {showActiveMetrics && metrics.length === 0 && (
              <p className="text-sm text-[var(--ax-text-subtle)]">
                Ingen aktive valg. Velg et målingsvalg, så dukker dem opp her.
              </p>
            )}

            {showActiveMetrics && metrics.map((metric, index) => (
              <div key={index} className={`flex ${shouldShowDetailedView(metric, index) ? 'flex-col' : 'items-center justify-between'} bg-[var(--ax-bg-default)] px-4 py-3 rounded-md border`}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-[var(--ax-text-subtle)]">
                        {index + 1}.
                      </span>
                      <span className="font-medium">
                        {isShortcutMetric(metric) && !shouldShowDetailedView(metric, index)
                          ? getMetricDisplayName(metric)
                          : METRICS.find(m => m.value === metric.function)?.label || 'Måling'}
                        {metric.column === 'visit_duration' && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {metric.showInMinutes ? 'minutter' : 'sekunder'}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isShortcutMetric(metric) ? (
                      <>
                        <Button
                          variant={shouldShowDetailedView(metric, index) ? "primary" : "secondary"}
                          size="small"
                          onClick={() => toggleEditMetric(index)}
                        >
                          {shouldShowDetailedView(metric, index) ? "Minimer" : "Endre"}
                        </Button>
                        <Button
                          variant="tertiary-neutral"
                          size="small"
                          onClick={() => removeMetric(index)}
                        >
                          Fjern
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex gap-1">
                          {index > 0 && (
                            <Button
                              variant="secondary"
                              size="small"
                              icon={<MoveUp size={16} />}
                              onClick={() => moveMetric(index, 'up')}
                              title="Flytt opp"
                            />
                          )}
                          {index < metrics.length - 1 && (
                            <Button
                              variant="secondary"
                              size="small"
                              icon={<MoveDown size={16} />}
                              onClick={() => moveMetric(index, 'down')}
                              title="Flytt ned"
                            />
                          )}
                        </div>
                        <Button
                          variant="tertiary-neutral"
                          size="small"
                          onClick={() => removeMetric(index)}
                        >
                          Fjern
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {shouldShowDetailedView(metric, index) && (
                  <div className="mt-4 border-t pt-4">
                    {metric.function === 'count_where' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Select
                            label="Hva skal telles?"
                            value={metric.column || ''}
                            onChange={(e) => updateMetric(index, { column: e.target.value })}
                            size="small"
                            className="w-full"
                          >
                            <option value="">Velg kolonne...</option>
                            <option value="session_id">Besøk (sessions)</option>
                            <option value="event_id">Hendelser (events)</option>
                            <option value="visit_id">Unike besøkende (visitors)</option>
                          </Select>
                        </div>
                        <div className="bg-[var(--ax-bg-neutral-soft)] p-3 rounded border">
                          <Label size="small" className="mb-2 block">Filtrer på (WHERE)</Label>
                          <div className="flex flex-col gap-2">
                            <Select
                              label="Kolonne"
                              hideLabel
                              value={metric.whereColumn || ''}
                              onChange={(e) => updateMetric(index, { whereColumn: e.target.value, whereValue: '' })}
                              size="small"
                            >
                              <option value="">Velg kolonne...</option>
                              <option value="event_name">Hendelsesnavn</option>
                              <option value="url_path">URL-sti</option>
                              <optgroup label="Enhet">
                                <option value="device">Enhetstype</option>
                                <option value="browser">Nettleser</option>
                                <option value="os">Operativsystem</option>
                              </optgroup>
                            </Select>

                            <Select
                              label="Operator"
                              hideLabel
                              value={metric.whereOperator || '='}
                              onChange={(e) => updateMetric(index, { whereOperator: e.target.value })}
                              size="small"
                            >
                              <option value="=">Er lik (=)</option>
                              <option value="!=">Er ikke lik (!=)</option>
                              <option value="LIKE">Inneholder (LIKE)</option>
                              <option value="NOT LIKE">Inneholder ikke (NOT LIKE)</option>
                              <option value="STARTS_WITH">Starter med</option>
                            </Select>

                            {metric.whereColumn === 'event_name' ? (
                              <div>
                                {isEventsLoading && <div className="text-xs text-[var(--ax-text-subtle)] mb-1">Laster hendelser...</div>}
                                <div className={isEventsLoading ? 'opacity-50 pointer-events-none' : ''}>
                                  <UNSAFE_Combobox
                                    label="Verdi"
                                    hideLabel
                                    options={availableEvents.map(e => ({ label: e, value: e }))}
                                    selectedOptions={metric.whereValue ? [metric.whereValue] : []}
                                    onToggleSelected={(option, isSelected) => {
                                      updateMetric(index, { whereValue: isSelected ? option : '' });
                                    }}
                                    isMultiSelect={false}
                                    size="small"
                                    // @ts-expect-error ds-react typing mismatch on disabled for this combobox variant
                                    disabled={isEventsLoading}
                                  />
                                </div>
                              </div>
                            ) : (
                              <TextField
                                label="Verdi"
                                hideLabel
                                value={metric.whereValue || ''}
                                onChange={(e) => updateMetric(index, { whereValue: e.target.value })}
                                size="small"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row gap-4">
                        {metric.function !== 'count' && (
                          <div className="flex-grow">
                            <Select
                              label="Kolonne"
                              value={metric.column || ''}
                              onChange={(e) => {
                                const updates: Partial<Metric> = {
                                  column: e.target.value,
                                  showInMinutes: undefined
                                };
                                updateMetric(index, updates);
                              }}
                              size="small"
                              className="w-full"
                            >
                              <option value="">Velg kolonne</option>

                              {(metric.function === 'percentage' || metric.function === 'andel') ? (
                                getMetricColumns(parameters, metric.function).map(col => (
                                  <option key={col.value} value={col.value}>
                                    {col.label}
                                  </option>
                                ))
                              ) : (
                                <>
                                  {Object.entries(COLUMN_GROUPS).map(([groupKey, group]) => (
                                    <optgroup key={groupKey} label={(group as { label: string }).label}>
                                      {(group as { columns: { value: string; label: string }[] }).columns.map(col => (
                                        <option key={col.value} value={col.value}>
                                          {col.label}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}

                                  {uniqueParameters.length > 0 && (
                                    <optgroup label="Egendefinerte">
                                      {uniqueParameters.map(param => (
                                        <option key={`param_${param.key}`} value={`param_${sanitizeColumnName(param.key)}`}>
                                          {param.key}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </>
                              )}
                            </Select>

                            {metric.column === 'visit_duration' && (
                              <div className="mt-2">
                                <Label size="small">Tidsenhet</Label>
                                <div className="flex gap-2 mt-1">
                                  <Button
                                    variant={metric.showInMinutes ? "secondary" : "primary"}
                                    size="xsmall"
                                    onClick={() => updateMetric(index, { showInMinutes: false })}
                                  >
                                    Sekunder
                                  </Button>
                                  <Button
                                    variant={metric.showInMinutes ? "primary" : "secondary"}
                                    size="xsmall"
                                    onClick={() => updateMetric(index, { showInMinutes: true })}
                                  >
                                    Minutter
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="md:w-1/3">
                          <TextField
                            label="Kolonnetittel (valgfritt)"
                            value={metric.alias || ''}
                            onChange={(e) => updateMetric(index, { alias: e.target.value })}
                            placeholder={`metrikk_${index + 1}`}
                            size="small"
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
});

export default MetricSelector;
