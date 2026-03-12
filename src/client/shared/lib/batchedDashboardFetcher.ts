/**
 * Batched Dashboard Data Fetcher
 * 
 * Optimizes dashboard data loading by combining multiple similar queries
 * into a single query, significantly reducing BigQuery scanning costs.
 * 
 * Main optimization: Session metric charts (country, language, device, browser, os, screen)
 * all share the same base scan - we can fetch raw session data ONCE
 * and compute all aggregates client-side.
 */

import type {SavedChart} from '../../../data/dashboard';
import {format, subDays} from 'date-fns';
import {getGcpProjectId} from './runtimeConfig.ts';
import {isRecord} from './typeGuards';

type JsonPrimitive = string | number | boolean | null | undefined;
interface JsonObject {
    [key: string]: JsonValue;
}
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

type MetricType = 'visitors' | 'pageviews' | 'proportion' | 'visits';

type SessionRow = {
    session_id: string;
    visit_id?: string;
} & Partial<Record<(typeof SESSION_FIELDS)[number], string | null>>;

interface Filters {
    urlFilters: string[];
    dateRange: string;
    pathOperator: string;
    metricType: MetricType;
    customStartDate?: Date;
    customEndDate?: Date;
}

interface FetchResult<TData extends JsonObject = JsonObject> {
    data: TData[];
    queryStats?: {
        totalBytesProcessed: number;
    };
}

interface BatchedFetchResult {
    chartResults: Map<string, JsonObject[]>;
    totalBytesProcessed: number;
    chartBytes: Map<string, number>;
}

// Session fields that can be batched together
const SESSION_FIELDS = ['country', 'language', 'device', 'os', 'browser', 'screen'];


const isFetchResult = (value: unknown): value is FetchResult => {
    if (!isRecord(value)) return false;
    return Array.isArray(value.data);
};

const isSessionRow = (value: unknown): value is SessionRow => {
    if (!isRecord(value)) return false;
    if (typeof value.session_id !== 'string') return false;
    return !(value.visit_id !== undefined && typeof value.visit_id !== 'string');

};

const getFetchResultData = <T extends JsonObject>(
    value: unknown,
    itemGuard: (item: unknown) => item is T
): T[] => {
    if (!isFetchResult(value)) return [];
    return value.data.filter(itemGuard);
};

const getFetchResultBytes = (value: unknown): number => {
    if (!isFetchResult(value) || !isRecord(value.queryStats)) return 0;
    return value.queryStats.totalBytesProcessed;
};

const getTotalVisitors = (value: unknown): number | undefined => {
    if (!isFetchResult(value)) return undefined;
    const first = value.data[0];
    if (!isRecord(first)) return undefined;
    const total = first.total;
    if (typeof total === 'number') return total;
    if (typeof total === 'string' && total.trim() !== '' && !Number.isNaN(Number(total))) {
        return Number(total);
    }
    return undefined;
};

/**
 * Detects which session field a chart is grouping by
 */
function getSessionField(chart: SavedChart): string | null {
    if (!chart.sql) return null;

    const sql = chart.sql.toLowerCase();
    if (!sql.includes('public_session') && !sql.includes('umami_views.session')) return null;

    for (const field of SESSION_FIELDS) {
        if (sql.includes(`base_query.${field}`) && sql.includes(`group by`)) {
            // Check it's actually grouping by this field
            const groupMatch = sql.match(/group\s+by\s+[\s\S]*?base_query\.(\w+)/i);
            if (groupMatch && groupMatch[1].toLowerCase() === field) {
                return field;
            }
        }
    }
    return null;
}

/**
 * Builds a combined query that fetches raw session data in a SINGLE scan.
 * We then aggregate client-side. This is cheaper because BigQuery bills by bytes scanned,
 * and a single scan = ~10GB vs 6 separate scans = ~60GB.
 */
