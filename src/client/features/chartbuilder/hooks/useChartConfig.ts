import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChartConfig, Filter, Metric, Parameter, Website } from '../../../shared/types/chart.ts';
import { useDebounce } from './useDebounce.ts';
import { safeParseJson, isRecord, isMetricArray, isWebsiteLike, isFilterArray } from '../utils/typeGuards.ts';
import { generateSQLCore } from '../utils/sqlGenerator.ts';

export function useChartConfig() {
  const [searchParams] = useSearchParams();

  // Parse URL params for pre-populating from Dashboard
  const websiteIdFromUrl = searchParams.get('websiteId');
  const domainFromUrl = searchParams.get('domain');
  const websiteNameFromUrl = searchParams.get('websiteName');
  const titleFromUrl = searchParams.get('title');
  const urlPathFromUrl = searchParams.get('urlPath');
  const pathOperatorFromUrl = searchParams.get('pathOperator');
  const dateRangeFromUrl = searchParams.get('dateRange');
  const configFromUrl = searchParams.get('config');
  const filtersFromUrl = searchParams.get('filters');

  // Track if we've applied URL params (to avoid re-applying)
  const [hasAppliedUrlParams, setHasAppliedUrlParams] = useState(false);
  // Store pending filters to apply after events are loaded
  const [pendingFiltersFromUrl, setPendingFiltersFromUrl] = useState<Filter[] | null>(null);

  const [config, setConfig] = useState<ChartConfig>({
    website: null,
    filters: [],
    metrics: [],
    groupByFields: [],
    orderBy: null,
    columnOrderMode: 'default',
    dateFormat: 'day',
    paramAggregation: 'unique',
    limit: 1000
  });

  const [filters, setFilters] = useState<Filter[]>([]);
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [dateRangeReady, setDateRangeReady] = useState<boolean>(false);
  const [maxDaysAvailable, setMaxDaysAvailable] = useState<number>(0);

  const [dateRangeInDays, setDateRangeInDays] = useState<number>(7);

  const [forceReload] = useState<boolean>(false);
  const [resetIncludeParams, setResetIncludeParams] = useState<boolean>(false);
  const [requestIncludeParams, setRequestIncludeParams] = useState<boolean>(false);
  // Grafbygger should load full event list on first load (same behavior as EventExplorer).
  const [requestLoadEvents, setRequestLoadEvents] = useState<boolean>(true);
  const [isEventsLoading, setIsEventsLoading] = useState<boolean>(false);

  const [currentStep, setCurrentStep] = useState<number>(1);

  const [hasUserSelectedMetrics, setHasUserSelectedMetrics] = useState<boolean>(false);

  const [alertInfo] = useState<{ show: boolean, message: string }>({
    show: false,
    message: ''
  });

  const debouncedConfig = useDebounce(config, 500);

  // Create a function to calculate the current step based on selections
  const calculateCurrentStep = useCallback(() => {
    if (!config.website) {
      return 1;
    }

    if (!hasUserSelectedMetrics && config.groupByFields.length === 0) {
      return 2;
    }

    if (filters.length === 0) {
      return 3;
    }

    return 4;
  }, [config.website, filters.length, hasUserSelectedMetrics, config.groupByFields.length]);

  // Update the step whenever relevant data changes
  useEffect(() => {
    setCurrentStep(calculateCurrentStep());
  }, [calculateCurrentStep]);

  // Add event listener for the custom event from Summarize
  useEffect(() => {
    const handleSummarizeStepStatus = (
      event: CustomEvent<{ hasUserSelectedMetrics?: boolean }>
    ) => {
      if (event.detail && typeof event.detail.hasUserSelectedMetrics !== 'undefined') {
        setHasUserSelectedMetrics(event.detail.hasUserSelectedMetrics);
      }
    };

    document.addEventListener(
      'summarizeStepStatus',
      handleSummarizeStepStatus as EventListener
    );

    return () => {
      document.removeEventListener(
        'summarizeStepStatus',
        handleSummarizeStepStatus as EventListener
      );
    };
  }, []);

  // Apply URL params from Dashboard on initial load
  useEffect(() => {
    if (hasAppliedUrlParams) return;

    const hasUrlParams = websiteIdFromUrl || configFromUrl || filtersFromUrl || urlPathFromUrl;
    if (!hasUrlParams) {
      setHasAppliedUrlParams(true);
      return;
    }

    if (websiteIdFromUrl && domainFromUrl) {
      const websiteFromUrl: Website = {
        id: websiteIdFromUrl,
        domain: domainFromUrl,
        name: websiteNameFromUrl || domainFromUrl,
        teamId: '',
        createdAt: ''
      };

      setConfig(prev => ({
        ...prev,
        website: websiteFromUrl
      }));
    }

    if (configFromUrl) {
      try {
        const parsedConfig = safeParseJson(configFromUrl);
        if (parsedConfig && isRecord(parsedConfig)) {
          const parsedWebsite = isWebsiteLike(parsedConfig.website) ? parsedConfig.website : null;
          const parsedMetrics = isMetricArray(parsedConfig.metrics) ? parsedConfig.metrics : undefined;
          const parsedConfigSafe: Partial<ChartConfig> = {
            ...parsedConfig,
            website: parsedWebsite,
            metrics: parsedMetrics
          };

          setConfig(prev => ({
            ...prev,
            ...parsedConfigSafe,
            website: prev.website ?? parsedConfigSafe.website ?? null
          }));

          if (parsedMetrics && parsedMetrics.length > 0) {
            setHasUserSelectedMetrics(true);
          }
        }
      } catch (e) {
        console.error('Failed to parse config from URL:', e);
      }
    }

    const filtersToApply: Filter[] = [];

    if (filtersFromUrl) {
      try {
        const parsedFilters = safeParseJson(filtersFromUrl);
        if (isFilterArray(parsedFilters)) {
          filtersToApply.push(...parsedFilters);
        }
      } catch (e) {
        console.error('Failed to parse filters from URL:', e);
      }
    }

    if (urlPathFromUrl && !filtersFromUrl) {
      const paths = urlPathFromUrl.split(',');

      filtersToApply.push({
        column: 'event_type',
        operator: '=',
        value: '1'
      });

      if (paths.length > 1) {
        filtersToApply.push({
          column: 'url_path',
          operator: 'IN',
          value: paths[0],
          multipleValues: paths
        });
      } else if (pathOperatorFromUrl === 'starts-with') {
        filtersToApply.push({
          column: 'url_path',
          operator: 'LIKE',
          value: paths[0]
        });
      } else {
        filtersToApply.push({
          column: 'url_path',
          operator: '=',
          value: paths[0]
        });
      }
    }

    if (dateRangeFromUrl) {
      let fromSQL = '';
      let toSQL = 'CURRENT_TIMESTAMP()';

      if (dateRangeFromUrl === 'current_month') {
        fromSQL = "TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)";
      } else if (dateRangeFromUrl === 'last_month') {
        fromSQL = "TIMESTAMP_TRUNC(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 MONTH), MONTH)";
        toSQL = "TIMESTAMP_SUB(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH), INTERVAL 1 SECOND)";
      } else {
        fromSQL = "TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)";
      }

      filtersToApply.push(
        { column: 'created_at', operator: '>=', value: fromSQL, dateRangeType: 'dynamic' },
        { column: 'created_at', operator: '<=', value: toSQL, dateRangeType: 'dynamic' }
      );

      let days = 30;
      if (dateRangeFromUrl === 'current_month') {
        days = new Date().getDate();
      } else if (dateRangeFromUrl === 'last_month') {
        const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
        days = lastMonth.getDate();
      }
      setDateRangeInDays(days);
    }

    if (filtersToApply.length > 0) {
      setPendingFiltersFromUrl(filtersToApply);
    }

    setHasAppliedUrlParams(true);
  }, [hasAppliedUrlParams, websiteIdFromUrl, domainFromUrl, websiteNameFromUrl, configFromUrl, filtersFromUrl, urlPathFromUrl, pathOperatorFromUrl, dateRangeFromUrl]);

  // Apply pending filters once dateRangeReady is true (EventFilter has mounted)
  useEffect(() => {
    if (pendingFiltersFromUrl && dateRangeReady) {
      setFilters(pendingFiltersFromUrl);
      setPendingFiltersFromUrl(null);
    }
  }, [pendingFiltersFromUrl, dateRangeReady]);

  // Create refs to expose reset functions from child components
  const chartFiltersRef = useRef<{ resetFilters: (silent?: boolean) => void; enableCustomEvents: () => void }>(null);
  const summarizeRef = useRef<{ resetConfig: (silent?: boolean) => void }>(null);
  const displayOptionsRef = useRef<{ resetOptions: (silent?: boolean) => void }>(null);

  const resetAll = () => {
    setAvailableEvents([]);
    setParameters([]);
    setDateRangeReady(false);

    setConfig(prev => ({
      ...prev,
      website: null,
      metrics: [],
      groupByFields: [],
      orderBy: null,
      columnOrderMode: 'default'
    }));

    setResetIncludeParams(prev => !prev);

    if (chartFiltersRef.current) {
      chartFiltersRef.current.resetFilters(true);
    }

    if (summarizeRef.current) {
      summarizeRef.current.resetConfig(true);
    }

    if (displayOptionsRef.current) {
      displayOptionsRef.current.resetOptions(true);
    }
  };

  // Helper functions for metrics
  const addMetric = (functionType?: string) => {
    setConfig(prev => {
      const newMetrics = [...prev.metrics, { function: functionType || 'count' }];
      const updatedConfig = {
        ...prev,
        metrics: newMetrics
      };

      if (newMetrics.length === 1 && !prev.groupByFields.includes('created_at') &&
        (!prev.orderBy || prev.orderBy.column === 'dato')) {
        updatedConfig.orderBy = {
          column: 'metrikk_1',
          direction: 'DESC'
        };
      }

      return updatedConfig;
    });
  };

  const removeMetric = (index: number) => {
    setConfig(prev => {
      if (!prev.metrics[index]) {
        return prev;
      }

      const newConfig = { ...prev };

      const removedMetric = prev.metrics[index];
      const removedMetricAlias = removedMetric.alias || `metrikk_${index + 1}`;

      if (newConfig.orderBy && (
        newConfig.orderBy.column === removedMetricAlias ||
        newConfig.orderBy.column === `andel_${index + 1}` ||
        (removedMetric.function === 'percentage' && !removedMetric.alias && newConfig.orderBy.column === 'andel')
      )) {
        newConfig.orderBy = null;
      }

      newConfig.metrics = prev.metrics.filter((_, i) => i !== index);

      return newConfig;
    });
  };

  const updateMetric = (index: number, updates: Partial<Metric>) => {
    setConfig((prev: ChartConfig) => {
      const currentMetric = prev.metrics[index];
      const oldAlias = currentMetric.alias || `metrikk_${index + 1}`;

      const updatedConfig = {
        ...prev,
        metrics: prev.metrics.map((metric: Metric, i: number): Metric =>
          i === index ? { ...metric, ...updates } : metric
        )
      };

      if (updates.alias !== undefined &&
        prev.orderBy &&
        prev.orderBy.column === oldAlias) {
        updatedConfig.orderBy = {
          column: updates.alias || `metrikk_${index + 1}`,
          direction: prev.orderBy.direction
        };
      }

      return updatedConfig;
    });
  };

  const moveMetric = (index: number, direction: 'up' | 'down') => {
    setConfig(prev => {
      const newMetrics = [...prev.metrics];
      const newIndex = direction === 'up' ? index - 1 : index + 1;

      if (newIndex >= 0 && newIndex < newMetrics.length) {
        [newMetrics[index], newMetrics[newIndex]] = [newMetrics[newIndex], newMetrics[index]];
      }

      return {
        ...prev,
        metrics: newMetrics
      };
    });
  };

  // Helper functions for group by fields
  const addGroupByField = (field: string) => {
    if (!config.groupByFields.includes(field)) {
      setConfig(prev => {
        if (field === 'created_at' && (prev.groupByFields.length === 0)) {
          return {
            ...prev,
            groupByFields: [field, ...prev.groupByFields],
            orderBy: { column: 'dato', direction: 'ASC' }
          };
        }

        return {
          ...prev,
          groupByFields: [...prev.groupByFields, field]
        };
      });
    }
  };

  const removeGroupByField = (field: string) => {
    setConfig(prev => ({
      ...prev,
      groupByFields: prev.groupByFields.filter(f => f !== field)
    }));
  };

  const moveGroupField = (index: number, direction: 'up' | 'down') => {
    setConfig(prev => {
      const newFields = [...prev.groupByFields];
      const newIndex = direction === 'up' ? index - 1 : index + 1;

      if (newIndex >= 0 && newIndex < newFields.length) {
        [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
      }

      return {
        ...prev,
        groupByFields: newFields
      };
    });
  };

  const generatedSQL = useMemo(() => {
    if (!debouncedConfig.website || !debouncedConfig.website.id) {
      return '-- Please select a website to generate SQL';
    }

    // EventFilter adds the default "last 7 days" filter after mount, but SQL can be
    // generated before that effect runs. Apply the same default at generation time.
    const hasDateFilter = filters.some(f => f.column === 'created_at');
    const sqlFilters = hasDateFilter
      ? filters
      : [
        ...filters,
        {
          column: 'created_at',
          operator: '>=',
          value: "TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)",
          dateRangeType: 'dynamic'
        },
        {
          column: 'created_at',
          operator: '<=',
          value: 'CURRENT_TIMESTAMP()',
          dateRangeType: 'dynamic'
        }
      ];

    return generateSQLCore(debouncedConfig, sqlFilters, parameters);
  }, [debouncedConfig, filters, parameters]);

  const setOrderBy = (column: string, direction: 'ASC' | 'DESC') => {
    const metricWithAlias = config.metrics.find(m => m.alias === column);
    if (column === 'andel' && !metricWithAlias) {
      const percentageMetrics = config.metrics.filter(m =>
        m.function === 'percentage' && !m.alias
      );
      if (percentageMetrics.length === 1) {
        column = 'andel';
      }
    }

    setConfig(prev => ({
      ...prev,
      orderBy: {
        column,
        direction
      }
    }));
  };

  const clearOrderBy = () => {
    setConfig(prev => ({
      ...prev,
      orderBy: null
    }));
  };

  const handleWebsiteChange = useCallback((website: Website | null) => {
    setConfig(prev => ({
      ...prev,
      website
    }));
    if (website && website.id !== config.website?.id) {
      setRequestLoadEvents(true);
      setFilters([]);
      setAvailableEvents([]);
      setParameters([]);
      setDateRangeReady(false);
      setConfig(prev => ({
        ...prev,
        website,
        metrics: [],
        groupByFields: [],
        orderBy: null,
        columnOrderMode: 'default'
      }));
    }
  }, [config.website?.id]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dateRange = urlParams.get('dateRange');
    if (dateRange && !isNaN(Number(dateRange))) {
      const days = Number(dateRange);
      if (days > 0 && days <= 90) {
        setDateRangeInDays(days);
      }
    }
  }, []);

  const handleEventsLoad = useCallback((events: string[], autoParameters?: { key: string; type: 'string' }[], maxDays?: number) => {
    setAvailableEvents(events);
    if (autoParameters) {
      setParameters(autoParameters);
    }
    if (maxDays !== undefined) {
      setMaxDaysAvailable(maxDays);
    }
    setDateRangeReady(true);
  }, []);

  const setParamAggregation = (strategy: 'representative' | 'unique') => {
    setConfig(prev => ({
      ...prev,
      paramAggregation: strategy
    }));
  };

  const setLimit = (newLimit: number | null) => {
    setConfig((prev) => {
      const updatedConfig: ChartConfig = {
        ...prev,
        limit: newLimit
      };
      return updatedConfig;
    });
  };

  const setColumnOrderMode = (columnOrderMode: 'default' | 'metrics_first') => {
    setConfig(prev => ({
      ...prev,
      columnOrderMode
    }));
  };

  return {
    // State
    config,
    filters,
    parameters,
    availableEvents,
    dateRangeReady,
    maxDaysAvailable,
    dateRangeInDays,
    forceReload,
    resetIncludeParams,
    requestIncludeParams,
    requestLoadEvents,
    isEventsLoading,
    currentStep,
    alertInfo,
    generatedSQL,
    hasAppliedUrlParams,
    titleFromUrl,

    // Refs
    chartFiltersRef,
    summarizeRef,
    displayOptionsRef,

    // Setters
    setFilters,
    setDateRangeInDays,
    setRequestIncludeParams,
    setRequestLoadEvents,
    setIsEventsLoading,

    // Actions
    resetAll,
    addMetric,
    removeMetric,
    updateMetric,
    moveMetric,
    addGroupByField,
    removeGroupByField,
    moveGroupField,
    setOrderBy,
    clearOrderBy,
    setConfig,
    setParamAggregation,
    setLimit,
    setColumnOrderMode,
    handleWebsiteChange,
    handleEventsLoad,
  };
}
