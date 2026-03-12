import { subDays, format } from 'date-fns';
import { getGcpProjectId } from './formatters';
import type { Website } from '../model/types';

interface SqlFilterContext {
    websiteIdState: string;
    selectedWebsite: Website | null;
    urlPathFromUrl: string | null;
    urlPath: string;
    pathOperatorFromUrl: string | null;
    dateRange: { from: Date | undefined; to: Date | undefined };
    customVariables: string[];
    customVariableValues: Record<string, string>;
}

export const applyUrlFiltersToSql = (sql: string, ctx: SqlFilterContext): string => {
    let processedSql = sql;
    let fromSql: string | null = null;
    let toSql: string | null = null;

    // Website ID substitution {{website_id}}
    const hasWebsitePlaceholderInline = /\{\{\s*website_id\s*\}\}/i.test(processedSql);
    if (hasWebsitePlaceholderInline && ctx.websiteIdState) {
        const sanitizedWebsiteId = ctx.websiteIdState.replace(/'/g, "''");
        processedSql = processedSql.replace(
            /(['"])?(\s*)\{\{\s*website_id\s*\}\}(\s*)\1?/gi,
            (_match, _quote, leading = '', trailing = '') => `${leading}'${sanitizedWebsiteId}'${trailing}`,
        );
    }

    // Nettside substitution {{nettside}} -> website domain
    const hasNettsidePlaceholder = /\{\{\s*nettside\s*\}\}/i.test(processedSql);
    if (hasNettsidePlaceholder && ctx.selectedWebsite?.domain) {
        const sanitizedDomain = ctx.selectedWebsite.domain.replace(/'/g, "''");
        processedSql = processedSql.replace(
            /(['"])?(\s*)\{\{\s*nettside\s*\}\}(\s*)\1?/gi,
            (_match, _quote, leading = '', trailing = '') => `${leading}'${sanitizedDomain}'${trailing}`,
        );
    }

    // URL path substitution (Metabase style [[ {{url_sti}} --]] '/' or [[ {{url_path}} --]] '/')
    const pathSource = ctx.urlPathFromUrl || ctx.urlPath;
    const directUrlVarPattern = /\{\{\s*url_(?:sti|path)\s*\}\}/gi;
    if (pathSource) {
        const paths = pathSource.split(',').filter(Boolean);
        const operator = ctx.pathOperatorFromUrl === 'starts-with' ? 'starts-with' : 'equals';

        if (paths.length > 0) {
            if (operator === 'starts-with') {
                if (paths.length === 1) {
                    const assignmentRegex = /=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']*')/gi;
                    processedSql = processedSql.replace(assignmentRegex, `LIKE '${paths[0]}%'`);
                } else {
                    const multiLikeRegex = /(\S+)\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']*')/gi;
                    processedSql = processedSql.replace(multiLikeRegex, (_m, column) => {
                        const likeConditions = paths.map(p => `${column} LIKE '${p}%'`).join(' OR ');
                        return `(${likeConditions})`;
                    });
                }
            } else {
                const assignmentRegex = /=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']*')/gi;
                processedSql = paths.length === 1
                    ? processedSql.replace(assignmentRegex, `= '${paths[0]}'`)
                    : processedSql.replace(assignmentRegex, `IN (${paths.map(p => `'${p}'`).join(', ')})`);
            }
        }

        // Direct URL placeholder substitution: column = {{url_sti}} / {{url_path}}
        const directAssignmentRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi;
        if (operator === 'starts-with') {
            if (paths.length === 1) {
                processedSql = processedSql.replace(directAssignmentRegex, `$1 LIKE '${paths[0]}%'`);
            } else {
                processedSql = processedSql.replace(directAssignmentRegex, (_m, column) => {
                    const likeConditions = paths.map(p => `${column} LIKE '${p}%'`).join(' OR ');
                    return `(${likeConditions})`;
                });
            }
        } else if (paths.length === 1) {
            processedSql = processedSql.replace(directAssignmentRegex, `$1 = '${paths[0]}'`);
        } else {
            const quotedPaths = paths.map(p => `'${p}'`).join(', ');
            processedSql = processedSql.replace(directAssignmentRegex, `$1 IN (${quotedPaths})`);
        }

        // Fallback replacement if placeholder appears outside a direct assignment.
        processedSql = processedSql.replace(directUrlVarPattern, `'${paths[0]}'`);
    } else {
        // No external path provided: treat as whole website (remove URL filter clauses).
        const optionalClausePattern = /\s+AND\s+[\w`.-]*url_path\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*'\/'/gi;
        const directClausePattern = /\s+AND\s+[\w`.-]*url_path\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi;
        const placeholderLinePattern = /^\s*AND\s+[^\n]*url_path[^\n]*\{\{\s*url_(?:sti|path)\s*\}\}[^\n]*$/gim;
        const optionalPlaceholderLinePattern = /^\s*AND\s+[^\n]*url_path[^\n]*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\][^\n]*$/gim;
        const directAssignmentRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi;
        processedSql = processedSql.replace(optionalClausePattern, '');
        processedSql = processedSql.replace(directClausePattern, '');
        processedSql = processedSql.replace(placeholderLinePattern, '');
        processedSql = processedSql.replace(optionalPlaceholderLinePattern, '');
        // Fallback if placeholder assignment is inline (not line-based)
        processedSql = processedSql.replace(directAssignmentRegex, '1=1');
        processedSql = processedSql.replace(/\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]/gi, '');
        // Do not force '/' when URL is blank; keep whole-site behavior.
        processedSql = processedSql.replace(directUrlVarPattern, '');
    }

    // Optional URL path substitution [[AND {{url_sti}} ]] or [[AND {{url_path}} ]]
    const andUrlStiPattern = /\[\[\s*AND\s*\{\{url_(?:sti|path)\}\}\s*\]\]/gi;
    if (andUrlStiPattern.test(processedSql)) {
        if (pathSource) {
            const path = pathSource.split(',')[0];
            const operator = ctx.pathOperatorFromUrl === 'starts-with' ? 'starts-with' : 'equals';

            if (operator === 'starts-with') {
                processedSql = processedSql.replace(andUrlStiPattern, `AND url_path LIKE '${path}%'`);
            } else {
                processedSql = processedSql.replace(andUrlStiPattern, `AND url_path = '${path}'`);
            }
        } else {
            processedSql = processedSql.replace(andUrlStiPattern, '');
        }
    }

    // Date substitution [[AND {{created_at}} ]]
    const datePattern = /\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/gi;
    if (datePattern.test(processedSql)) {
        const now = new Date();
        const from = ctx.dateRange.from || subDays(now, 30);
        const to = ctx.dateRange.to || now;
        fromSql = `TIMESTAMP('${format(from, 'yyyy-MM-dd')}')`;
        toSql = `TIMESTAMP('${format(to, 'yyyy-MM-dd')}T23:59:59')`;

        const projectId = getGcpProjectId();
        let tablePrefix = `\`${projectId}.umami_views.event\``;
        if (processedSql.includes('umami_views.event')) {
            tablePrefix = `\`${projectId}.umami_views.event\``;
        } else if (processedSql.includes('umami_views.session')) {
            tablePrefix = `\`${projectId}.umami_views.session\``;
        } else if (processedSql.includes('public_session') && !processedSql.includes('public_website_event')) {
            tablePrefix = `\`${projectId}.umami.public_session\``;
        }

        const dateReplacement = `AND ${tablePrefix}.created_at BETWEEN ${fromSql} AND ${toSql}`;
        processedSql = processedSql.replace(datePattern, dateReplacement);
    }

    // If query joins partitioned public_session, mirror the date filter
    if (fromSql && toSql && /public_session/gi.test(processedSql) && !/public_session[^\n]*created_at/gi.test(processedSql)) {
        const projectId = getGcpProjectId();
        const eventFilter = `\`${projectId}.umami_views.event\`.created_at BETWEEN ${fromSql} AND ${toSql}`;
        const sessionPredicate = `\`${projectId}.umami_views.session\`.created_at BETWEEN ${fromSql} AND ${toSql}`;

        if (processedSql.includes(eventFilter)) {
            processedSql = processedSql.replace(eventFilter, `${eventFilter} AND ${sessionPredicate}`);
        } else if (/WHERE/i.test(processedSql)) {
            processedSql = processedSql.replace(/WHERE/i, (match) => `${match} ${sessionPredicate} AND`);
        }
    }

    // Custom variable substitution {{variable_name}}
    for (const varName of ctx.customVariables) {
        const value = ctx.customVariableValues[varName];
        if (value !== undefined && value !== '') {
            const varRegex = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'gi');
            const isNumeric = /^-?\d+\.?\d*$/.test(value);
            const replacement = isNumeric ? value : `'${value.replace(/'/g, "''")}'`;
            processedSql = processedSql.replace(varRegex, replacement);
        }
    }

    return processedSql;
};