function buildCombinedSessionQuery(
    websiteId: string,
    filters: Filters,
    fields: string[]
): string {
    const projectId = getGcpProjectId();
    const tableName = `\`${projectId}.umami_views.event\``;
    const sessionTable = `\`${projectId}.umami_views.session\``;

    // Build the fields string
    const fieldsSelect = fields.map(f => `${sessionTable}.${f}`).join(',\n    ');

    // Calculate dates
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    if (filters.dateRange === 'custom' && filters.customStartDate && filters.customEndDate) {
        startDate = filters.customStartDate;
        endDate = filters.customEndDate;
    } else if (filters.dateRange === 'this-month' || filters.dateRange === 'current_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (filters.dateRange === 'last-month' || filters.dateRange === 'last_month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    } else {
        startDate = subDays(now, 30);
    }

    const timezone = 'Europe/Oslo';
    const fromSql = `TIMESTAMP('${format(startDate, 'yyyy-MM-dd')}', '${timezone}')`;
    const toSql = `TIMESTAMP('${format(endDate, 'yyyy-MM-dd')}T23:59:59', '${timezone}')`;

    // Build URL filter - returns either a simple condition or a complex OR expression
    let urlFilterClause: string;
    if (filters.urlFilters.length > 0) {
        if (filters.pathOperator === 'starts-with') {
            // starts-with - support multiple values with OR conditions
            if (filters.urlFilters.length === 1) {
                urlFilterClause = `AND ${tableName}.url_path LIKE '${filters.urlFilters[0]}%'`;
            } else {
                const likeConditions = filters.urlFilters.map(p => `${tableName}.url_path LIKE '${p}%'`).join(' OR ');
                urlFilterClause = `AND (${likeConditions})`;
            }
        } else {
            // equals operator - support multiple values with IN clause
            if (filters.urlFilters.length === 1) {
                urlFilterClause = `AND ${tableName}.url_path = '${filters.urlFilters[0]}'`;
            } else {
                const quotedPaths = filters.urlFilters.map(p => `'${p}'`).join(', ');
                urlFilterClause = `AND ${tableName}.url_path IN (${quotedPaths})`;
            }
        }
    } else {
        // No URL filter selected means whole website.
        urlFilterClause = '';
    }

    // For visitors: use DISTINCT to get unique sessions
    // For pageviews: don't use DISTINCT so we can count all events
    // For proportion: use DISTINCT since we're calculating percentage of unique visitors
    // For visits: use DISTINCT to get unique visits (visit_id)
    const useDistinct = filters.metricType !== 'pageviews';
    const includeVisitId = filters.metricType === 'visits';

    // Single scan query
    return `
WITH base_query AS (
  SELECT
    ${tableName}.session_id,
    ${includeVisitId ? `${tableName}.visit_id,` : ''}
    ${fieldsSelect}
  FROM ${tableName}
  LEFT JOIN ${sessionTable}
    ON ${tableName}.session_id = ${sessionTable}.session_id
  WHERE ${tableName}.website_id = '${websiteId}'
  AND ${tableName}.event_type = 1
  ${urlFilterClause}
  AND ${tableName}.created_at BETWEEN ${fromSql} AND ${toSql}
  AND ${sessionTable}.created_at BETWEEN ${fromSql} AND ${toSql}
)

SELECT${useDistinct ? ' DISTINCT' : ''}
  session_id,
  ${includeVisitId ? 'visit_id,' : ''}
  ${fields.join(',\n  ')}
FROM base_query
LIMIT 100000
  `.trim();
}
/**
 * Aggregates raw session data for a specific field (client-side)
 * Supports unique visitors (COUNT DISTINCT session_id), pageviews (COUNT *), and proportion (%)
 * For proportion mode, totalSiteVisitors should be provided to calculate percentage against all site visitors
 */
