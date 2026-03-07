import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { subDays } from 'date-fns';
import * as sqlFormatter from 'sql-formatter';

import type { Website, QueryResult, QueryStats } from '../model/types';
import { getDefaultQuery } from '../utils/formatters';
import {
    applyUrlFiltersToSql,
    applyWebsiteIdOnly,
    ensureWebsitePlaceholder,
    extractWebsiteId,
    replaceHardcodedWebsiteId,
    sanitizePlaceholders,
    restorePlaceholders,
    updateUrlParams,
} from '../utils/sqlProcessing';
import { prepareLineChartData, prepareBarChartData, preparePieChartData } from '../utils/chartHelpers';
import { fetchWebsites, estimateQueryCost, executeQueryApi } from '../api/sqlApi';

export const useSqlEditor = () => {
    const [searchParams] = useSearchParams();

    const urlPathFromUrl = searchParams.get('urlPath');
    const pathOperatorFromUrl = searchParams.get('pathOperator');
    const dateRangeFromUrl = searchParams.get('dateRange');
    const customStartFromUrl = searchParams.get('customStartDate');
    const customEndFromUrl = searchParams.get('customEndDate');

    const [hasMetabaseDateFilter, setHasMetabaseDateFilter] = useState(false);
    const [hasUrlPathFilter, setHasUrlPathFilter] = useState(false);
    const [hasWebsiteIdPlaceholder, setHasWebsiteIdPlaceholder] = useState(false);
    const [hasNettsidePlaceholder, setHasNettsidePlaceholder] = useState(false);
    const [hasHardcodedWebsiteId, setHasHardcodedWebsiteId] = useState(false);
    const [customVariables, setCustomVariables] = useState<string[]>([]);
    const [customVariableValues, setCustomVariableValues] = useState<Record<string, string>>({});
    const [oldTableWarning, setOldTableWarning] = useState<boolean>(false);
    const [showUpgradeSuccess, setShowUpgradeSuccess] = useState<boolean>(false);
    const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false);
    const [availableWebsites, setAvailableWebsites] = useState<Website[]>([]);
    const autoSelectedWebsiteIdRef = useRef<string | null>(null);
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>(() => {
        const now = new Date();
        return {
            from: new Date(now.getFullYear(), now.getMonth(), 1),
            to: now,
        };
    });
    const [period, setPeriod] = useState<string>('current_month');
    const [urlPath, setUrlPath] = useState('/');
    const [websiteIdState, setWebsiteIdState] = useState<string>('');
    const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);

    // Editor state
    const [editorHeight, setEditorHeight] = useState(400);
    const [query, setQuery] = useState('');
    const [validateError, setValidateError] = useState<string | null>(null);
    const [showValidation, setShowValidation] = useState(false);
    const [result, setResult] = useState<QueryResult | null>(null);
    const [estimate, setEstimate] = useState<QueryStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [estimating, setEstimating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showEstimate, setShowEstimate] = useState(true);
    const [shareSuccess, setShareSuccess] = useState(false);
    const [formatSuccess, setFormatSuccess] = useState(false);
    const [lastProcessedSql, setLastProcessedSql] = useState<string>('');
    const [copiedMetabase, setCopiedMetabase] = useState(false);

    // Ensure we land at top when navigating in
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, []);

    // Build filter context for SQL processing
    const getFilterContext = useCallback(() => ({
        websiteIdState,
        selectedWebsite,
        urlPathFromUrl,
        urlPath,
        pathOperatorFromUrl,
        dateRange,
        customVariables,
        customVariableValues,
    }), [websiteIdState, selectedWebsite, urlPathFromUrl, urlPath, pathOperatorFromUrl, dateRange, customVariables, customVariableValues]);

    const websiteId = extractWebsiteId(query);

    // Check for SQL in URL params on mount and init filters
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        let sqlParam = urlParams.get('sql');
        const sqlStorageKey = urlParams.get('sqlStorageKey');
        const defaultQuery = getDefaultQuery();

        if (!sqlParam && sqlStorageKey) {
            try {
                const storedSql = window.sessionStorage.getItem(sqlStorageKey);
                if (storedSql) {
                    sqlParam = storedSql;
                    window.sessionStorage.removeItem(sqlStorageKey);
                }
            } catch {
                // Ignore storage access issues and fall back to default query.
            }
        }

        if (sqlParam) {
            try {
                setQuery(sqlParam);
            } catch {
                setQuery(defaultQuery);
            }
        } else {
            setQuery(defaultQuery);
        }

        // Init urlPath state from URL
        if (urlPathFromUrl) {
            setUrlPath(urlPathFromUrl.split(',')[0]);
        }

        // Init websiteId from URL
        const websiteIdParam = urlParams.get('websiteId');
        if (websiteIdParam) {
            setWebsiteIdState(websiteIdParam);
        }

        // Init date range state from URL
        const now = new Date();
        let from: Date | undefined = subDays(now, 30);
        let to: Date | undefined = now;
        if (dateRangeFromUrl === 'custom' && customStartFromUrl && customEndFromUrl) {
            from = new Date(customStartFromUrl);
            to = new Date(customEndFromUrl);
        } else if (dateRangeFromUrl === 'current_month') {
            from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
            to = now;
        } else if (dateRangeFromUrl === 'last_month') {
            from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            to = new Date(now.getFullYear(), now.getMonth(), 0);
        }
        setDateRange({ from, to });

        if (dateRangeFromUrl) {
            setPeriod(dateRangeFromUrl);
        }
    }, [customEndFromUrl, customStartFromUrl, dateRangeFromUrl, urlPathFromUrl]);

    // Detect metabase placeholders and hardcoded website IDs
    useEffect(() => {
        if (!query) {
            setHasMetabaseDateFilter(false);
            setHasUrlPathFilter(false);
            setHasWebsiteIdPlaceholder(false);
            setHasNettsidePlaceholder(false);
            setHasHardcodedWebsiteId(false);
            return;
        }
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

        const websiteIdPattern = /\{\{\s*website_id\s*\}\}/i;
        setHasWebsiteIdPlaceholder(websiteIdPattern.test(query));

        const nettsidePattern = /\{\{\s*nettside\s*\}\}/i;
        setHasNettsidePlaceholder(nettsidePattern.test(query));

        const hardcodedWebsiteIdPattern = /website_id\s*=\s*['"][0-9a-f-]{36}['"]/i;
        setHasHardcodedWebsiteId(hardcodedWebsiteIdPattern.test(query));

        // Detect custom {{variable}} placeholders (excluding known ones)
        const urlPathInSpecialPattern =
            urlPathPattern.test(query) ||
            andUrlPathPattern.test(query) ||
            urlPathPattern2.test(query) ||
            andUrlPathPattern2.test(query) ||
            directUrlPathPattern.test(query);

        const alwaysKnownVariables = ['website_id', 'nettside', 'created_at'];
        const knownVariables = urlPathInSpecialPattern
            ? [...alwaysKnownVariables, 'url_sti', 'url_path']
            : alwaysKnownVariables;

        const allVariablesRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/gi;
        const matches = [...query.matchAll(allVariablesRegex)];
        const detectedVars = matches
            .map(m => m[1])
            .filter(v => !knownVariables.includes(v.toLowerCase()))
            .filter((v, i, arr) => arr.indexOf(v) === i);
        setCustomVariables(detectedVars);
    }, [query]);

    // Detect usage of old tables
    useEffect(() => {
        const hasOldEventTable = /umami\.public_website_event/.test(query);
        const hasOldSessionTable = /umami\.public_session/.test(query);
        setOldTableWarning(hasOldEventTable || hasOldSessionTable);
    }, [query]);

    // Fetch available websites for auto-selection
    useEffect(() => {
        if (availableWebsites.length > 0) return;

        fetchWebsites()
            .then(setAvailableWebsites)
            .catch((err: unknown) => {
                console.error('Error fetching websites for auto-selection:', err);
            });
    }, [availableWebsites.length]);

    // Auto-select website when a hardcoded website_id is detected
    useEffect(() => {
        if (!hasHardcodedWebsiteId || availableWebsites.length === 0) return;

        const detectedWebsiteId = extractWebsiteId(query);
        if (!detectedWebsiteId) return;

        if (autoSelectedWebsiteIdRef.current === detectedWebsiteId) return;
        if (selectedWebsite?.id === detectedWebsiteId) {
            autoSelectedWebsiteIdRef.current = detectedWebsiteId;
            return;
        }

        const matchingWebsite = availableWebsites.find(w => w.id === detectedWebsiteId);
        if (matchingWebsite) {
            console.log('Auto-selecting website from SQL:', matchingWebsite.name);
            setSelectedWebsite(matchingWebsite);
            setWebsiteIdState(matchingWebsite.id);
            autoSelectedWebsiteIdRef.current = detectedWebsiteId;
        }
    }, [hasHardcodedWebsiteId, query, availableWebsites, selectedWebsite?.id]);

    const estimateCost = async () => {
        setEstimating(true);
        setError(null);
        updateUrlParams({ sql: query });

        const processedSql = applyUrlFiltersToSql(query, getFilterContext());
        setLastProcessedSql(processedSql);

        try {
            const data = await estimateQueryCost(processedSql);
            setEstimate(data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
        } finally {
            setEstimating(false);
        }
    };

    const executeQuery = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        setHasAttemptedFetch(true);
        updateUrlParams({ sql: query });

        const processedSql = applyUrlFiltersToSql(query, getFilterContext());
        setLastProcessedSql(processedSql);

        try {
            const data = await executeQueryApi(processedSql);
            setResult(data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const validateSQL = () => {
        updateUrlParams({ sql: query });

        if (!query.trim()) {
            setValidateError('SQL kan ikke være tom.');
            setShowValidation(true);
            return false;
        }
        const valid = /\b(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|DROP|ALTER|SHOW|DESCRIBE)\b/i.test(query);
        if (!valid) {
            setValidateError('SQL må inneholde en gyldig kommando (f.eks. SELECT, INSERT, ...).');
            setShowValidation(true);
            return false;
        }
        try {
            const { sanitized } = sanitizePlaceholders(query);
            sqlFormatter.format(sanitized);
            setValidateError('SQL er gyldig!');
            setShowValidation(true);
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Syntaksfeil';
            setValidateError('Ugyldig SQL: ' + message);
            setShowValidation(true);
            return false;
        }
    };

    const formatSQL = () => {
        updateUrlParams({ sql: query });

        try {
            const { sanitized, placeholders } = sanitizePlaceholders(query);
            const formatted = sqlFormatter.format(sanitized);
            const restored = restorePlaceholders(formatted, placeholders);
            setQuery(restored);
            setFormatSuccess(true);
            setTimeout(() => setFormatSuccess(false), 2000);
        } catch {
            setValidateError('Kunne ikke formatere SQL. Sjekk om den er gyldig.');
            setShowValidation(true);
        }
    };

    const shareQuery = () => {
        const encodedSql = encodeURIComponent(query);
        const shareUrl = `${window.location.origin}/sql?sql=${encodedSql}`;
        void navigator.clipboard.writeText(shareUrl);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 3000);
    };

    const handleQueryChange = (val: string) => {
        setQuery(val);
        setShowValidation(false);
    };

    const handleWebsiteChange = (website: Website | null) => {
        setSelectedWebsite(website);
        setWebsiteIdState(website?.id || '');

        const currentWebsiteIdInSql = extractWebsiteId(query);
        const isNewWebsite = website?.id && website.id !== currentWebsiteIdInSql;

        if (hasHardcodedWebsiteId && isNewWebsite) {
            setQuery(prev => replaceHardcodedWebsiteId(prev, website.id));
        } else if (!hasHardcodedWebsiteId && !hasNettsidePlaceholder) {
            setQuery(prev => ensureWebsitePlaceholder(prev));
        }
    };

    const handleUpgradeTables = () => {
        const newQuery = query
            .replace(/umami\.public_website_event/gi, 'umami_views.event')
            .replace(/umami\.public_session/gi, 'umami_views.session');
        setQuery(newQuery);
        setOldTableWarning(false);
        setShowUpgradeSuccess(true);
    };

    const handleAddDateFilter = () => {
        if (/WHERE/i.test(query) && !/\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/i.test(query)) {
            const whereMatch = query.match(/WHERE\s+([\s\S]*?)(?=\s*(GROUP BY|ORDER BY|LIMIT|$|\)[\s\n]*,))/i);
            if (whereMatch) {
                const whereClause = whereMatch[0];
                const newWhereClause = whereClause.trimEnd() + '\n      [[AND {{created_at}}]]';
                const newQuery = query.replace(whereClause, newWhereClause);
                setQuery(newQuery);
            }
        }
        setError(null);
    };

    const handleCopyMetabase = () => {
        const metabaseSql = applyWebsiteIdOnly(query, websiteIdState);
        void navigator.clipboard.writeText(metabaseSql);
        setCopiedMetabase(true);
        setTimeout(() => setCopiedMetabase(false), 2000);
    };

    const handlePeriodChange = (newPeriod: string) => {
        setPeriod(newPeriod);
        const now = new Date();
        let newFrom: Date | undefined;
        let newTo: Date | undefined;

        if (newPeriod === 'today') {
            newFrom = now;
            newTo = now;
        } else if (newPeriod === 'current_month') {
            newFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
            newTo = now;
        } else if (newPeriod === 'last_month') {
            newFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            newTo = new Date(now.getFullYear(), now.getMonth(), 0);
        }

        if (newFrom && newTo) {
            setDateRange({ from: newFrom, to: newTo });
        }

        updateUrlParams({
            dateRange: newPeriod,
            customStartDate: null,
            customEndDate: null
        });
    };

    const handleStartDateChange = (date: Date | undefined) => {
        setDateRange(prev => {
            const newState = { ...prev, from: date };
            setPeriod('custom');
            updateUrlParams({
                dateRange: 'custom',
                customStartDate: date ? date.toISOString() : null,
                customEndDate: newState.to ? newState.to.toISOString() : null
            });
            return newState;
        });
    };

    const handleEndDateChange = (date: Date | undefined) => {
        setDateRange(prev => {
            const newState = { ...prev, to: date };
            setPeriod('custom');
            updateUrlParams({
                dateRange: 'custom',
                customStartDate: newState.from ? newState.from.toISOString() : null,
                customEndDate: date ? date.toISOString() : null
            });
            return newState;
        });
    };

    // Chart data preparation (wrapping utils with current result data)
    const getLineChartData = (includeAverage: boolean = false) => {
        if (!result?.data) return null;
        return prepareLineChartData(result.data, includeAverage);
    };

    const getBarChartData = () => {
        if (!result?.data) return null;
        return prepareBarChartData(result.data);
    };

    const getPieChartData = () => {
        if (!result?.data) return null;
        return preparePieChartData(result.data);
    };

    return {
        // State
        query,
        result,
        estimate,
        loading,
        estimating,
        error,
        validateError,
        showValidation,
        showEstimate,
        shareSuccess,
        formatSuccess,
        lastProcessedSql,
        copiedMetabase,
        editorHeight,
        hasAttemptedFetch,
        oldTableWarning,
        showUpgradeSuccess,
        websiteId,
        period,
        dateRange,
        urlPath,
        selectedWebsite,
        customVariables,
        customVariableValues,
        hasMetabaseDateFilter,
        hasUrlPathFilter,
        hasWebsiteIdPlaceholder,
        hasNettsidePlaceholder,
        hasHardcodedWebsiteId,

        // Setters
        setEditorHeight,
        setShowValidation,
        setShowEstimate,
        setShowUpgradeSuccess,
        setUrlPath,
        setCustomVariableValues,

        // Actions
        handleQueryChange,
        handleWebsiteChange,
        handleUpgradeTables,
        handleAddDateFilter,
        handleCopyMetabase,
        handlePeriodChange,
        handleStartDateChange,
        handleEndDateChange,
        estimateCost,
        executeQuery,
        validateSQL,
        formatSQL,
        shareQuery,

        // Chart helpers
        prepareLineChartData: getLineChartData,
        prepareBarChartData: getBarChartData,
        preparePieChartData: getPieChartData,
    };
};