// Only substitute website_id placeholder for copy actions (keep other filters untouched)
export const applyWebsiteIdOnly = (sql: string, websiteIdState: string): string => {
    let processedSql = sql;
    const hasWebsitePlaceholderInline = /\{\{\s*website_id\s*\}\}/i.test(processedSql);
    if (hasWebsitePlaceholderInline && websiteIdState) {
        const sanitizedWebsiteId = websiteIdState.replace(/'/g, "''");
        processedSql = processedSql.replace(
            /(['"])?(\s*)\{\{\s*website_id\s*\}\}(\s*)\1?/gi,
            (_match, _quote, leading = '', trailing = '') => `${leading}'${sanitizedWebsiteId}'${trailing}`,
        );
    }
    return processedSql;
};

export const ensureWebsitePlaceholder = (currentQuery: string): string => {
    // If any website-related placeholder or filter already exists, leave untouched
    if (
        /\{\{\s*website_id\s*\}\}/i.test(currentQuery) ||
        /\{\{\s*nettside\s*\}\}/i.test(currentQuery) ||
        /website_id\s*=\s*['"]/i.test(currentQuery) ||
        /website_domain\s*=\s*/i.test(currentQuery)
    ) {
        return currentQuery;
    }

    const table = `\`${getGcpProjectId()}.umami_views.event\``;

    if (/WHERE/i.test(currentQuery)) {
        return currentQuery.replace(/WHERE/i, (match) => `${match} ${table}.website_id = '{{website_id}}' AND`);
    }

    const trimmed = currentQuery.trimEnd();
    const suffix = trimmed.endsWith(';') ? ';' : '';
    const base = trimmed.replace(/;$/, '');
    return `${base} WHERE ${table}.website_id = '{{website_id}}'${suffix}`;
};

// Extract websiteId from SQL query
export const extractWebsiteId = (sql: string): string | undefined => {
    const match = sql.match(/website_id\s*=\s*['"]([0-9a-f-]{36})['"]/i);
    return match?.[1];
};

// Replace hardcoded website_id with a new one
export const replaceHardcodedWebsiteId = (sql: string, newWebsiteId: string): string => {
    return sql.replace(
        /(website_id\s*=\s*)(['"])([0-9a-f-]{36})\2/gi,
        `$1$2${newWebsiteId}$2`
    );
};

// Temporarily replace Metabase placeholders with valid SQL for formatting/validation
export const sanitizePlaceholders = (sql: string): { sanitized: string; placeholders: Map<string, string> } => {
    const placeholders = new Map<string, string>();
    let sanitized = sql;
    let counter = 0;

    // Replace [[...]] optional blocks with a unique token
    sanitized = sanitized.replace(/\[\[[^\]]*\]\]/g, (match) => {
        const token = `__METABASE_OPT_${counter++}__`;
        placeholders.set(token, match);
        return `/* ${token} */`;
    });

    // Replace {{...}} variable placeholders with a unique token
    sanitized = sanitized.replace(/\{\{[^}]+\}\}/g, (match) => {
        const token = `__METABASE_VAR_${counter++}__`;
        placeholders.set(token, match);
        return `'${token}'`;
    });

    return { sanitized, placeholders };
};

// Restore Metabase placeholders after formatting
export const restorePlaceholders = (sql: string, placeholders: Map<string, string>): string => {
    let restored = sql;
    placeholders.forEach((original, token) => {
        restored = restored.replace(new RegExp(`/\\*\\s*${token}\\s*\\*/`, 'g'), original);
        restored = restored.replace(new RegExp(`'${token}'`, 'g'), original);
    });
    return restored;
};

// Helper to update URL params without losing others
export const updateUrlParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
            params.delete(key);
        } else {
            params.set(key, value);
        }
    });
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
};