function aggregateByField(
    rawData: SessionRow[],
    field: (typeof SESSION_FIELDS)[number],
    metricType: MetricType,
    totalSiteVisitors?: number
): JsonObject[] {
    if (metricType === 'pageviews') {
        const counts = new Map<string, number>();

        for (const row of rawData) {
            const key = row[field] ?? 'Ukjent';
            counts.set(String(key), (counts.get(String(key)) || 0) + 1);
        }

        const result = Array.from(counts.entries())
            .map(([value, count]) => ({
                [field]: value,
                Sidevisninger: count,
            }))
            .sort((a, b) => Number(b.Sidevisninger) - Number(a.Sidevisninger));

        if (field === 'device') {
            return result.filter(row => !String(row.device).includes('x'));
        }

        return result.slice(0, 1000);
    } else if (metricType === 'proportion') {
        const counts = new Map<string, Set<string>>();
        const allSessions = new Set<string>();

        for (const row of rawData) {
            const key = row[field] ?? 'Ukjent';
            const keyStr = String(key);
            if (!counts.has(keyStr)) counts.set(keyStr, new Set());
            counts.get(keyStr)!.add(row.session_id);
            allSessions.add(row.session_id);
        }

        const totalSessions = totalSiteVisitors ?? allSessions.size;

        const sortedEntries = Array.from(counts.entries())
            .map(([value, sessions]) => ({
                value,
                rawPercent: totalSessions > 0 ? (sessions.size / totalSessions) * 100 : 0,
            }))
            .sort((a, b) => b.rawPercent - a.rawPercent);

        const result = sortedEntries.map(entry => ({
            [field]: entry.value,
            Andel: `${entry.rawPercent.toFixed(1)}%`,
        }));

        if (field === 'device') {
            return result.filter(row => !String(row[field]).includes('x'));
        }

        return result.slice(0, 1000);
    } else if (metricType === 'visits') {
        const counts = new Map<string, Set<string>>();

        for (const row of rawData) {
            const key = row[field] ?? 'Ukjent';
            const keyStr = String(key);
            if (!counts.has(keyStr)) counts.set(keyStr, new Set());
            if (row.visit_id) counts.get(keyStr)!.add(row.visit_id);
        }

        const result = Array.from(counts.entries())
            .map(([value, visits]) => ({
                [field]: value,
                'Antall økter': visits.size,
            }))
            .sort((a, b) => Number(b['Antall økter']) - Number(a['Antall økter']));

        if (field === 'device') {
            return result.filter(row => !String(row.device).includes('x'));
        }

        return result.slice(0, 1000);
    } else {
        const counts = new Map<string, Set<string>>();

        for (const row of rawData) {
            const key = row[field] ?? 'Ukjent';
            const keyStr = String(key);
            if (!counts.has(keyStr)) counts.set(keyStr, new Set());
            counts.get(keyStr)!.add(row.session_id);
        }

        const result = Array.from(counts.entries())
            .map(([value, sessions]) => ({
                [field]: value,
                Unike_besokende: sessions.size,
            }))
            .sort((a, b) => Number(b.Unike_besokende) - Number(a.Unike_besokende));

        if (field === 'device') {
            return result.filter(row => !String(row.device).includes('x'));
        }

        return result.slice(0, 1000);
    }
}

/**
 * Main batched fetch function for dashboard
 */
