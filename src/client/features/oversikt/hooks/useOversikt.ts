import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { normalizeUrlToPath } from '../../../shared/lib/utils.ts';
import type { Website } from '../../dashboard/model/types.ts';
import type {
    ProjectDto, DashboardDto, GraphCategoryDto, GraphWithQueries, FilterState, MetricType,
    OversiktChart, OversiktSelectOption,
} from '../model/types.ts';
import { createDashboard, createProject, fetchProjects, fetchDashboards, fetchCategories, fetchGraphs, fetchQueries, updateGraphOrdering } from '../api/oversiktApi.ts';
import {
    parseId,
    arraysEqual,
    mapGraphTypeToChart,
    normalizeGraphType,
    getLastOversiktProjectId,
    getLastOversiktDashboardId,
    saveLastOversiktProjectId,
    saveLastOversiktDashboardId,
} from '../utils/oversikt.ts';

const normalizePathOperator = (value: string | null): string =>
    value === 'starts-with' ? 'starts-with' : 'equals';

const normalizeDateRange = (value: string | null): string => {
    if (!value) return 'last_7_days';
    if (value === 'this-month') return 'current_month';
    if (value === 'last-month') return 'last_month';
    return value;
};

const normalizeMetricType = (value: string | null): MetricType => {
    if (value === 'pageviews' || value === 'proportion' || value === 'visits') return value;
    return 'visitors';
};

const getInitialUrlPaths = (searchParams: URLSearchParams): string[] => {
    const paths = searchParams
        .getAll('path')
        .map((path) => normalizeUrlToPath(path))
        .filter((path) => Boolean(path));
    return Array.from(new Set(paths));
};

