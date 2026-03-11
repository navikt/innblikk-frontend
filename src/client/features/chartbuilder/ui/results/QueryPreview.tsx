import { useState, useEffect, useMemo, useRef } from 'react';
import { Heading, Link, Button, Alert, Modal, TextField, Select, UNSAFE_Combobox } from '@navikt/ds-react';
import { Copy, ExternalLink, RotateCcw } from 'lucide-react';
import type { ILineChartProps, IVerticalBarChartProps } from '@fluentui/react-charting';
import { subDays, format, isEqual, startOfWeek, startOfMonth } from 'date-fns';
import AlertWithCloseButton from '../grafbygger/AlertWithCloseButton.tsx';
import ResultsPanel from './ResultsPanel.tsx';
import { translateValue } from '../../../../shared/lib/translations.ts';
import { formatPathLabel, parseFormattedPath } from '../../../analysis/utils/urlPathFilter.ts';
import { createDashboard, createProject, fetchCategories, fetchDashboards, fetchProjects, saveChartToBackend } from '../../api/chartStorageApi.ts';
import type { DashboardDto, GraphCategoryDto, ProjectDto } from '../../api/chartStorageApi.ts';

type JsonPrimitive = string | number | boolean | null;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

type Row = Record<string, JsonValue | undefined>;

type QueryStats = {
  totalBytesProcessedGB: string;
  totalBytesProcessed?: number;
  estimatedCostUSD?: string;
};

type QueryResult = {
  data?: Row[];
  error?: string;
};

type EstimateResponse = QueryStats & { error?: string };

declare global {
  interface Window {
    __GCP_PROJECT_ID__?: string;
  }
}

// Get GCP_PROJECT_ID from runtime-injected global variable (server injects window.__GCP_PROJECT_ID__)
const getGcpProjectId = (): string => {
  if (typeof window !== 'undefined' && window.__GCP_PROJECT_ID__) {
    return window.__GCP_PROJECT_ID__;
  }
  // Fallback for development/SSR contexts
  throw new Error('Missing runtime config: GCP_PROJECT_ID');
};

interface QueryPreviewProps {
  sql: string;
  activeStep?: number;
  openFormprogress?: boolean;
  onOpenChange?: (open: boolean) => void;
  filters?: Array<{ column: string; interactive?: boolean; metabaseParam?: boolean }>;
  metrics?: Array<{ column?: string }>;
  groupByFields?: string[];
  onResetAll?: () => void;
  availableEvents?: string[];
  isEventsLoading?: boolean;
  websiteId?: string;
  showDownloadReadMore?: boolean;
}

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'last_week' | 'last_28_days' | 'current_month' | 'last_month';

const DEFAULT_DATE_PRESET: DatePreset = 'last_7_days';

const getDateRangeFromPreset = (preset: DatePreset): { from: Date; to: Date } => {
  const now = new Date();

  switch (preset) {
    case 'today':
      return { from: now, to: now };
    case 'yesterday': {
      const yesterday = subDays(now, 1);
      return { from: yesterday, to: yesterday };
    }
    case 'this_week':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    case 'last_week': {
      const startThisWeek = startOfWeek(now, { weekStartsOn: 1 });
      return { from: subDays(startThisWeek, 7), to: subDays(startThisWeek, 1) };
    }
    case 'last_28_days':
      return { from: subDays(now, 28), to: now };
    case 'current_month':
      return { from: startOfMonth(now), to: now };
    case 'last_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0)
      };
    case 'last_7_days':
    default:
      return { from: subDays(now, 7), to: now };
  }
};

const API_TIMEOUT_MS = 60000; // timeout
const getHostPrefix = () => (typeof window === 'undefined' ? 'server' : window.location.hostname.replace(/\./g, '_'));
const LAST_PROJECT_ID_KEY = `grafbygger_last_project_id_${getHostPrefix()}`;
const LAST_DASHBOARD_ID_KEY = `grafbygger_last_dashboard_id_${getHostPrefix()}`;

const parseStoredId = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getLastProjectId = (): number | null => {
  if (typeof window === 'undefined') return null;
  return parseStoredId(window.localStorage.getItem(LAST_PROJECT_ID_KEY));
};

const getLastDashboardId = (): number | null => {
  if (typeof window === 'undefined') return null;
  return parseStoredId(window.localStorage.getItem(LAST_DASHBOARD_ID_KEY));
};

const saveLastProjectId = (projectId: number | null) => {
  if (typeof window === 'undefined') return;
  if (projectId) {
    window.localStorage.setItem(LAST_PROJECT_ID_KEY, String(projectId));
  } else {
    window.localStorage.removeItem(LAST_PROJECT_ID_KEY);
  }
};

const saveLastDashboardId = (dashboardId: number | null) => {
  if (typeof window === 'undefined') return;
  if (dashboardId) {
    window.localStorage.setItem(LAST_DASHBOARD_ID_KEY, String(dashboardId));
  } else {
    window.localStorage.removeItem(LAST_DASHBOARD_ID_KEY);
  }
};

const timeoutPromise = (ms: number) => {
  return new Promise<never>((_, reject) => {
    setTimeout(() => {
      const seconds = Math.round(ms / 1000);
      reject(new Error(`Forespørsel feilet etter å ha ventet ${seconds} sekunder`));
    }, ms);
  });
};

