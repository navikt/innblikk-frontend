import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { subDays } from 'date-fns';
import { translateValue } from '../../../shared/lib/translations.ts';
import type { Website } from '../../../shared/types/chart.ts';
import { applyUrlFiltersToSql, extractWebsiteId } from '../utils/sqlFilters.ts';

export function useGrafdeling() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [dashboardTitle, setDashboardTitle] = useState<string>('');
  const [queryStats, setQueryStats] = useState<any>(null);
  const [lastProcessedSql, setLastProcessedSql] = useState<string>('');

  // Filter states
  const [availableWebsites, setAvailableWebsites] = useState<Website[]>([]);
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
  const [websiteIdState, setWebsiteIdState] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: now,
    };
  });
  const [period, setPeriod] = useState<string>('current_month');
  const [urlPath, setUrlPath] = useState('/');

  // Placeholder detection flags
  const [hasMetabaseDateFilter, setHasMetabaseDateFilter] = useState(false);
  const [hasUrlPathFilter, setHasUrlPathFilter] = useState(false);
  const [hasWebsiteIdPlaceholder, setHasWebsiteIdPlaceholder] = useState(false);
  const [hasNettsidePlaceholder, setHasNettsidePlaceholder] = useState(false);
  const [customVariables, setCustomVariables] = useState<string[]>([]);
  const [customVariableValues, setCustomVariableValues] = useState<Record<string, string>>({});

  const pathOperatorFromUrl = searchParams.get('pathOperator');

  const websiteId = extractWebsiteId(query);

  const hasFilters = hasMetabaseDateFilter || hasUrlPathFilter || hasWebsiteIdPlaceholder || hasNettsidePlaceholder || customVariables.length > 0;

  // --- Query execution ---

  const executeQuery = useCallback(async (queryToExecute: string) => {
    setLoading(true);
    setError(null);
    setQueryStats(null);

    const processedSql = applyUrlFiltersToSql(queryToExecute, {
      websiteId: websiteIdState,
      selectedWebsiteDomain: selectedWebsite?.domain,
      urlPath,
      pathOperator: pathOperatorFromUrl,
      dateRange,
      customVariables,
      customVariableValues,
    });
    setLastProcessedSql(processedSql);
    console.log('Executing processed SQL:', processedSql);

    try {
      const response = await fetch('/api/bigquery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: processedSql, analysisType: 'Grafdeling' }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Query failed');

      setResult(data);
      setQueryStats(data.queryStats);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [websiteIdState, selectedWebsite?.domain, urlPath, pathOperatorFromUrl, dateRange, customVariables, customVariableValues]);

  const handleRetry = useCallback(() => {
    if (query) executeQuery(query);
  }, [query, executeQuery]);

  // --- Chart data preparation ---

  const prepareLineChartData = useCallback((includeAverage: boolean = false) => {
    if (!result || !result.data || result.data.length === 0) return null;
    const data = result.data;
    const keys = Object.keys(data[0]);

    if (keys.length < 2) return null;

    if (keys.length === 3) {
      const xKey = keys[0];
      const seriesKey = keys[1];
      const yKey = keys[2];
      const seriesMap = new Map<string, any[]>();

      data.forEach((row: any) => {
        const rawSeriesValue = row[seriesKey];
        const translatedSeriesValue = translateValue(seriesKey, rawSeriesValue);
        const seriesValue = String(translatedSeriesValue || 'Ukjent');
        if (!seriesMap.has(seriesValue)) seriesMap.set(seriesValue, []);

        const xValue = row[xKey];
        const yValue = typeof row[yKey] === 'number' ? row[yKey] : parseFloat(row[yKey]) || 0;
        let x: number | Date;
        if (typeof xValue === 'string' && xValue.match(/^\d{4}-\d{2}-\d{2}/)) x = new Date(xValue);
        else if (typeof xValue === 'number') x = xValue;
        else x = new Date(xValue).getTime() || 0;

        seriesMap.get(seriesValue)!.push({ x, y: yValue, xAxisCalloutData: String(xValue), yAxisCalloutData: String(yValue) });
      });

      const colors = ['#0067C5', '#FF9100', '#06893A', '#C30000', '#634689', '#A8874C', '#005B82', '#E18AAA'];
      const lineChartData = Array.from(seriesMap.entries()).map(([seriesName, points], index) => ({
        legend: seriesName,
        data: points,
        color: colors[index % colors.length],
        lineOptions: { lineBorderWidth: '2' },
      }));

      if (includeAverage) {
        const allXValues = new Set<number>();
        lineChartData.forEach(series => series.data.forEach((point: any) => allXValues.add(point.x instanceof Date ? point.x.getTime() : Number(point.x))));
        const averagePoints = Array.from(allXValues).sort((a, b) => a - b).map(xVal => {
          const yValues: number[] = [];
          lineChartData.forEach(series => {
            const point = series.data.find((p: any) => (p.x instanceof Date ? p.x.getTime() : Number(p.x)) === xVal);
            if (point) yValues.push(point.y);
          });
          const avgY = yValues.length > 0 ? yValues.reduce((sum, val) => sum + val, 0) / yValues.length : 0;
          return { x: new Date(xVal), y: avgY, xAxisCalloutData: String(xVal), yAxisCalloutData: avgY.toFixed(2) };
        });
        lineChartData.push({ legend: 'Gjennomsnitt', data: averagePoints, color: '#262626', lineOptions: { lineBorderWidth: '2', strokeDasharray: '5 5' } as any });
      }
      return { data: { lineChartData }, enabledLegendsWrapLines: true };
    }

    const xKey = keys[0];
    const yKey = keys[1];
    const chartPoints = data.map((row: any, index: number) => {
      const xValRaw = row[xKey];
      const xValue = (xValRaw && typeof xValRaw === 'object' && 'value' in xValRaw) ? xValRaw.value : xValRaw;
      const yValue = typeof row[yKey] === 'number' ? row[yKey] : parseFloat(row[yKey]) || 0;
      let x: number | Date;
      if (typeof xValue === 'string' && xValue.match(/^\d{4}-\d{2}-\d{2}/)) x = new Date(xValue);
      else if (typeof xValue === 'number') x = xValue;
      else x = index;
      return { x, y: yValue, xAxisCalloutData: String(xValue), yAxisCalloutData: String(yValue) };
    });

    const lineChartData: any[] = [{ legend: yKey, data: chartPoints, color: '#0067C5', lineOptions: { lineBorderWidth: '2' } }];
    if (includeAverage) {
      const avgY = chartPoints.reduce((sum: number, point: any) => sum + point.y, 0) / chartPoints.length;
      const averageLinePoints = chartPoints.map((point: any) => ({ x: point.x, y: avgY, xAxisCalloutData: point.xAxisCalloutData, yAxisCalloutData: avgY.toFixed(2) }));
      lineChartData.push({ legend: 'Gjennomsnitt', data: averageLinePoints, color: '#262626', lineOptions: { lineBorderWidth: '2', strokeDasharray: '5 5' } as any });
    }
    return { data: { lineChartData }, enabledLegendsWrapLines: true };
  }, [result]);

  const prepareBarChartData = useCallback(() => {
    if (!result || !result.data || result.data.length === 0) return null;
    const data = result.data;
    if (data.length > 12) return null;
    const keys = Object.keys(data[0]);
    if (keys.length < 2) return null;
    const labelKey = keys[0];
    const valueKey = keys[1];
    const total = data.reduce((sum: number, row: any) => sum + (typeof row[valueKey] === 'number' ? row[valueKey] : parseFloat(row[valueKey]) || 0), 0);
    const barChartData = data.map((row: any, index: number) => {
      const value = typeof row[valueKey] === 'number' ? row[valueKey] : parseFloat(row[valueKey]) || 0;
      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
      const rawLabel = row[labelKey];
      const translatedLabel = translateValue(labelKey, rawLabel);
      const label = String(translatedLabel || 'Ukjent');
      return { x: label, y: value, xAxisCalloutData: label, yAxisCalloutData: `${value} (${percentage}%)`, color: ['#0067C5', '#FF9100', '#06893A', '#C30000', '#634689', '#A8874C', '#005B82', '#E18AAA'][index % 8], legend: label };
    });
    return { data: barChartData, barWidth: 'auto' as const, yAxisTickCount: 5, enableReflow: true, legendProps: { allowFocusOnLegends: true, canSelectMultipleLegends: false, styles: { root: { display: 'flex', flexWrap: 'wrap', rowGap: '8px', columnGap: '16px', maxWidth: '100%', fontSize: '16px' }, legend: { marginRight: 0, fontSize: '16px' } } } };
  }, [result]);

  const preparePieChartData = useCallback(() => {
    if (!result || !result.data || result.data.length === 0) return null;
    const data = result.data;
    if (data.length > 12) return null;
    const keys = Object.keys(data[0]);
    if (keys.length < 2) return null;
    const labelKey = keys[0];
    const valueKey = keys[1];
    const total = data.reduce((sum: number, row: any) => sum + (typeof row[valueKey] === 'number' ? row[valueKey] : parseFloat(row[valueKey]) || 0), 0);
    const pieChartData = data.map((row: any) => {
      const value = typeof row[valueKey] === 'number' ? row[valueKey] : parseFloat(row[valueKey]) || 0;
      const rawLabel = row[labelKey];
      const translatedLabel = translateValue(labelKey, rawLabel);
      const label = String(translatedLabel || 'Ukjent');
      return { y: value, x: label };
    });
    return { data: pieChartData, total };
  }, [result]);

  // --- Effects ---

  // Initial load and parse params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let sqlParam = urlParams.get('sql');
    const descParam = urlParams.get('beskrivelse') || urlParams.get('desc');
    const dashboardParam = urlParams.get('dashboard');

    if (descParam) setDescription(descParam);
    if (dashboardParam) setDashboardTitle(dashboardParam);

    const urlPathFromUrl = urlParams.get('urlPath');
    if (urlPathFromUrl) setUrlPath(urlPathFromUrl.split(',')[0]);

    const websiteIdParam = urlParams.get('websiteId');
    if (websiteIdParam) setWebsiteIdState(websiteIdParam);

    // Date range from URL params
    const dateRangeFromUrl = urlParams.get('dateRange');
    const customStartFromUrl = urlParams.get('customStartDate');
    const customEndFromUrl = urlParams.get('customEndDate');

    const now = new Date();

    if (dateRangeFromUrl === 'custom' && customStartFromUrl && customEndFromUrl) {
      setPeriod('custom');
      setDateRange({ from: new Date(customStartFromUrl), to: new Date(customEndFromUrl) });
    } else if (dateRangeFromUrl === 'current_month') {
      setPeriod('current_month');
      setDateRange({ from: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)), to: now });
    } else if (dateRangeFromUrl === 'last_month') {
      setPeriod('last_month');
      setDateRange({
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0),
      });
    }

    if (sqlParam) {
      if (/%(0A|20|3D|27|2C|28|29)/i.test(sqlParam)) {
        try {
          sqlParam = decodeURIComponent(sqlParam);
        } catch (e) {
          console.warn('Failed to decode potentially double-encoded SQL:', e);
        }
      }

      // If SQL is fully concrete and no override inputs are provided, execute as-is.
      // If override inputs exist (website/date/url), convert hardcoded filters to placeholders
      // so Grafdeling controls can override values.
      const hasTemplatePlaceholders = /\[\[|\{\{/.test(sqlParam);
      const hasOverrideInputs = Boolean(
        websiteIdParam ||
        urlPathFromUrl ||
        dateRangeFromUrl ||
        customStartFromUrl ||
        customEndFromUrl,
      );

      if (!hasTemplatePlaceholders && !hasOverrideInputs) {
        setQuery(sqlParam);
        return;
      }

      let modifiedSql = sqlParam;

      // 1. Hardcoded Website ID
      const websiteIdMatch = modifiedSql.match(/website_id\s*=\s*['"]([0-9a-f-]{36})['"]/i);
      if (websiteIdMatch) {
        const foundId = websiteIdMatch[1];
        setWebsiteIdState(foundId);
        modifiedSql = modifiedSql.replace(/website_id\s*=\s*['"][0-9a-f-]{36}['"]/gi, "website_id = {{website_id}}");
      }

      // 2. Hardcoded Date Range
      const dateMatch = modifiedSql.match(/created_at\s+BETWEEN\s+TIMESTAMP\('([^']+)'[^)]*\)\s+AND\s+TIMESTAMP\('([^']+)'[^)]*\)/i);
      if (dateMatch) {
        const startStr = dateMatch[1];
        const endStr = dateMatch[2];
        if (!dateRangeFromUrl) {
          setPeriod('custom');
          setDateRange({ from: new Date(startStr), to: new Date(endStr) });
        }
        const fullDateRegex = /(AND\s+)?[\w\-`.]*created_at\s+BETWEEN\s+TIMESTAMP\('([^']+)'[^)]*\)\s+AND\s+TIMESTAMP\('([^']+)'[^)]*\)/gi;
        modifiedSql = modifiedSql.replace(fullDateRegex, " [[AND {{created_at}} ]]");
      } else if (!dateRangeFromUrl) {
        setPeriod('last_30_days');
        setDateRange({ from: subDays(now, 30), to: now });
      }

      // 3. Hardcoded URL Path
      const urlPathMatch = modifiedSql.match(/url_path\s*=\s*'(\/[^']*)'/i);
      if (urlPathMatch) {
        const foundPath = urlPathMatch[1];
        setUrlPath(foundPath);
        const fullUrlRegex = /(AND\s+)?[\w\-`.]*url_path\s*=\s*'(\/[^']*)'/gi;
        modifiedSql = modifiedSql.replace(fullUrlRegex, " [[AND {{url_sti}} ]]");
      }

      setQuery(modifiedSql);
    } else {
      setError('Ingen SQL-spørring funnet i URL. Del en lenke med ?sql= parameter.');
    }
  }, []);

  // Detect placeholders
  useEffect(() => {
    if (!query) return;

    const datePattern = /\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/i;
    setHasMetabaseDateFilter(datePattern.test(query));

    const urlPathPattern = /\[\[\s*\{\{url_sti\}\}\s*--\s*\]\]\s*'\/'/i;
    const andUrlPathPattern = /\[\[\s*AND\s*\{\{url_sti\}\}\s*\]\]/i;
    const urlPathPattern2 = /\[\[\s*\{\{url_path\}\}\s*--\s*\]\]\s*'\/'/i;
    const andUrlPathPattern2 = /\[\[\s*AND\s*\{\{url_path\}\}\s*\]\]/i;
    const directUrlPathPattern = /\{\{\s*url_(?:sti|path)\s*\}\}/i;
    setHasUrlPathFilter(
      urlPathPattern.test(query) ||
      andUrlPathPattern.test(query) ||
      urlPathPattern2.test(query) ||
      andUrlPathPattern2.test(query) ||
      directUrlPathPattern.test(query)
    );

    setHasWebsiteIdPlaceholder(/\{\{\s*website_id\s*\}\}/i.test(query));
    setHasNettsidePlaceholder(/\{\{\s*nettside\s*\}\}/i.test(query));

    const allVariablesRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/gi;
    const matches = [...query.matchAll(allVariablesRegex)];
    const knownVariables = ['website_id', 'nettside', 'created_at', 'url_sti', 'url_path'];
    const detectedVars = matches.map(m => m[1]).filter(v => !knownVariables.includes(v.toLowerCase())).filter((v, i, arr) => arr.indexOf(v) === i);
    setCustomVariables(detectedVars);
  }, [query]);

  // Fetch available websites
  useEffect(() => {
    if (availableWebsites.length > 0) return;
    fetch('/api/bigquery/websites')
      .then(res => res.json())
      .then((res: { data: Website[] }) => setAvailableWebsites(res.data || []))
      .catch(console.error);
  }, [availableWebsites.length]);

  // Auto-select website if ID is set in state
  useEffect(() => {
    if (!websiteIdState || availableWebsites.length === 0) return;
    if (selectedWebsite && selectedWebsite.id === websiteIdState) return;

    const match = availableWebsites.find(w => w.id === websiteIdState);
    if (match) {
      setSelectedWebsite(match);
    }
  }, [websiteIdState, availableWebsites, selectedWebsite]);

  // Auto-search ONLY on initial load
  const hasRunInitialQuery = useRef(false);

  useEffect(() => {
    if (!query || hasRunInitialQuery.current) return;

    const timer = setTimeout(() => {
      if (query && !hasRunInitialQuery.current) {
        executeQuery(query);
        hasRunInitialQuery.current = true;
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, executeQuery]);

  return {
    // State
    query,
    result,
    loading,
    error,
    description,
    dashboardTitle,
    queryStats,
    lastProcessedSql,
    selectedWebsite,
    websiteId,
    dateRange,
    period,
    urlPath,
    hasMetabaseDateFilter,
    hasUrlPathFilter,
    hasWebsiteIdPlaceholder,
    hasNettsidePlaceholder,
    customVariables,
    customVariableValues,
    hasFilters,

    // Setters
    setSelectedWebsite,
    setWebsiteIdState,
    setDateRange,
    setPeriod,
    setUrlPath,
    setCustomVariableValues,

    // Actions
    executeQuery,
    handleRetry,

    // Chart data
    prepareLineChartData,
    prepareBarChartData,
    preparePieChartData,
  };
}