export async function fetchDashboardDataBatched(
    charts: SavedChart[],
    websiteId: string,
    filters: Filters
): Promise<BatchedFetchResult> {
    const chartResults = new Map<string, JsonObject[]>();
    const chartBytes = new Map<string, number>();
    let totalBytesProcessed = 0;

    // Identify session-metric charts that can be batched
    const sessionCharts: SavedChart[] = [];
    const sessionFieldsNeeded: string[] = [];
    const otherCharts: SavedChart[] = [];

    for (const chart of charts) {
        if (!chart.sql || !chart.id) continue;

        const field = getSessionField(chart);
        if (field) {
            sessionCharts.push(chart);
            if (!sessionFieldsNeeded.includes(field)) {
                sessionFieldsNeeded.push(field);
            }
        } else {
            otherCharts.push(chart);
        }
    }

    console.log(`[QueryBatcher] Found ${sessionCharts.length} session charts to batch (${sessionFieldsNeeded.join(', ')})`);
    console.log(`[QueryBatcher] ${otherCharts.length} charts will be fetched individually`);

    // Fetch batched session data if we have session charts
    if (sessionCharts.length > 1 && sessionFieldsNeeded.length > 0) {
        try {
            const combinedSql = buildCombinedSessionQuery(websiteId, filters, sessionFieldsNeeded);

            console.log('[QueryBatcher] Executing combined session query for:', sessionFieldsNeeded);

            const response = await fetch('/api/bigquery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: combinedSql, analysisType: 'Dashboard' }),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch batched session data');
            }

            const result: unknown = await response.json();
            const rawData: SessionRow[] = getFetchResultData(result, isSessionRow);

            const batchBytes = getFetchResultBytes(result);
            totalBytesProcessed += batchBytes;

            // Distribute bytes evenly among batched charts
            const bytesPerChart = batchBytes / sessionCharts.length;

            // For proportion mode, fetch total site visitors (without URL filter)
            let totalSiteVisitors: number | undefined;
            if (filters.metricType === 'proportion') {
                const now = new Date();
                let startDate: Date;
                let endDate = now;

                if (filters.dateRange === 'custom' && filters.customStartDate && filters.customEndDate) {
                    startDate = filters.customStartDate;
                    endDate = filters.customEndDate;
                } else if (filters.dateRange === 'this-month' || filters.dateRange === 'current_month') {
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                } else if (filters.dateRange === 'last-month' || filters.dateRange === 'last_month') {
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                } else {
                    startDate = subDays(now, 30);
                }

                const timezone = 'Europe/Oslo';
                const fromSql = `TIMESTAMP('${format(startDate, 'yyyy-MM-dd')}', '${timezone}')`;
                const toSql = `TIMESTAMP('${format(endDate, 'yyyy-MM-dd')}T23:59:59', '${timezone}')`;

                const projectId = getGcpProjectId();
                const totalVisitorsSql = `
                    SELECT COUNT(DISTINCT session_id) as total
                    FROM \`${projectId}.umami_views.event\`
                    WHERE website_id = '${websiteId}'
                    AND event_type = 1
                    AND created_at BETWEEN ${fromSql} AND ${toSql}
                `;

                try {
                    const totalResponse = await fetch('/api/bigquery', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: totalVisitorsSql, analysisType: 'Dashboard' }),
                    });
                    if (totalResponse.ok) {
                        const totalResult: unknown = await totalResponse.json();
                        const total = getTotalVisitors(totalResult);
                        if (typeof total === 'number') {
                            totalSiteVisitors = total;
                            console.log(`[QueryBatcher] Total site visitors for proportion: ${totalSiteVisitors}`);
                        }
                    }
                } catch (e) {
                    console.error('[QueryBatcher] Failed to fetch total site visitors:', e);
                }
            }

            // Aggregate raw data for each chart's field (client-side)
            for (const chart of sessionCharts) {
                const field = getSessionField(chart);
                if (field) {
                    const aggregated = aggregateByField(rawData, field, filters.metricType, totalSiteVisitors);
                    chartResults.set(chart.id!, aggregated);
                    chartBytes.set(chart.id!, bytesPerChart);
                }
            }

            console.log(`[QueryBatcher] Batched query processed ${Math.round(batchBytes / (1024 ** 3))} GB for ${sessionCharts.length} charts`);

        } catch (error) {
            console.error('[QueryBatcher] Batched fetch failed, falling back to individual:', error);
            // Fall back to individual fetches
            otherCharts.push(...sessionCharts);
            sessionCharts.length = 0;
        }
    } else {
        // Not worth batching, add to individual
        otherCharts.push(...sessionCharts);
    }

    // Fetch individual charts (skipped for now - handled by DashboardWidget)
    // The Dashboard component will handle these normally

    return {
        chartResults,
        totalBytesProcessed,
        chartBytes
    };
}

/**
 * Check if a chart can be handled by batch fetching
 */
export function isBatchableChart(chart: SavedChart): boolean {
    return getSessionField(chart) !== null;
}

/**
 * Get the session field for a chart (exposed for Dashboard component)
 */
export { getSessionField };