const QueryPreview = ({
  sql,
  activeStep = 1,
  openFormprogress = true,
  onOpenChange,
  filters = [],
  metrics = [],
  groupByFields = [],
  onResetAll,
  availableEvents = [],
  isEventsLoading = false,
  websiteId,
  showDownloadReadMore = true
}: QueryPreviewProps) => {
  const initialDateRange = getDateRangeFromPreset(DEFAULT_DATE_PRESET);
  const [copied, setCopied] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [wasManuallyOpened, setWasManuallyOpened] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<'copy' | 'estimate' | 'execute' | 'run' | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingQueryEstimate, setPendingQueryEstimate] = useState<EstimateResponse | null>(null);
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null);
  const [showLoadingMessage, setShowLoadingMessage] = useState(false);

  // Metabase Date Filter State
  const [hasMetabaseDateFilter, setHasMetabaseDateFilter] = useState(false);
  const [hasUrlPathFilter, setHasUrlPathFilter] = useState(false);
  const [hasEventNameFilter, setHasEventNameFilter] = useState(false);

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to?: Date | undefined }>({
    from: initialDateRange.from,
    to: initialDateRange.to,
  });
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_DATE_PRESET);
  const [urlPath, setUrlPath] = useState<string>('/');
  const [urlComboInputValue, setUrlComboInputValue] = useState<string>('');
  const isSelectingUrlPathRef = useRef(false);
  const [eventName, setEventName] = useState<string>('');
  const isDevEnvironment =
    typeof window !== 'undefined' &&
    window.location.hostname.includes('.dev.nav.no');
  const metabaseQuestionUrl = isDevEnvironment
    ? 'https://metabase.ansatt.dev.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsImRhdGFiYXNlIjo1Njg2LCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9uYXRpdmUiLCJuYXRpdmUiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX1dfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9'
    : 'https://metabase.ansatt.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsImRhdGFiYXNlIjoxNTQ4LCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9uYXRpdmUiLCJuYXRpdmUiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX1dfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9';

  // Track executed parameters to show/hide Update button
  const [executedParams, setExecutedParams] = useState<{
    dateRange: { from: Date | undefined; to?: Date | undefined };
    urlPath: string;
    eventName: string;
  }>({
    dateRange: { from: initialDateRange.from, to: initialDateRange.to },
    urlPath: '/',
    eventName: ''
  });

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveSuccessModal, setShowSaveSuccessModal] = useState(false);
  const [savingChart, setSavingChart] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [savedLocation, setSavedLocation] = useState<{
    projectId: number;
    dashboardId: number;
    projectName: string;
    dashboardName: string;
  } | null>(null);
  const [projectName, setProjectName] = useState('Start Umami');
  const [dashboardName, setDashboardName] = useState('Grafbygger');
  const [graphName, setGraphName] = useState('Ny graf');
  const [graphType, setGraphType] = useState('TABLE');
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [dashboards, setDashboards] = useState<DashboardDto[]>([]);
  const [categories, setCategories] = useState<GraphCategoryDto[]>([]);
  const [selectedProjectOption, setSelectedProjectOption] = useState<string | null>(null);
  const [selectedDashboardOption, setSelectedDashboardOption] = useState<string | null>(null);
  const [selectedCategoryOption, setSelectedCategoryOption] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreatingDashboard, setIsCreatingDashboard] = useState(false);
  const [showMetabaseInstructions, setShowMetabaseInstructions] = useState(false);

  const availablePaths = useMemo(() => {
    const paths = new Set<string>();
    availableEvents.forEach((event) => {
      if (event && event.startsWith('/')) {
        paths.add(event);
      }
    });
    return Array.from(paths).sort((a, b) => a.localeCompare(b, 'nb-NO'));
  }, [availableEvents]);

  const urlPathOptions = useMemo(() => {
    const uniquePaths = Array.from(new Set<string>(['/', ...availablePaths]));
    return uniquePaths.map((path) => {
      const formatted = formatPathLabel(path);
      return { label: formatted, value: formatted };
    });
  }, [availablePaths]);

  // Check if parameters have changed
  const hasChanges = () => {
    const dateChanged = !isEqual(dateRange.from || 0, executedParams.dateRange.from || 0) ||
      !isEqual(dateRange.to || 0, executedParams.dateRange.to || 0);
    const urlPathChanged = urlPath !== executedParams.urlPath;
    const eventNameChanged = eventName !== executedParams.eventName;

    return dateChanged || urlPathChanged || eventNameChanged;
  };

  // Detect Metabase date filter pattern
  useEffect(() => {
    if (!sql) {
      setHasMetabaseDateFilter(false);
      const hasUrlPathInteractiveFilter = filters.some(f =>
        (f.column || '').toLowerCase() === 'url_path' &&
        (
          (f.interactive === true && f.metabaseParam === true) ||
          (typeof (f as { value?: unknown }).value === 'string' && /\{\{\s*url_sti\s*\}\}/i.test((f as { value?: string }).value || ''))
        )
      );
      setHasUrlPathFilter(hasUrlPathInteractiveFilter);
      setHasEventNameFilter(false);
      return;
    }
    // Pattern: [[AND {{created_at}} ]] or variations with spaces
    const datePattern = /\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/i;
    setHasMetabaseDateFilter(datePattern.test(sql));

    // URL path can be either optional Metabase block or direct placeholder.
    const urlPathOptionalPattern = /\[\[\s*\{\{\s*url_sti\s*\}\}\s*--\s*\]\]\s*'\/'/i;
    const urlPathDirectPattern = /\{\{\s*url_sti\s*\}\}/i;
    const hasUrlPathInteractiveFilter = filters.some(f =>
      (f.column || '').toLowerCase() === 'url_path' &&
      (
        (f.interactive === true && f.metabaseParam === true) ||
        (typeof (f as { value?: unknown }).value === 'string' && /\{\{\s*url_sti\s*\}\}/i.test((f as { value?: string }).value || ''))
      )
    );
    setHasUrlPathFilter(
      urlPathOptionalPattern.test(sql) ||
      urlPathDirectPattern.test(sql) ||
      hasUrlPathInteractiveFilter
    );

    // Pattern: {{event_name}} or {{hendelse}}
    const eventNamePattern = /\{\{\s*(event_name|hendelse)\s*\}\}/i;
    setHasEventNameFilter(eventNamePattern.test(sql));
  }, [sql, filters]);

  // Generate processed SQL with optional placeholder preservation for Metabase
  const getProcessedSql = (options?: { preserveMetabasePlaceholders?: boolean }) => {
    const preserveMetabasePlaceholders = options?.preserveMetabasePlaceholders === true;
    const interactiveFilter = (columns: string[]) =>
      filters.some(f => columns.includes((f.column || '').toLowerCase()) && f.interactive === true && f.metabaseParam === true);

    const interactiveDateFilter = interactiveFilter(['created_at']);
    const interactiveEventFilter = interactiveFilter(['event_name', 'event']);

    let processedSql = sql;

    // Date Filter Substitution
    if (hasMetabaseDateFilter && dateRange.from && dateRange.to && !(preserveMetabasePlaceholders && interactiveDateFilter)) {
      const projectId = getGcpProjectId();
      const fromSql = `TIMESTAMP('${format(dateRange.from, 'yyyy-MM-dd')}')`;
      const toSql = `TIMESTAMP('${format(dateRange.to, 'yyyy-MM-dd')}T23:59:59')`;
      const replacement = `AND \`${projectId}.umami_views.event\`.created_at BETWEEN ${fromSql} AND ${toSql}`;
      processedSql = processedSql.replace(/\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/gi, replacement);
    }

    // URL Path Substitution
    if (hasUrlPathFilter) {
      // When preserving for Metabase, always keep the placeholder so the recipient can choose the path
      if (!preserveMetabasePlaceholders) {
        const optionalPattern = /\[\[\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*--\s*\]\]\s*'\/'/gi;
        const optionalClausePattern = /\s+AND\s+[\w`.-]*url_path\s*=\s*\[\[\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*--\s*\]\]\s*'\/'/gi;
        const directClausePattern = /\s+AND\s+[\w`.-]*url_path\s*=\s*(?:['"])?\{\{\s*url_(?:sti|path)\s*\}\}(?:['"])?/gi;
        const directPattern = /\{\{\s*url_(?:sti|path)\s*\}\}/gi;
        const trimmedPath = (urlPath || '').trim();
        const hasExplicitPath = trimmedPath.length > 0;

        if (hasExplicitPath) {
          const safePath = `'${trimmedPath.replace(/'/g, "''")}'`;
          processedSql = processedSql.replace(optionalPattern, safePath);
          processedSql = processedSql.replace(directPattern, safePath);
        } else {
          // Empty URL means "whole website": remove URL clauses entirely.
          processedSql = processedSql.replace(optionalClausePattern, '');
          processedSql = processedSql.replace(directClausePattern, '');
          // Fallback for remaining placeholder forms that cannot be removed safely.
          processedSql = processedSql.replace(optionalPattern, `'/'`);
          processedSql = processedSql.replace(directPattern, `'/'`);
        }
      }
    }

    // Event Name Substitution
    if (hasEventNameFilter) {
      const pattern = /\{\{\s*(event_name|hendelse)\s*\}\}/gi;

      // Preserve placeholder for Metabase copies when user chose "recipient selects"
      if (preserveMetabasePlaceholders && (!eventName || eventName.trim() === '')) {
        // leave placeholder intact
      } else if (eventName && eventName.trim() !== '') {
        const safeEventName = eventName.replace(/'/g, "''");
        processedSql = processedSql.replace(pattern, `'${safeEventName}'`);
      } else if (!(preserveMetabasePlaceholders && interactiveEventFilter)) {
        // Only empty out when executing without an event filter
        processedSql = processedSql.replace(pattern, `''`);
      }
    }

    return processedSql;
  };

  // Helper function to prepare data for LineChart
  const prepareLineChartData = (includeAverage: boolean = true): ILineChartProps | null => {
    if (!result?.data || result.data.length === 0) return null;

    const data = result.data;
    const keys = Object.keys(data[0] ?? {});
    if (keys.length < 2) return null;

    const toNumber = (v: unknown): number => {
      if (typeof v === 'number') return v;
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? n : 0;
    };

    const toDateOrNumber = (xValue: unknown, fallback: number): Date | number => {
      if (typeof xValue === 'number') return xValue;
      if (typeof xValue === 'string' && xValue.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(xValue);
      const parsed = new Date(String(xValue));
      return !isNaN(parsed.getTime()) ? parsed : fallback;
    };

    if (keys.length === 3) {
      const xKey = keys[0];
      const seriesKey = keys[1];
      const yKey = keys[2];

      const seriesMap = new Map<string, Array<{ x: Date | number; y: number; xAxisCalloutData: string; yAxisCalloutData: string }>>();

      data.forEach((row, idx) => {
        const rawSeriesValue = row[seriesKey];
        const translatedSeriesValue = translateValue(seriesKey, rawSeriesValue ?? 'Ukjent');
        const seriesValue = String(translatedSeriesValue || 'Ukjent');
        if (!seriesMap.has(seriesValue)) seriesMap.set(seriesValue, []);

        const xValue = row[xKey];
        const yValue = toNumber(row[yKey]);

        seriesMap.get(seriesValue)!.push({
          x: toDateOrNumber(xValue, idx),
          y: yValue,
          xAxisCalloutData: String(xValue),
          yAxisCalloutData: String(yValue),
        });
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
        lineChartData.forEach(series => {
          (series.data as Array<{ x: Date | number; y: number }>).forEach(point => {
            const xVal = point.x instanceof Date ? point.x.getTime() : Number(point.x);
            allXValues.add(xVal);
          });
        });

        const averagePoints = Array.from(allXValues).sort((a, b) => a - b).map(xVal => {
          const yValues: number[] = [];
          lineChartData.forEach(series => {
            const point = (series.data as Array<{ x: Date | number; y: number; xAxisCalloutData?: string }>).find((p) => {
              const pxVal = p.x instanceof Date ? p.x.getTime() : Number(p.x);
              return pxVal === xVal;
            });
            if (point) yValues.push(point.y);
          });

          const avgY = yValues.length ? yValues.reduce((sum, v) => sum + v, 0) / yValues.length : 0;

          const originalPoint = (lineChartData[0]?.data as Array<{ x: Date | number; xAxisCalloutData?: string }> | undefined)
            ?.find((p) => {
              const pxVal = p.x instanceof Date ? p.x.getTime() : Number(p.x);
              return pxVal === xVal;
            });

          return {
            x: new Date(xVal),
            y: avgY,
            xAxisCalloutData: originalPoint?.xAxisCalloutData || String(xVal),
            yAxisCalloutData: avgY.toFixed(2),
          };
        });

        lineChartData.push({
          legend: 'Gjennomsnitt',
          data: averagePoints,
          color: '#262626',
          lineOptions: {
            lineBorderWidth: '2',
          },
        });
      }

      return { data: { lineChartData }, enabledLegendsWrapLines: true };
    }

    const xKey = keys[0];
    const yKey = keys[1];

    const chartPoints = data.map((row, index) => {
      const xValue = row[xKey];
      const yValue = toNumber(row[yKey]);

      return {
        x: toDateOrNumber(xValue, index),
        y: yValue,
        xAxisCalloutData: String(xValue),
        yAxisCalloutData: String(yValue),
      };
    });

    const lineChartData: Array<{
      legend: string;
      data: typeof chartPoints;
      color: string;
      lineOptions: Record<string, string>;
    }> = [{
      legend: yKey,
      data: chartPoints,
      color: '#0067C5',
      lineOptions: { lineBorderWidth: '2' },
    }];

    if (includeAverage) {
      const avgY = chartPoints.reduce((sum, point) => sum + point.y, 0) / (chartPoints.length || 1);
      const averageLinePoints = chartPoints.map((point) => ({
        x: point.x,
        y: avgY,
        xAxisCalloutData: point.xAxisCalloutData,
        yAxisCalloutData: avgY.toFixed(2),
      }));
      lineChartData.push({
        legend: 'Gjennomsnitt',
        data: averageLinePoints,
        color: '#262626',
        lineOptions: { lineBorderWidth: '2' },
      });
    }

    return { data: { lineChartData }, enabledLegendsWrapLines: true };
  };

  const prepareBarChartData = (): IVerticalBarChartProps | null => {
    if (!result?.data || result.data.length === 0) return null;
    const data = result.data;
    if (data.length > 12) return null;

    const keys = Object.keys(data[0] ?? {});
    if (keys.length < 2) return null;

    const labelKey = keys[0];
    const valueKey = keys[1];

    const toNumber = (v: unknown): number => {
      if (typeof v === 'number') return v;
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? n : 0;
    };

    const total = data.reduce((sum, row) => sum + toNumber(row[valueKey]), 0);

    const barChartData = data.map((row) => {
      const value = toNumber(row[valueKey]);
      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';

      const rawLabel = row[labelKey];
      const translatedLabel = translateValue(labelKey, rawLabel ?? 'Ukjent');
      const label = String(translatedLabel || 'Ukjent');

      return {
        x: label,
        y: value,
        xAxisCalloutData: label,
        yAxisCalloutData: `${value} (${percentage}%)`,
        color: '#0067C5',
        legend: label,
      };
    });

    return {
      data: barChartData,
      barWidth: 'auto',
      yAxisTickCount: 5,
      enableReflow: true,
      legendProps: {
        allowFocusOnLegends: true,
        canSelectMultipleLegends: false,
        styles: {
          root: { display: 'flex', flexWrap: 'wrap', rowGap: '8px', columnGap: '16px', maxWidth: '100%' },
          legend: { marginRight: 0 },
        },
      },
    };
  };

  const preparePieChartData = (): { data: Array<{ y: number; x: string }>; total: number } | null => {
    if (!result?.data || result.data.length === 0) return null;
    const data = result.data;
    if (data.length > 12) return null;

    const keys = Object.keys(data[0] ?? {});
    if (keys.length < 2) return null;

    const labelKey = keys[0];
    const valueKey = keys[1];

    const toNumber = (v: unknown): number => {
      if (typeof v === 'number') return v;
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? n : 0;
    };

    const total = data.reduce((sum, row) => sum + toNumber(row[valueKey]), 0);

    const pieChartData = data.map((row) => {
      const value = toNumber(row[valueKey]);
      const rawLabel = row[labelKey];
      const translatedLabel = translateValue(labelKey, rawLabel ?? 'Ukjent');
      const label = String(translatedLabel || 'Ukjent');
      return { y: value, x: label };
    });

    return { data: pieChartData, total };
  };

  const handleCopy = async () => {
    const metabaseSql = getProcessedSql({ preserveMetabasePlaceholders: true });
    navigator.clipboard.writeText(metabaseSql);
    setCopied(true);

    setEstimating(true);
    setLastAction('copy');

    try {
      const response = (await Promise.race([
        fetch('/api/bigquery/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: getProcessedSql(), analysisType: 'Grafbyggeren' }),
        }),
        timeoutPromise(API_TIMEOUT_MS)
      ]));

      const data: EstimateResponse = await response.json();
      if (!response.ok) throw new Error(data.error || 'Estimation failed');

      setEstimate(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'En feil oppstod';
      setError(message);
    } finally {
      setEstimating(false);
    }

    setTimeout(() => setCopied(false), 3000);
  };

  const executeQuery = async () => {
    setLoading(true);
    setError(null);
    setLastAction('execute');

    try {
      const processedSql = getProcessedSql();
      const estimateResponse = (await Promise.race([
        fetch('/api/bigquery/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: processedSql, analysisType: 'Grafbyggeren' }),
        }),
        timeoutPromise(API_TIMEOUT_MS)
      ]));

      const estimateData: EstimateResponse = await estimateResponse.json();
      if (!estimateResponse.ok) throw new Error(estimateData.error || 'Estimation failed');

      const gb = Number(estimateData.totalBytesProcessedGB ?? 0);
      const shouldWarn = gb >= 50;

      if (shouldWarn) {
        setPendingQueryEstimate(estimateData);
        setShowConfirmModal(true);
        setLoading(false);
        return;
      }

      await runQuery();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'En feil oppstod';
      setError(message);
      setLoading(false);
    }
  };

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setQueryStats(null);
    setLastAction('run');

    setExecutedParams({ dateRange, urlPath, eventName });

    try {
      const processedSql = getProcessedSql();
      const response = (await Promise.race([
        fetch('/api/bigquery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: processedSql, analysisType: 'Grafbyggeren' }),
        }),
        timeoutPromise(API_TIMEOUT_MS)
      ]));

      const data: QueryResult = await response.json();
      if (!response.ok) throw new Error(data.error || 'Query failed');

      setResult(data);

      try {
        const estimateResponse = (await Promise.race([
          fetch('/api/bigquery/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: processedSql, analysisType: 'Grafbyggeren' }),
          }),
          timeoutPromise(API_TIMEOUT_MS)
        ]));

        const estimateData: EstimateResponse = await estimateResponse.json();
        if (estimateResponse.ok) setQueryStats(estimateData);
      } catch {
        // not critical
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'En feil oppstod';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!lastAction) return;

    setError(null);

    const runEstimate = async () => {
      const response = (await Promise.race([
        fetch('/api/bigquery/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: getProcessedSql(), analysisType: 'Grafbyggeren' }),
        }),
        timeoutPromise(API_TIMEOUT_MS),
      ]));

      const data: EstimateResponse = await response.json();
      if (!response.ok) throw new Error(data.error || 'Estimation failed');
      setEstimate(data);
    };

    try {
      if (lastAction === 'copy') {
        setEstimating(true);
        await runEstimate();
      } else if (lastAction === 'execute') {
        await executeQuery();
      } else if (lastAction === 'run') {
        await runQuery();
      } else if (lastAction === 'estimate') {
        await runEstimate();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'En feil oppstod';
      setError(message);
    } finally {
      if (lastAction === 'copy') setEstimating(false);
    }
  };

  const handleConfirmQuery = async () => {
    setShowConfirmModal(false);
    await runQuery();
  };

  const handleCancelQuery = () => {
    setShowConfirmModal(false);
    setPendingQueryEstimate(null);
  };

  const openSaveModal = () => {
    setSaveError(null);
    setSaveSuccess(null);
    setSavedLocation(null);

    if (!graphName || graphName === 'Ny graf') {
      const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm');
      setGraphName(`Graf ${timestamp}`);
    }

    const loadSaveData = async () => {
      try {
        const projectItems = await fetchProjects();
        setProjects(projectItems);

        const rememberedProjectId = getLastProjectId();
        const selectedProject =
          (rememberedProjectId ? projectItems.find((project) => project.id === rememberedProjectId) : null)
          ?? projectItems.find((project) => project.name === projectName)
          ?? null;

        if (selectedProject) {
          const projectOptionValue = String(selectedProject.id);
          setSelectedProjectOption(projectOptionValue);
          setProjectName(selectedProject.name);
          const dashboardItems = await fetchDashboards(selectedProject.id);
          setDashboards(dashboardItems);

          const rememberedDashboardId = getLastDashboardId();
          const selectedDashboard =
            (rememberedDashboardId ? dashboardItems.find((dashboard) => dashboard.id === rememberedDashboardId) : null)
            ?? dashboardItems.find((dashboard) => dashboard.name === dashboardName)
            ?? null;

          setSelectedDashboardOption(selectedDashboard ? String(selectedDashboard.id) : null);
          setDashboardName(selectedDashboard?.name ?? dashboardName);
          if (selectedDashboard) {
            const categoryItems = await fetchCategories(selectedProject.id, selectedDashboard.id);
            const sortedCategories = [...categoryItems].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0));
            setCategories(sortedCategories);
            setSelectedCategoryOption(sortedCategories[0] ? String(sortedCategories[0].id) : null);
          } else {
            setCategories([]);
            setSelectedCategoryOption(null);
          }
        } else {
          setSelectedProjectOption(null);
          setDashboards([]);
          setCategories([]);
          setSelectedDashboardOption(null);
          setSelectedCategoryOption(null);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Klarte ikke laste team og dashboards';
        setSaveError(message);
      }
    };

    setShowSaveModal(true);
    void loadSaveData();
  };

  const handleProjectSelection = async (option: string, isSelected: boolean) => {
    if (!isSelected) {
      setSelectedProjectOption(null);
      setProjectName('');
      saveLastProjectId(null);
      setDashboards([]);
      setCategories([]);
      setDashboardName('');
      setSelectedDashboardOption(null);
      setSelectedCategoryOption(null);
      saveLastDashboardId(null);
      return;
    }

    try {
      setSaveError(null);
      setDashboardName('');
      setSelectedDashboardOption(null);
      setCategories([]);
      setSelectedCategoryOption(null);

      const selectedProjectById = projects.find((project) => String(project.id) === option);
      const selectedProjectByName = projects.find((project) => project.name.trim().toLowerCase() === option.trim().toLowerCase());
      const selectedProject = selectedProjectById ?? selectedProjectByName;

      let projectToUse = selectedProject;
      if (!projectToUse) {
        const trimmedName = option.trim();
        if (!trimmedName) return;

        setIsCreatingProject(true);
        const createdProject = await createProject(trimmedName, 'Opprettet fra Grafbyggeren');
        projectToUse = createdProject;
        setProjects((prev) => [...prev, createdProject]);
      }

      setSelectedProjectOption(String(projectToUse.id));
      setProjectName(projectToUse.name);
      saveLastProjectId(projectToUse.id);
      saveLastDashboardId(null);

      const dashboardItems = await fetchDashboards(projectToUse.id);
      setDashboards(dashboardItems);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Klarte ikke velge eller opprette prosjekt';
      setSaveError(message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDashboardSelection = async (option: string, isSelected: boolean) => {
    if (!isSelected) {
      setSelectedDashboardOption(null);
      setDashboardName('');
      setCategories([]);
      setSelectedCategoryOption(null);
      saveLastDashboardId(null);
      return;
    }

    if (!selectedProjectOption) {
      setSaveError('Velg eller opprett prosjekt først');
      return;
    }

    try {
      setSaveError(null);
      const selectedDashboardById = dashboards.find((dashboard) => String(dashboard.id) === option);
      const selectedDashboardByName = dashboards.find((dashboard) => dashboard.name.trim().toLowerCase() === option.trim().toLowerCase());
      const selectedDashboard = selectedDashboardById ?? selectedDashboardByName;

      let dashboardToUse = selectedDashboard;
      if (!dashboardToUse) {
        const trimmedName = option.trim();
        if (!trimmedName) return;

        setIsCreatingDashboard(true);
        const createdDashboard = await createDashboard(Number(selectedProjectOption), trimmedName, 'Opprettet fra Grafbyggeren');
        dashboardToUse = createdDashboard;
        setDashboards((prev) => [...prev, createdDashboard]);
      }

      setSelectedDashboardOption(String(dashboardToUse.id));
      setDashboardName(dashboardToUse.name);
      saveLastDashboardId(dashboardToUse.id);
      const categoryItems = await fetchCategories(Number(selectedProjectOption), dashboardToUse.id);
      const sortedCategories = [...categoryItems].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0));
      setCategories(sortedCategories);
      setSelectedCategoryOption(sortedCategories[0] ? String(sortedCategories[0].id) : null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Klarte ikke velge eller opprette dashboard';
      setSaveError(message);
    } finally {
      setIsCreatingDashboard(false);
    }
  };

  const handleSaveChart = async () => {
    if (!graphName.trim() || !projectName.trim() || !dashboardName.trim()) {
      setSaveError('Velg team/prosjekt, dashboard og fyll ut grafnavn.');
      return;
    }

    setSavingChart(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const saved = await saveChartToBackend({
        projectName: projectName.trim(),
        dashboardName: dashboardName.trim(),
        graphName: graphName.trim(),
        queryName: `${graphName.trim()} - query`,
        graphType: graphType.trim(),
        sqlText: getProcessedSql({ preserveMetabasePlaceholders: true }),
        categoryId: selectedCategoryOption ? Number(selectedCategoryOption) : undefined,
      });

      setSaveSuccess('Lagret');
      setSavedLocation({
        projectId: saved.project.id,
        dashboardId: saved.dashboard.id,
        projectName: saved.project.name,
        dashboardName: saved.dashboard.name,
      });
      saveLastProjectId(saved.project.id);
      saveLastDashboardId(saved.dashboard.id);
      setShowSaveModal(false);
      setShowSaveSuccessModal(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Klarte ikke lagre grafen';
      setSaveError(message);
    } finally {
      setSavingChart(false);
    }
  };

  const projectOptions = projects.map((project) => ({
    label: project.name,
    value: String(project.id),
  }));

  const dashboardOptions = dashboards.map((dashboard) => ({
    label: dashboard.name,
    value: String(dashboard.id),
  }));
  const categoryOptions = categories.map((category) => ({
    label: category.name?.trim() ? (category.name.trim().toLowerCase() === 'general' ? 'Fane 1' : category.name) : 'Fane 1',
    value: String(category.id),
  }));

  const selectedProjectLabel = projectOptions.find((option) => option.value === selectedProjectOption)?.label;
  const selectedDashboardLabel = dashboardOptions.find((option) => option.value === selectedDashboardOption)?.label;
  const savedDashboardUrl = savedLocation
    ? `/oversikt?projectId=${savedLocation.projectId}&dashboardId=${savedLocation.dashboardId}`
    : '';

  const handleGoToSavedDashboard = () => {
    if (!savedDashboardUrl) return;
    if (typeof window !== 'undefined') {
      window.location.href = savedDashboardUrl;
    }
  };

  // Show loading message after 10 seconds
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (loading) {
      setShowLoadingMessage(false);
      timer = setTimeout(() => {
        setShowLoadingMessage(true);
      }, 10000);
    } else {
      setShowLoadingMessage(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loading]);

  // Check if SQL is just a basic template without metrics or groupings
  const isBasicTemplate = () => {
    if (!sql) return true;

    // Check if it's the "please select website" message
    if (sql.includes('Please select a website')) return true;

    // Check if there are any SELECT columns specified or if it's just the basic structure
    const selectPattern = /SELECT\s+(\s*FROM|\s*$)/i;
    return selectPattern.test(sql);
  };

  // Check if SQL is meaningful enough to display
  {/* const isSQLMeaningful = () => {
    if (!sql) return false;

    // Basic template SQL should not be shown, it's not useful yet
    if (isBasicTemplate()) return false;

    return true;
  }; */}

  // Check for interactive date filter and visit duration combination
  const hasInteractiveDateFilter = filters.some(
    (f) => f.column === 'created_at' && f.interactive === true && f.metabaseParam === true
  );

  const hasVisitDuration =
    metrics.some((m) => m.column === 'visit_duration') || groupByFields.includes('visit_duration');

  // Flag to show warning
  const showIncompatibilityWarning = hasInteractiveDateFilter && hasVisitDuration;

  // Track previous step to detect transitions
  const [prevStep, setPrevStep] = useState(activeStep);
  const [autoClosedFinalStep, setAutoClosedFinalStep] = useState(false);

  const FINAL_STEP = 3;

  // Update the function to track manual opening state
  const ensureFormProgressOpen = () => {
    if (onOpenChange) {
      onOpenChange(true);
      setWasManuallyOpened(true);
      setAutoClosedFinalStep(false);
    }
  };

  // Custom handler for form progress open state changes
  {/* const handleFormProgressOpenChange = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
      // If the user manually opens it, track this action
      if (open && activeStep === FINAL_STEP) {
        setWasManuallyOpened(true);
      }
    }
  }; */}

  useEffect(() => {
    if (onOpenChange) {
      // Case 1: Moving to final step - auto-close it if it wasn't manually opened
      if (activeStep === FINAL_STEP && prevStep !== FINAL_STEP && !wasManuallyOpened) {
        onOpenChange(false);
        setAutoClosedFinalStep(true);
      }
      // Case 2: Moving back from final step to an earlier step - reopen it
      else if (prevStep === FINAL_STEP && activeStep < FINAL_STEP) {
        onOpenChange(true);
        setAutoClosedFinalStep(false);
      }
      // Case 3: Initial setup on first render
      else if (prevStep === activeStep && activeStep === 1) {
        onOpenChange(openFormprogress);
      }
      // Case 4: If parent explicitly sets openFormprogress, respect that
      else if (
        openFormprogress !== undefined &&
        prevStep !== activeStep // Only process external state changes on step changes
      ) {
        onOpenChange(openFormprogress);
      }
    }

    // Update previous step
    setPrevStep(activeStep);

    // Reset manual opening flag when changing steps (except when at step 3)
    if (prevStep !== activeStep && activeStep !== FINAL_STEP) {
      setWasManuallyOpened(false);
    }
  }, [activeStep, openFormprogress, onOpenChange, prevStep, autoClosedFinalStep, wasManuallyOpened, FINAL_STEP]);

  // Clear results when SQL changes (website change or reset)
  useEffect(() => {
    setResult(null);
    setQueryStats(null);
    setError(null);
    setEstimate(null);
    setCopied(false);
  }, [sql]);

  return (
    <>
      <div>
        {isBasicTemplate() ? (
          <>

            {/* <div className="space-y-4">
            <Heading level="2" size="small">Klargjør spørsmålet ditt</Heading>
            {isSQLMeaningful() && (
              <SqlCodeDisplay sql={sql} showEditButton={true} />
            )}
          </div> */}
          </>
        ) : (
          <div>
            {/* Results Section with Integrated Date Filter */}
            <div className="pb-4">
              {/* Header with Reset Button */}
              {onResetAll && activeStep > 1 && (
                <div className="flex justify-end mb-2">
                  <Button
                    variant="tertiary"
                    size="small"
                    onClick={() => {
                      onResetAll();
                      // Reset local filter states
                      const resetDateRange = getDateRangeFromPreset(DEFAULT_DATE_PRESET);
                      setDatePreset(DEFAULT_DATE_PRESET);
                      setDateRange({ from: resetDateRange.from, to: resetDateRange.to });
                      setUrlPath('/');
                      setUrlComboInputValue('');
                      setEventName('');
                      setExecutedParams({
                        dateRange: { from: resetDateRange.from, to: resetDateRange.to },
                        urlPath: '/',
                        eventName: ''
                      });
                      setResult(null); // Clear results

                      setShowAlert(true);

                      // Move this call AFTER onResetAll to ensure it happens last
                      setTimeout(() => {
                        ensureFormProgressOpen();
                      }, 0);

                      // Auto-hide the alert after 4 seconds
                      setTimeout(() => setShowAlert(false), 4000);
                    }}
                    icon={<RotateCcw size={16} />}
                  >
                    Tilbakestill alle valg
                  </Button>
                </div>
              )}

              <Heading level="2" size="small" className="mb-4">Vis resultater</Heading>

              {/* Success Alert for Reset */}
              {showAlert && (
                <div className="mb-3">
                  <AlertWithCloseButton variant="success">
                    Alle innstillinger ble tilbakestilt
                  </AlertWithCloseButton>
                </div>
              )}

              {/* Metabase Parameters Filter */}
              {(hasMetabaseDateFilter || hasUrlPathFilter || hasEventNameFilter) && (
                <div className="pt-2 mb-3">
                  <div className="flex flex-wrap gap-4 items-end">
                    {/* Date Filter */}
                    {hasMetabaseDateFilter && (
                      <div className="w-full sm:w-auto min-w-[180px]">
                        <Select
                          label="Datoperiode"
                          size="small"
                          value={datePreset}
                          onChange={(e) => {
                            const preset = e.target.value as DatePreset;
                            const nextRange = getDateRangeFromPreset(preset);
                            setDatePreset(preset);
                            setDateRange({ from: nextRange.from, to: nextRange.to });
                          }}
                        >
                          <option value="today">I dag</option>
                          <option value="yesterday">I går</option>
                          <option value="this_week">Denne uken</option>
                          <option value="last_7_days">Siste 7 dager</option>
                          <option value="last_week">Forrige uke</option>
                          <option value="last_28_days">Siste 28 dager</option>
                          <option value="current_month">Denne måneden</option>
                          <option value="last_month">Forrige måned</option>
                        </Select>
                      </div>
                    )}

                    {/* URL Path Filter */}
                    {hasUrlPathFilter && (
                      <div className="w-64">
                        <UNSAFE_Combobox
                          label="URL-sti"
                          size="small"
                          options={urlPathOptions}
                          selectedOptions={urlPath ? [formatPathLabel(urlPath)] : []}
                          onToggleSelected={(option: string, isSelected: boolean) => {
                            if (option) {
                              isSelectingUrlPathRef.current = true;
                              setUrlPath(isSelected ? parseFormattedPath(option) : '');
                              setUrlComboInputValue('');
                              setTimeout(() => {
                                isSelectingUrlPathRef.current = false;
                              }, 100);
                            }
                          }}
                          value={urlComboInputValue}
                          onChange={(value) => setUrlComboInputValue(value || '')}
                          onBlur={() => {
                            // Delay so selection handlers can finish before auto-saving typed value.
                            setTimeout(() => {
                              const trimmed = urlComboInputValue.trim();
                              if (!trimmed || isSelectingUrlPathRef.current) return;
                              let parsed = parseFormattedPath(trimmed);
                              if (!parsed.startsWith('/')) {
                                parsed = `/${parsed}`;
                              }
                              setUrlPath(parsed || '');
                              setUrlComboInputValue('');
                            }, 150);
                          }}
                          isMultiSelect={true}
                          allowNewValues
                          clearButton
                        />
                      </div>
                    )}

                    {/* Event Name Filter */}
                    {hasEventNameFilter && (
                      <div className="w-64">
                        {isEventsLoading && <div className="text-xs text-[var(--ax-text-subtle)] mb-1">Laster hendelser...</div>}
                        <div className={isEventsLoading ? 'opacity-50 pointer-events-none' : ''}>
                          <UNSAFE_Combobox
                            label="Hendelsesnavn"
                            options={availableEvents.map(e => ({ label: e, value: e }))}
                            selectedOptions={eventName ? [eventName] : []}
                            onToggleSelected={(option: string, isSelected: boolean) => {
                              setEventName(isSelected ? option : '');
                            }}
                            isMultiSelect={false}
                            size="small"
                            disabled={isEventsLoading}
                          />
                        </div>
                      </div>
                    )}

                    {/* Update Button - inline with filters */}
                    {hasChanges() && (result || error) && (
                      <Button
                        variant="primary"
                        size="small"
                        onClick={() => executeQuery()}
                        loading={loading}
                      >
                        Oppdater
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <ResultsPanel
                result={result}
                loading={loading}
                error={error}
                queryStats={queryStats}
                lastAction={lastAction}
                showLoadingMessage={showLoadingMessage}
                executeQuery={executeQuery}
                handleRetry={handleRetry}
                prepareLineChartData={prepareLineChartData}
                prepareBarChartData={prepareBarChartData}
                preparePieChartData={preparePieChartData}
                // Show the Metabase-friendly SQL (placeholders preserved) in the viewer
                sql={getProcessedSql({ preserveMetabasePlaceholders: true })}
                hideHeading={true}
                containerStyle="none"
                showSqlCode={true}
                showEditButton={true}
                showCost={true}
                websiteId={websiteId}
                showDownloadReadMore={showDownloadReadMore}
              />
            </div>

            {/* Save + Metabase Section */}
            <div className="space-y-3 mb-4">
              <div className="flex flex-wrap gap-2">
                <Button size="small" variant="primary" onClick={openSaveModal}>
                  Legg til i dashboard
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => setShowMetabaseInstructions((prev) => !prev)}
                >
                  Overfør til Metabase
                </Button>
              </div>

              {saveSuccess && savedLocation && (
                <Alert variant="success" size="small">
                  <Link href={savedDashboardUrl}>
                    Grafen er lagt til i "{savedLocation.dashboardName}". Åpne i Oversikt.
                  </Link>
                </Alert>
              )}

              {showMetabaseInstructions && (
                <Alert variant="info" size="small">
                  <div className="space-y-3">
                    <Heading level="2" size="small">Legg til i Metabase</Heading>
                    <ol className="list-decimal pl-5 space-y-1 text-sm">
                      <li>Klikk "Kopier spørringen".</li>
                      <li>
                        <Link
                          href={metabaseQuestionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1"
                        >
                          Åpne Metabase <ExternalLink size={14} />
                        </Link>
                      </li>
                      <li>Lim inn SQL-koden og lagre spørsmålet.</li>
                      <li>Legg spørsmålet til i ønsket dashboard.</li>
                    </ol>

                    {/* Add incompatibility warning */}
                    {showIncompatibilityWarning && (
                      <Alert variant="warning" size="small">
                        <div>
                          <p className="font-medium">Interaktiv dato + besøksvarighet = funker ikke</p>
                          <p className="mt-1 text-sm">
                            Du bruker både interaktivt datofilter og besøksvarighet, som ikke fungerer sammen i Metabase.
                          </p>
                        </div>
                      </Alert>
                    )}

                    <div className="flex flex-col gap-3">
                      <div>
                        {!copied ? (
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={handleCopy}
                            icon={<Copy size={18} />}
                            loading={estimating}
                          >
                            Kopier spørringen
                          </Button>
                        ) : (
                          <Alert variant="success" size="small" className="w-fit py-1 px-3">
                            Spørringen er kopiert!
                          </Alert>
                        )}

                        {/* Cost Estimate Display */}
                        {estimating && (
                          <div className="mt-2 text-sm text-[var(--ax-text-subtle)]">
                            Estimerer kostnad...
                          </div>
                        )}

                        {estimate && !estimating && (() => {
                          const gb = Number(estimate.totalBytesProcessedGB ?? 0);
                          // Calculate cost if not provided by backend (approx $6.25 per TB)
                          const cost = Number(estimate.estimatedCostUSD ?? NaN) || (gb * 0.00625);

                          let variant: 'info' | 'warning' | 'error' = 'info';
                          let showAsAlert = false;

                          if (gb >= 300) {
                            variant = 'error';
                            showAsAlert = true;
                          } else if (gb >= 100) {
                            variant = 'warning';
                            showAsAlert = true;
                          } else if (gb >= 50) {
                            variant = 'info';
                            showAsAlert = true;
                          }

                          if (!showAsAlert) {
                            return (
                              <div className="mt-2 text-sm text-[var(--ax-text-subtle)]">
                                Data å prosessere: {gb} GB
                                {cost > 0 && ` • Kostnad: $${cost.toFixed(2)}`}
                              </div>
                            );
                          }

                          return (
                            <Alert variant={variant} size="small" className="mt-2">
                              <div className="text-sm space-y-1">
                                <p>
                                  <strong>Data å prosessere:</strong> {estimate.totalBytesProcessedGB} GB
                                  {cost > 0 && ` • Kostnad: $${cost.toFixed(2)}`}
                                </p>
                                {gb >= 300 && (
                                  <p className="font-medium mt-2">
                                    ⚠️ Dette er en veldig stor spørring! Vurder å begrense dataene.
                                  </p>
                                )}
                                {gb >= 100 && gb < 300 && (
                                  <p className="font-medium mt-2">
                                    Dette er en stor spørring. Sjekk at du trenger all denne dataen.
                                  </p>
                                )}
                              </div>
                            </Alert>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </Alert>
              )}

              {/* Detailed instructions in ReadMore 
              <ReadMore header="Neste steg i Metabase" size="small">
                <ol className="list-decimal list-inside space-y-2 text-sm mt-2" start={3}>
                  <li>Lim inn spørringen i SQL-editoren</li>
                  <li>Trykk på <span role="img" aria-label="spill av-knapp">▶️</span> "vis resultater"-knappen</li>
                  <li>Trykk "Visualisering" for å bytte fra tabell til graf</li>
                </ol>
                <p className="text-sm text-[var(--ax-text-subtle)] mt-2">
                  Merk: Hvis siden "Velg dine startdata" vises, lukk den og klikk på lenken på nytt.
                </p>
              </ReadMore>*/}
            </div>
          </div>
        )}
        {/* 
        <div className="pt-0">
          <FormProgress
            activeStep={Math.min(activeStep, FINAL_STEP)} // Ensure we never show step 4
            totalSteps={3}
            open={openFormprogress}
            onOpenChange={handleFormProgressOpenChange}
            interactiveSteps={false}
          >
            <FormProgress.Step>Velg nettside eller app</FormProgress.Step>
            <FormProgress.Step>Formuler spørsmålet</FormProgress.Step>
            <FormProgress.Step>Vis resultater</FormProgress.Step>
          </FormProgress>
        </div>
        */}
      </div>

      <Modal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        header={{ heading: 'Legg til i dashboard' }}
      >
        <Modal.Body>
          <div className="space-y-4">
            <UNSAFE_Combobox
              label="Team"
              description="Skriv for å legge til nytt team"
              options={projectOptions}
              selectedOptions={selectedProjectLabel ? [selectedProjectLabel] : []}
              onToggleSelected={(option: string, isSelected: boolean) => {
                void handleProjectSelection(option, isSelected);
              }}
              isMultiSelect={false}
              allowNewValues
              size="small"
              clearButton
              disabled={isCreatingProject || savingChart}
            />
            <UNSAFE_Combobox
              label="Dashboard"
              description="Skriv for å legge til nytt dashboard"
              options={dashboardOptions}
              selectedOptions={selectedDashboardLabel ? [selectedDashboardLabel] : []}
              onToggleSelected={(option: string, isSelected: boolean) => {
                void handleDashboardSelection(option, isSelected);
              }}
              isMultiSelect={false}
              allowNewValues
              size="small"
              clearButton
              disabled={!selectedProjectOption || isCreatingProject || isCreatingDashboard || savingChart}
            />
            {categories.length > 1 && (
              <Select
                label="Fane"
                value={selectedCategoryOption ?? ''}
                onChange={(e) => setSelectedCategoryOption(e.target.value || null)}
                size="small"
                disabled={savingChart}
              >
                <option value="">Velg fane</option>
                {categoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            )}
            <TextField
              label="Grafnavn"
              value={graphName}
              onChange={(e) => setGraphName(e.target.value)}
              size="small"
            />
            <Select
              label="Visning"
              value={graphType}
              onChange={(e) => setGraphType(e.target.value)}
              size="small"
            >
              <option value="LINE">Linjediagram</option>
              <option value="BAR">Stolpediagram</option>
              <option value="PIE">Kakediagram</option>
              <option value="TABLE">Tabell</option>
            </Select>

            {saveError && (
              <Alert variant="error" size="small">
                {saveError}
              </Alert>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={handleSaveChart} loading={savingChart}>
            Legg til
          </Button>
          <Button variant="secondary" onClick={() => setShowSaveModal(false)} disabled={savingChart}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={showSaveSuccessModal && !!savedLocation}
        onClose={() => setShowSaveSuccessModal(false)}
        header={{ heading: 'Graf lagret' }}
        width="small"
      >
        <Modal.Body>
          {savedLocation && (
            <p>
              Grafen er lagt til i "{savedLocation.dashboardName}". Hva vil du gjøre nå?
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleGoToSavedDashboard}>
            Gå til dashboard
          </Button>
          <Button variant="secondary" onClick={() => setShowSaveSuccessModal(false)}>
            Bli her
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Confirmation Modal for Large Queries */}
      <Modal
        open={showConfirmModal}
        onClose={handleCancelQuery}
        header={{
          heading: "Bekreft stor spørring",
          closeButton: false,
        }}
      >
        <Modal.Body>
          {pendingQueryEstimate && (() => {
            const gb = Number(pendingQueryEstimate.totalBytesProcessedGB ?? 0);
            const cost = Number(pendingQueryEstimate.estimatedCostUSD ?? NaN) || (gb * 0.00625);
            let variant: 'info' | 'warning' | 'error' = 'info';
            let message = '';

            if (gb >= 100) {
              variant = 'error';
              message = 'Dette er en veldig stor spørring!';
            } else if (gb >= 20) {
              variant = 'warning';
              message = 'Dette er en stor spørring.';
            } else {
              variant = 'info';
              message = 'Denne spørringen vil prosessere en del data.';
            }

            return (
              <div className="space-y-4">
                <Alert variant={variant}>
                  <div className="space-y-2">
                    <p className="font-medium">{message}</p>
                    <p>
                      <strong>Data å prosessere:</strong> {pendingQueryEstimate.totalBytesProcessedGB} GB
                      {cost > 0 && ` • Kostnad: $${cost.toFixed(2)}`}
                    </p>
                  </div>
                </Alert>
                <p>Er du sikker på at du vil kjøre denne spørringen?</p>
              </div>
            );
          })()}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="primary"
            onClick={handleConfirmQuery}
            loading={loading}
          >
            Ja, kjør spørringen
          </Button>
          <Button
            variant="secondary"
            onClick={handleCancelQuery}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default QueryPreview;
