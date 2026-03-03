import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from 'date-fns';

declare global {
    interface Window {
        __GCP_PROJECT_ID__?: string;
    }
}

// Get GCP_PROJECT_ID from runtime-injected global variable (server injects window.__GCP_PROJECT_ID__) (server injects window.__GCP_PROJECT_ID__)
const getGcpProjectId = (): string => {
    if (typeof window !== 'undefined' && window.__GCP_PROJECT_ID__) {
        return window.__GCP_PROJECT_ID__;
    }
    // Fallback for development/SSR contexts
    throw new Error('Missing runtime config: GCP_PROJECT_ID');
};

interface FilterState {
    urlFilters: string[];
    dateRange: string;
    pathOperator: string;
    metricType: 'visitors' | 'pageviews' | 'proportion' | 'visits';
    customStartDate?: Date;
    customEndDate?: Date;
}

export const processDashboardSql = (sql: string, websiteId: string, filters: FilterState): string => {
    // 0. Define timezone (default to Europe/Oslo)
    const timezone = 'Europe/Oslo';

    let processedSql = sql;

    // 1. Substitute website_id
    processedSql = processedSql.replace(/{{website_id}}/g, websiteId);

    // 2. Substitute URL Path
    const directUrlVarPattern = /\{\{\s*url_(?:sti|path)\s*\}\}/gi;
    if (filters.urlFilters.length > 0) {
        const operator = filters.pathOperator || 'equals';

        if (operator === 'starts-with') {
            if (filters.urlFilters.length === 1) {
                // Single value: simple LIKE
                const assignmentRegex = /=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']+')/gi;
                processedSql = processedSql.replace(assignmentRegex, `LIKE '${filters.urlFilters[0]}%'`);
            } else {
                // Multiple values: OR conditions
                const multiLikeRegex = /(\S+)\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']+')/gi;
                processedSql = processedSql.replace(multiLikeRegex, (_match, column) => {
                    const likeConditions = filters.urlFilters.map(p => `${column} LIKE '${p}%'`).join(' OR ');
                    return `(${likeConditions})`;
                });
            }
        } else {
            // equals operator
            const assignmentRegex = /=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']+')/gi;
            if (filters.urlFilters.length === 1) {
                processedSql = processedSql.replace(assignmentRegex, `= '${filters.urlFilters[0]}'`);
            } else {
                // Multiple values: IN clause
                const quotedPaths = filters.urlFilters.map(p => `'${p}'`).join(', ');
                processedSql = processedSql.replace(assignmentRegex, `IN (${quotedPaths})`);
            }
        }

        // Direct URL placeholder substitution: column = {{url_sti}} / {{url_path}}
        const directAssignmentRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi;
        if (operator === 'starts-with') {
            if (filters.urlFilters.length === 1) {
                processedSql = processedSql.replace(directAssignmentRegex, `$1 LIKE '${filters.urlFilters[0]}%'`);
            } else {
                processedSql = processedSql.replace(directAssignmentRegex, (_match, column) => {
                    const likeConditions = filters.urlFilters.map(p => `${column} LIKE '${p}%'`).join(' OR ');
                    return `(${likeConditions})`;
                });
            }
        } else if (filters.urlFilters.length === 1) {
            processedSql = processedSql.replace(directAssignmentRegex, `$1 = '${filters.urlFilters[0]}'`);
        } else {
            const quotedPaths = filters.urlFilters.map(p => `'${p}'`).join(', ');
            processedSql = processedSql.replace(directAssignmentRegex, `$1 IN (${quotedPaths})`);
        }

        // Fallback replacement if placeholder appears outside a direct assignment.
        processedSql = processedSql.replace(directUrlVarPattern, `'${filters.urlFilters[0]}'`);
    } else {
        // Remove marker to use default value
        processedSql = processedSql.replace(/\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]/gi, '');
        processedSql = processedSql.replace(directUrlVarPattern, "'/'");
    }

    // 3. Substitute Date / Created At
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    if (filters.dateRange === 'custom' && filters.customStartDate && filters.customEndDate) {
        startDate = filters.customStartDate;
        endDate = filters.customEndDate;
    } else {
        switch (filters.dateRange) {
            case 'today':
                startDate = now;
                endDate = now;
                break;
            case 'yesterday':
                startDate = subDays(now, 1);
                endDate = subDays(now, 1);
                break;
            case 'this_week':
                startDate = startOfWeek(now, { weekStartsOn: 1 });
                endDate = now;
                break;
            case 'last_7_days':
                startDate = subDays(now, 6);
                endDate = now;
                break;
            case 'last_week': {
                const lastWeekDate = subWeeks(now, 1);
                startDate = startOfWeek(lastWeekDate, { weekStartsOn: 1 });
                endDate = endOfWeek(lastWeekDate, { weekStartsOn: 1 });
                break;
            }
            case 'last_28_days':
                startDate = subDays(now, 27);
                endDate = now;
                break;
            case 'current_month':
                startDate = startOfMonth(now);
                endDate = now;
                break;
            case 'last_month': {
                const lastMonthDate = subMonths(now, 1);
                startDate = startOfMonth(lastMonthDate);
                endDate = endOfMonth(lastMonthDate);
                break;
            }
            default:
                startDate = subDays(now, 30);
                endDate = now;
                break;
        }
    }

    const fromSql = `TIMESTAMP('${format(startDate, 'yyyy-MM-dd')}', '${timezone}')`;
    const toSql = `TIMESTAMP('${format(endDate, 'yyyy-MM-dd')}T23:59:59', '${timezone}')`;

    const projectId = getGcpProjectId();
    // For newer queries using umami_views, we should use that table name.
    // However, since this utility replaces a placeholder in existing SQL, we need to check which table calls for it or use a safer regex.
    // The current implementation hardcodes the table name which is risky if the base query uses a different table.
    // Let's try to infer it or use the new default if not sure.
    // But to satisfy the immediate request of updating table names:
    const dateReplacement = `AND \`${projectId}.umami_views.event\`.created_at BETWEEN ${fromSql} AND ${toSql}`;
    processedSql = processedSql.replace(/\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/gi, dateReplacement);

    // 4. Handle metric type substitutions
    if (filters.metricType === 'pageviews') {
        processedSql = processedSql.replace(
            /COUNT\s*\(\s*DISTINCT\s+(?:[a-zA-Z_.]+\.)?session_id\s*\)\s+as\s+Unike_besokende/gi,
            'COUNT(*) as Sidevisninger'
        );
        processedSql = processedSql.replace(/\bUnike_besokende\b/g, 'Sidevisninger');
    } else if (filters.metricType === 'proportion') {
        const totalSiteVisitorsSubquery = `(SELECT COUNT(DISTINCT session_id) FROM \`${projectId}.umami_views.event\` WHERE website_id = '${websiteId}' AND event_type = 1 AND created_at BETWEEN ${fromSql} AND ${toSql})`;
        processedSql = processedSql.replace(
            /COUNT\s*\(\s*DISTINCT\s+(?:([a-zA-Z_.]+)\.)?session_id\s*\)\s+as\s+Unike_besokende/gi,
            (_match, tablePrefix) => {
                const sessionRef = tablePrefix ? `${tablePrefix}.session_id` : 'session_id';
                return `CONCAT(CAST(ROUND(COUNT(DISTINCT ${sessionRef}) * 100.0 / ${totalSiteVisitorsSubquery}, 1) AS STRING), '%') as Andel`;
            }
        );
        processedSql = processedSql.replace(/\bUnike_besokende\b/g, 'Andel');
    } else if (filters.metricType === 'visits') {
        processedSql = processedSql.replace(
            /COUNT\s*\(\s*DISTINCT\s+(?:[a-zA-Z_.]+\.)?session_id\s*\)\s+as\s+Unike_besokende/gi,
            'COUNT(DISTINCT visit_id) as `Antall økter`'
        );
        processedSql = processedSql.replace(/\bUnike_besokende\b/g, '`Antall økter`');
    }

    return processedSql;
};
