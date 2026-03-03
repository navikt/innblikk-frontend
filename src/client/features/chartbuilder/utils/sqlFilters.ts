import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts';
import { subDays, format } from 'date-fns';

interface SqlFilterParams {
  websiteId: string;
  selectedWebsiteDomain?: string;
  urlPath: string;
  pathOperator: string | null;
  dateRange: { from: Date | undefined; to: Date | undefined };
  customVariables: string[];
  customVariableValues: Record<string, string>;
}

/**
 * Replace Metabase-style placeholders in SQL with actual filter values.
 */
export const applyUrlFiltersToSql = (sql: string, params: SqlFilterParams): string => {
  let processedSql = sql;

  // Website ID substitution {{website_id}}
  const hasWebsitePlaceholderInline = /\{\{\s*website_id\s*\}\}/i.test(processedSql);
  if (hasWebsitePlaceholderInline && params.websiteId) {
    const sanitizedWebsiteId = params.websiteId.replace(/'/g, "''");
    processedSql = processedSql.replace(/(['"])?\s*\{\{\s*website_id\s*\}\}\s*\1?/gi, `'${sanitizedWebsiteId}'`);
  }

  // Nettside substitution {{nettside}} -> website domain
  const hasNettsidePlaceholder = /\{\{\s*nettside\s*\}\}/i.test(processedSql);
  if (hasNettsidePlaceholder && params.selectedWebsiteDomain) {
    const sanitizedDomain = params.selectedWebsiteDomain.replace(/'/g, "''");
    processedSql = processedSql.replace(/(['"])?\s*\{\{\s*nettside\s*\}\}\s*\1?/gi, `'${sanitizedDomain}'`);
  }

  // URL path substitution: e.g. url_path = [[ {{url_sti}} --]] '/'
  const pathSource = params.urlPath;
  const replacePattern = /\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']*')/gi;
  const directUrlVarPattern = /\{\{\s*url_(?:sti|path)\s*\}\}/gi;

  if (pathSource && pathSource !== '/') {
    processedSql = processedSql.replace(replacePattern, `'${pathSource}'`);
  } else {
    processedSql = processedSql.replace(replacePattern, '$1');
  }

  // Direct URL placeholder substitution: column = {{url_sti}} / {{url_path}}
  const directAssignmentRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi;
  if (pathSource && pathSource !== '/') {
    const operator = params.pathOperator === 'starts-with' ? 'starts-with' : 'equals';
    if (operator === 'starts-with') {
      processedSql = processedSql.replace(directAssignmentRegex, `$1 LIKE '${pathSource}%'`);
    } else {
      processedSql = processedSql.replace(directAssignmentRegex, `$1 = '${pathSource}'`);
    }
    processedSql = processedSql.replace(directUrlVarPattern, `'${pathSource}'`);
  } else {
    processedSql = processedSql.replace(directUrlVarPattern, "'/'");
  }

  // Optional URL path substitution [[AND {{url_sti}} ]]
  const andUrlStiPattern = /\[\[\s*AND\s*\{\{url_(?:sti|path)\}\}\s*\]\]/gi;
  if (andUrlStiPattern.test(processedSql)) {
    if (pathSource && pathSource !== '/') {
      const operator = params.pathOperator === 'starts-with' ? 'starts-with' : 'equals';
      if (operator === 'starts-with') {
        processedSql = processedSql.replace(andUrlStiPattern, `AND url_path LIKE '${pathSource}%'`);
      } else {
        processedSql = processedSql.replace(andUrlStiPattern, `AND url_path = '${pathSource}'`);
      }
    } else {
      processedSql = processedSql.replace(andUrlStiPattern, '');
    }
  }

  // Date substitution [[AND {{created_at}} ]]
  const datePattern = /\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/gi;
  if (datePattern.test(processedSql)) {
    const now = new Date();
    const from = params.dateRange.from || subDays(now, 30);
    const to = params.dateRange.to || now;
    const fromSql = `TIMESTAMP('${format(from, 'yyyy-MM-dd')}')`;
    const toSql = `TIMESTAMP('${format(to, 'yyyy-MM-dd')}T23:59:59')`;

    const projectId = getGcpProjectId();
    let tablePrefix = `\`${projectId}.umami_views.event\``;
    if (processedSql.includes('umami_views.event')) {
      tablePrefix = `\`${projectId}.umami_views.event\``;
    } else if (processedSql.includes('umami_views.session')) {
      tablePrefix = `\`${projectId}.umami_views.session\``;
    }

    const dateReplacement = `AND ${tablePrefix}.created_at BETWEEN ${fromSql} AND ${toSql}`;
    processedSql = processedSql.replace(datePattern, dateReplacement);
  }

  // Custom variable substitution
  for (const varName of params.customVariables) {
    const value = params.customVariableValues[varName];
    if (value !== undefined && value !== '') {
      const varRegex = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'gi');
      const isNumeric = /^-?\d+\.?\d*$/.test(value);
      const replacement = isNumeric ? value : `'${value.replace(/'/g, "''")}'`;
      processedSql = processedSql.replace(varRegex, replacement);
    }
  }

  return processedSql;
};

/**
 * Extract a UUID-format website_id from a SQL string.
 */
export const extractWebsiteId = (sql: string): string | undefined => {
  const match = sql.match(/website_id\s*=\s*['"]([0-9a-f-]{36})['"]/i);
  return match?.[1];
};