export const useOversikt = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialPathOperator = normalizePathOperator(searchParams.get('pathOperator'));
    const initialUrlPaths = getInitialUrlPaths(searchParams);
    const initialDateRange = normalizeDateRange(searchParams.get('periode'));
    const initialMetricType = normalizeMetricType(searchParams.get('metrikk') || searchParams.get('metricType'));

    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [dashboards, setDashboards] = useState<DashboardDto[]>([]);
    const [categories, setCategories] = useState<GraphCategoryDto[]>([]);
    const [graphs, setGraphs] = useState<GraphWithQueries[]>([]);
    const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
    const [activeWebsite, setActiveWebsite] = useState<Website | null>(null);

    const [tempPathOperator, setTempPathOperator] = useState(initialPathOperator);
    const [tempUrlPaths, setTempUrlPaths] = useState<string[]>(initialUrlPaths);
    const [tempDateRange, setTempDateRange] = useState(initialDateRange);
    const [tempMetricType, setTempMetricType] = useState<MetricType>(initialMetricType);
    const [comboInputValue, setComboInputValue] = useState('');
    const isSelectingRef = useRef(false);
    const hasResolvedInitialProjectRef = useRef(false);

    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [selectedDashboardId, setSelectedDashboardId] = useState<number | null>(null);
    const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

    const [activeFilters, setActiveFilters] = useState<FilterState>({
        pathOperator: initialPathOperator,
        urlFilters: initialUrlPaths,
        dateRange: initialDateRange,
        metricType: initialMetricType,
    });

    const [loadingProjects, setLoadingProjects] = useState(false);
    const [loadingDashboards, setLoadingDashboards] = useState(false);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [loadingGraphs, setLoadingGraphs] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Derived ──

    const selectedProject = useMemo(
        () => projects.find((p) => p.id === selectedProjectId) ?? null,
        [projects, selectedProjectId],
    );
    const selectedDashboard = useMemo(
        () => dashboards.find((d) => d.id === selectedDashboardId) ?? null,
        [dashboards, selectedDashboardId],
    );

    const projectOptions = useMemo<OversiktSelectOption[]>(
        () => projects.map((p) => ({ label: p.name, value: String(p.id) })),
        [projects],
    );
    const dashboardOptions = useMemo<OversiktSelectOption[]>(
        () => dashboards.map((d) => ({ label: d.name, value: String(d.id) })),
        [dashboards],
    );

    const selectedProjectLabel = projectOptions.find((o) => o.value === String(selectedProjectId))?.label;
    const selectedDashboardLabel = dashboardOptions.find((o) => o.value === String(selectedDashboardId))?.label;
    const activeWebsiteId = activeWebsite?.id ?? '';

    const charts = useMemo<OversiktChart[]>(() => {
        return [...graphs]
            .sort((a, b) => (a.graph.ordering ?? 0) - (b.graph.ordering ?? 0))
            .filter((item) => item.queries.length > 0)
            .map((item) => {
                const primaryQuery = item.queries[0];
                return {
                    id: `graph-${item.graph.id}`,
                    title: item.graph.name,
                    type: mapGraphTypeToChart(item.graph.graphType),
                    sql: primaryQuery.sqlText,
                    width: item.graph.width && item.graph.width > 0 ? String(item.graph.width) : '50',
                    graphId: item.graph.id,
                    graphType: normalizeGraphType(item.graph.graphType),
                    queryId: primaryQuery.id,
                    queryName: primaryQuery.name,
                    categoryId: item.categoryId,
                    variants: item.queries.map((query) => ({
                        queryId: query.id,
                        queryName: query.name,
                        sql: query.sqlText,
                    })),
                };
            });
    }, [graphs]);

    const filterCapabilities = useMemo(() => {
        return charts.reduce((acc, chart) => {
            const sql = chart.sql ?? '';
            if (sql.includes('{{website_id}}')) acc.website = true;
            if (sql.includes('{{url_sti}}')) acc.url = true;
            if (sql.includes('{{created_at}}')) acc.date = true;
            return acc;
        }, { website: false, url: false, date: false });
    }, [charts]);

    const supportsStandardFilters = filterCapabilities.website || filterCapabilities.url || filterCapabilities.date;

    const hasChanges =
        tempDateRange !== activeFilters.dateRange
        || !arraysEqual(tempUrlPaths, activeFilters.urlFilters)
        || tempPathOperator !== activeFilters.pathOperator
        || tempMetricType !== activeFilters.metricType
        || (selectedWebsite?.id ?? null) !== (activeWebsite?.id ?? null);

    const isLoading = loadingProjects || loadingDashboards || loadingCategories || loadingGraphs;

    // ── Handlers ──

    const handleUpdate = useCallback(() => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('path');
        tempUrlPaths.forEach((path) => {
            if (path) nextParams.append('path', path);
        });
        if (tempPathOperator !== 'equals') nextParams.set('pathOperator', tempPathOperator);
        else nextParams.delete('pathOperator');
        if (tempDateRange && tempDateRange !== 'last_7_days') nextParams.set('periode', tempDateRange);
        else nextParams.delete('periode');
        if (tempMetricType !== 'visitors') nextParams.set('metrikk', tempMetricType);
        else nextParams.delete('metrikk');
        nextParams.delete('metricType');
        setSearchParams(nextParams);

        setActiveFilters({
            pathOperator: tempPathOperator,
            urlFilters: tempUrlPaths,
            dateRange: tempDateRange,
            metricType: tempMetricType,
        });
        setActiveWebsite(selectedWebsite);
    }, [searchParams, setSearchParams, tempPathOperator, tempUrlPaths, tempDateRange, tempMetricType, selectedWebsite]);

    const handleProjectSelected = useCallback(
        async (option: string, isSelected: boolean) => {
            if (!isSelected) {
                setSelectedProjectId(null);
                setSelectedDashboardId(null);
                return;
            }

            try {
                setError(null);
                const selectedById = projects.find((p) => String(p.id) === option);
                const selectedByName = projects.find((p) => p.name.trim().toLowerCase() === option.trim().toLowerCase());
                const selected = selectedById ?? selectedByName;

                let projectToUse = selected;
                if (!projectToUse) {
                    const trimmedName = option.trim();
                    if (!trimmedName) return;
                    setLoadingProjects(true);
                    const createdProject = await createProject(trimmedName, 'Opprettet fra Oversikt');
                    projectToUse = createdProject;
                    setProjects((prev) => [...prev, createdProject]);
                }

                setSelectedProjectId(projectToUse.id);
                setSelectedDashboardId(null);
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Klarte ikke velge eller opprette prosjekt');
            } finally {
                setLoadingProjects(false);
            }
        },
        [projects],
    );

    const handleDashboardSelected = useCallback(
        async (option: string, isSelected: boolean) => {
            if (!isSelected) {
                setSelectedDashboardId(null);
                return;
            }

            if (!selectedProjectId) {
                setError('Velg eller opprett prosjekt først');
                return;
            }

            try {
                setError(null);
                const selectedById = dashboards.find((d) => String(d.id) === option);
                const selectedByName = dashboards.find((d) => d.name.trim().toLowerCase() === option.trim().toLowerCase());
                const selected = selectedById ?? selectedByName;

                let dashboardToUse = selected;
                if (!dashboardToUse) {
                    const trimmedName = option.trim();
                    if (!trimmedName) return;
                    setLoadingDashboards(true);
                    const createdDashboard = await createDashboard(selectedProjectId, trimmedName, 'Opprettet fra Oversikt');
                    dashboardToUse = createdDashboard;
                    setDashboards((prev) => [...prev, createdDashboard]);
                }

                setSelectedDashboardId(dashboardToUse.id);
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Klarte ikke velge eller opprette dashboard');
            } finally {
                setLoadingDashboards(false);
            }
        },
        [dashboards, selectedProjectId],
    );

    const handleUrlToggleSelected = useCallback(
        (option: string, isSelected: boolean) => {
            isSelectingRef.current = true;
            setComboInputValue('');

            if (isSelected) {
                let normalized = normalizeUrlToPath(option);
                if (normalized && !normalized.startsWith('/')) normalized = `/${normalized}`;
                setTempUrlPaths((prev) => {
                    if (!normalized || prev.includes(normalized)) return prev;
                    return [...prev, normalized];
                });
            } else {
                let normalized = normalizeUrlToPath(option);
                if (normalized && !normalized.startsWith('/')) normalized = `/${normalized}`;
                setTempUrlPaths((prev) => prev.filter((p) => p !== option && p !== normalized));
            }

            setTimeout(() => {
                isSelectingRef.current = false;
            }, 100);
        },
        [],
    );

    const handleComboChange = useCallback(
        (value: string) => {
            if (isSelectingRef.current) return;
            setComboInputValue(value);
        },
        [],
    );


    // ── Effects ──

    useEffect(() => {
        const run = async () => {
            setLoadingProjects(true);
            setError(null);
            try {
                const projectItems = await fetchProjects();
                setProjects(projectItems);

                const fromUrl = parseId(searchParams.get('projectId'));
                const fromStorage = fromUrl ? null : getLastOversiktProjectId();
                const fromState = selectedProjectId;
                const preferredId = fromState ?? fromUrl ?? fromStorage;

                const nextProject =
                    (preferredId ? projectItems.find((item) => item.id === preferredId) : null)
                    ?? projectItems[0]
                    ?? null;

                setSelectedProjectId(nextProject?.id ?? null);
                hasResolvedInitialProjectRef.current = true;
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Klarte ikke laste prosjekter');
                hasResolvedInitialProjectRef.current = true;
            } finally {
                setLoadingProjects(false);
            }
        };

        void run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refreshDashboards = useCallback(async (projectId: number | null, preferredDashboardId?: number | null) => {
        if (!projectId) {
            setDashboards([]);
            setCategories([]);
            setSelectedDashboardId(null);
            setActiveCategoryId(null);
            setGraphs([]);
            return;
        }

        setLoadingDashboards(true);
        setError(null);
        try {
            const dashboardItems = await fetchDashboards(projectId);
            setDashboards(dashboardItems);

            const fromUrlProjectId = parseId(searchParams.get('projectId'));
            const fromUrlDashboardId = parseId(searchParams.get('dashboardId'));
            const fromStorage = fromUrlDashboardId ? null : getLastOversiktDashboardId();
            const fromState = preferredDashboardId ?? selectedDashboardId;
            const fromMatchingUrl = fromUrlProjectId === projectId ? fromUrlDashboardId : null;

            const resolvedPreferredDashboardId =
                fromMatchingUrl ?? fromState ?? fromStorage;

            const nextDashboard =
                (resolvedPreferredDashboardId ? dashboardItems.find((item) => item.id === resolvedPreferredDashboardId) : null)
                ?? dashboardItems[0]
                ?? null;

            setSelectedDashboardId(nextDashboard?.id ?? null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Klarte ikke laste dashboards');
        } finally {
            setLoadingDashboards(false);
        }
    }, [searchParams, selectedDashboardId]);

    useEffect(() => {
        void refreshDashboards(selectedProjectId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjectId]);

    const refreshCategories = useCallback(async (preferredCategoryId?: number | null) => {
        if (!selectedProjectId || !selectedDashboardId) {
            setCategories([]);
            setActiveCategoryId(null);
            setGraphs([]);
            return { categories: [] as GraphCategoryDto[], activeCategoryId: null as number | null };
        }

        setLoadingCategories(true);
        setError(null);
        try {
            const categoryItems = await fetchCategories(selectedProjectId, selectedDashboardId);
            const sortedCategories = [...categoryItems].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0));
            setCategories(sortedCategories);
            const fromUrlCategoryId = parseId(searchParams.get('categoryId'));

            const nextActiveCategoryId =
                (preferredCategoryId && sortedCategories.some((category) => category.id === preferredCategoryId)
                    ? preferredCategoryId
                    : null)
                ?? (fromUrlCategoryId && sortedCategories.some((category) => category.id === fromUrlCategoryId)
                    ? fromUrlCategoryId
                    : null)
                ?? (activeCategoryId && sortedCategories.some((category) => category.id === activeCategoryId)
                    ? activeCategoryId
                    : null)
                ?? sortedCategories[0]?.id
                ?? null;

            setActiveCategoryId(nextActiveCategoryId);
            if (!nextActiveCategoryId) {
                setGraphs([]);
            }

            return { categories: sortedCategories, activeCategoryId: nextActiveCategoryId };
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Klarte ikke laste faner');
            setCategories([]);
            setActiveCategoryId(null);
            setGraphs([]);
            return { categories: [] as GraphCategoryDto[], activeCategoryId: null as number | null };
        } finally {
            setLoadingCategories(false);
        }
    }, [selectedProjectId, selectedDashboardId, activeCategoryId, searchParams]);

    const refreshGraphs = useCallback(async (categoryIdOverride?: number | null) => {
        const categoryIdToLoad = categoryIdOverride ?? activeCategoryId;
        if (!selectedProjectId || !selectedDashboardId || !categoryIdToLoad) {
            setGraphs([]);
            return;
        }

        setLoadingGraphs(true);
        setError(null);
        try {
            const graphItems = await fetchGraphs(selectedProjectId, selectedDashboardId, categoryIdToLoad);
            const graphsWithQueries = await Promise.all(
                graphItems.map(async (graph) => {
                    const queryItems = await fetchQueries(selectedProjectId, selectedDashboardId, categoryIdToLoad, graph.id);
                    const sortedQueries = [...queryItems].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0));
                    return {
                        graph,
                        queries: sortedQueries,
                        categoryId: categoryIdToLoad,
                    };
                }),
            );
            setGraphs(graphsWithQueries);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Klarte ikke laste grafer');
        } finally {
            setLoadingGraphs(false);
        }
    }, [selectedProjectId, selectedDashboardId, activeCategoryId]);

    useEffect(() => {
        if (!selectedProjectId || !selectedDashboardId) {
            setCategories([]);
            setActiveCategoryId(null);
            setGraphs([]);
            return;
        }

        setCategories([]);
        setActiveCategoryId(null);
        setGraphs([]);
        const preferredCategoryId = parseId(searchParams.get('categoryId'));
        void refreshCategories(preferredCategoryId);
        // Intentionally only run when dashboard changes, not when active tab changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjectId, selectedDashboardId]);

    useEffect(() => {
        void refreshGraphs();
    }, [refreshGraphs]);

    const handleReorderCharts = useCallback(
        async (fromIndex: number, toIndex: number) => {
            if (!selectedProjectId || !selectedDashboardId) return false;
            if (fromIndex === toIndex) return true;
            if (fromIndex < 0 || toIndex < 0 || fromIndex >= charts.length || toIndex >= charts.length) return false;

            // Compute reordered list from current charts
            const reordered = [...charts];
            const [moved] = reordered.splice(fromIndex, 1);
            if (!moved) return false;
            reordered.splice(toIndex, 0, moved);

            const ordering = reordered.map((chart, index) => ({
                id: chart.graphId,
                ordering: index,
            }));

            // Optimistically update local graph ordering
            setGraphs((prev) => {
                const orderMap = new Map(ordering.map((entry) => [entry.id, entry.ordering]));
                return prev.map((item) => ({
                    ...item,
                    graph: {
                        ...item.graph,
                        ordering: orderMap.get(item.graph.id) ?? item.graph.ordering,
                    },
                }));
            });

            try {
                // Use the categoryId from the moved chart
                await updateGraphOrdering(selectedProjectId, selectedDashboardId, moved.categoryId, ordering);
                return true;
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Kunne ikke oppdatere rekkefølge');
                // Revert by re-fetching
                await refreshGraphs();
                return false;
            }
        },
        [selectedProjectId, selectedDashboardId, charts, refreshGraphs],
    );

    useEffect(() => {
        if (!hasResolvedInitialProjectRef.current) return;
        if (loadingProjects || loadingDashboards || loadingCategories) return;

        const currentProjectId = searchParams.get('projectId');
        const currentDashboardId = searchParams.get('dashboardId');
        const currentCategoryId = searchParams.get('categoryId');

        // Preserve deep-link params while state is still resolving during initial/load transitions.
        if (currentProjectId && !selectedProjectId) return;
        if (currentDashboardId && !selectedDashboardId) return;

        const nextProjectId = selectedProjectId ? String(selectedProjectId) : null;
        const nextDashboardId = selectedDashboardId ? String(selectedDashboardId) : null;
        if (selectedDashboardId && !activeCategoryId && currentCategoryId) return;
        const nextCategoryId = selectedDashboardId && activeCategoryId ? String(activeCategoryId) : null;

        if (currentProjectId === nextProjectId && currentDashboardId === nextDashboardId && currentCategoryId === nextCategoryId) return;

        const nextParams = new URLSearchParams(searchParams);
        if (nextProjectId) nextParams.set('projectId', nextProjectId);
        else nextParams.delete('projectId');
        if (nextDashboardId) nextParams.set('dashboardId', nextDashboardId);
        else nextParams.delete('dashboardId');
        if (nextCategoryId) nextParams.set('categoryId', nextCategoryId);
        else nextParams.delete('categoryId');

        setSearchParams(nextParams, { replace: true });
    }, [searchParams, selectedProjectId, selectedDashboardId, activeCategoryId, setSearchParams, loadingProjects, loadingDashboards, loadingCategories]);

    useEffect(() => {
        if (!selectedWebsite) return;
        setActiveWebsite(selectedWebsite);
    }, [selectedWebsite]);

    useEffect(() => {
        saveLastOversiktProjectId(selectedProjectId);
    }, [selectedProjectId]);

    useEffect(() => {
        saveLastOversiktDashboardId(selectedDashboardId);
    }, [selectedDashboardId]);

    return {
        // Selections & options
        selectedProject,
        selectedDashboard,
        selectedProjectId,
        selectedDashboardId,
        setSelectedProjectId,
        setSelectedDashboardId,
        projects,
        projectOptions,
        dashboardOptions,
        selectedProjectLabel,
        selectedDashboardLabel,

        // Tabs / categories
        categories,
        activeCategoryId,
        setActiveCategoryId,
        refreshCategories,

        // Website
        selectedWebsite,
        setSelectedWebsite,
        activeWebsite,
        activeWebsiteId,

        // Temp filter fields
        tempPathOperator,
        setTempPathOperator,
        tempUrlPaths,
        tempDateRange,
        setTempDateRange,
        tempMetricType,
        setTempMetricType,
        comboInputValue,

        // Active filters
        activeFilters,

        // Derived
        charts,
        filterCapabilities,
        supportsStandardFilters,
        hasChanges,
        isLoading,
        loadingProjects,
        loadingDashboards,
        error,

        // Handlers
        handleUpdate,
        handleProjectSelected,
        handleDashboardSelected,
        handleUrlToggleSelected,
        handleComboChange,
        handleReorderCharts,
        refreshGraphs,
        refreshDashboards,
    };
};
