import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { ArrowLeftIcon } from '@navikt/aksel-icons';
import { ActionMenu, Alert, Button, Label, Link, Loader, Modal, ReadMore, Select, Tabs, TextField, Textarea, UNSAFE_Combobox } from '@navikt/ds-react';
import DashboardLayout from '../../dashboard/ui/DashboardLayout.tsx';
import DashboardWebsitePicker from '../../dashboard/ui/DashboardWebsitePicker.tsx';
import { DashboardWidget } from '../../dashboard';
import { getSpanClass } from '../../dashboard';
import { useOversikt } from '../hooks/useOversikt.ts';
import type { DashboardDto, GraphType, OversiktChart } from '../model/types.ts';
import {
    createGraph,
    createQuery,
    createCategory,
    deleteCategory,
    deleteDashboard,
    deleteGraph,
    deleteQuery,
    fetchCategories,
    fetchDashboards,
    fetchGraphs,
    fetchQueries,
    updateDashboard,
    updateCategoryOrdering,
    updateCategory,
    updateGraph,
    updateQueryOrdering,
    updateQuery,
} from '../api/oversiktApi.ts';
import EditChartDialog from './dialogs/EditChartDialog.tsx';
import DeleteChartDialog from './dialogs/DeleteChartDialog.tsx';
import EditDashboardDialog from './dialogs/EditDashboardDialog.tsx';
import DeleteDashboardDialog from './dialogs/DeleteDashboardDialog.tsx';
import CopyChartDialog from './dialogs/CopyChartDialog.tsx';
import ImportChartDialog from './dialogs/ImportChartDialog.tsx';
import { applyWebsiteIdOnly, extractWebsiteId, replaceHardcodedWebsiteId } from '../../sql/utils/sqlProcessing.ts';

const parseChartWidth = (width?: string): number | undefined => {
    const parsed = Number(width);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.round(parsed);
};

const rewriteSqlWebsiteId = (sql: string, targetWebsiteId?: string): string => {
    if (!targetWebsiteId) return sql;
    const withPlaceholderApplied = applyWebsiteIdOnly(sql, targetWebsiteId);
    return replaceHardcodedWebsiteId(withPlaceholderApplied, targetWebsiteId);
};

const getCategoryDisplayName = (name?: string): string => {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return 'Fane 1';
    if (trimmed.toLowerCase() === 'general') return 'Fane 1';
    return trimmed;
};

const getVariantDisplayName = (name?: string, index = 0): string => {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return `Variant ${index + 1}`;
    if (trimmed.toLowerCase() === 'query') return `Variant ${index + 1}`;
    if (/\s-\squery$/i.test(trimmed)) return `Variant ${index + 1}`;
    return trimmed;
};

type CopySuccessState = {
    projectId: number;
    projectName: string;
    dashboardId: number;
    dashboardName: string;
    chartName: string;
};
const DASHBOARD_MOVE_SUCCESS_FLASH_KEY = 'oversikt:dashboardMoveSuccessMessage';

const Oversikt = () => {
    const {
        selectedDashboard,
        selectedProjectId, selectedDashboardId,
        setSelectedProjectId, setSelectedDashboardId,
        projects,
        categories,
        activeCategoryId,
        setActiveCategoryId,
        selectedWebsite, setSelectedWebsite,
        activeWebsite, activeWebsiteId,
        tempPathOperator, setTempPathOperator,
        tempUrlPaths,
        tempDateRange, setTempDateRange,
        tempMetricType, setTempMetricType,
        comboInputValue,
        activeFilters,
        charts, hasChanges,
        isLoading, error,
        handleUpdate,
        handleUrlToggleSelected, handleComboChange,
        handleReorderCharts,
        refreshCategories, refreshGraphs, refreshDashboards,
    } = useOversikt();
    const [editChart, setEditChart] = useState<OversiktChart | null>(null);
    const [deleteChartTarget, setDeleteChartTarget] = useState<OversiktChart | null>(null);
    const [moveChartTarget, setMoveChartTarget] = useState<OversiktChart | null>(null);
    const [moveTargetCategoryId, setMoveTargetCategoryId] = useState<string>('');
    const [mutationError, setMutationError] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deletingChart, setDeletingChart] = useState(false);
    const [movingChart, setMovingChart] = useState(false);
    const [dashboardMutationError, setDashboardMutationError] = useState<string | null>(null);
    const [editDashboardTarget, setEditDashboardTarget] = useState<DashboardDto | null>(null);
    const [deleteDashboardTarget, setDeleteDashboardTarget] = useState<DashboardDto | null>(null);
    const [moveDashboardTarget, setMoveDashboardTarget] = useState<DashboardDto | null>(null);
    const [isMoveDashboardModalOpen, setIsMoveDashboardModalOpen] = useState(false);
    const [moveDashboardTargetProjectId, setMoveDashboardTargetProjectId] = useState<number>(0);
    const [moveDashboardError, setMoveDashboardError] = useState<string | null>(null);
    const [dashboardMoveSuccessMessage, setDashboardMoveSuccessMessage] = useState<string | null>(null);
    const [savingDashboard, setSavingDashboard] = useState(false);
    const [deletingDashboard, setDeletingDashboard] = useState(false);
    const [movingDashboard, setMovingDashboard] = useState(false);
    const [copyChartTarget, setCopyChartTarget] = useState<{ chart: OversiktChart; sourceWebsiteId?: string } | null>(null);
    const [copyMutationError, setCopyMutationError] = useState<string | null>(null);
    const [copyingChart, setCopyingChart] = useState(false);
    const [copySuccess, setCopySuccess] = useState<CopySuccessState | null>(null);
    const [reorderingGraphId, setReorderingGraphId] = useState<number | null>(null);
    const [grabbedGraphId, setGrabbedGraphId] = useState<number | null>(null);
    const [draggedGraphId, setDraggedGraphId] = useState<number | null>(null);
    const [dropTargetGraphId, setDropTargetGraphId] = useState<number | null>(null);
    const [reorderingCategoryId, setReorderingCategoryId] = useState<number | null>(null);
    const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
    const [dropTargetCategoryId, setDropTargetCategoryId] = useState<number | null>(null);
    const [reorderingVariantGraphId, setReorderingVariantGraphId] = useState<number | null>(null);
    const [draggedVariant, setDraggedVariant] = useState<{ graphId: number; queryId: number } | null>(null);
    const [dropTargetVariant, setDropTargetVariant] = useState<{ graphId: number; queryId: number } | null>(null);
    const [reorderAnnouncement, setReorderAnnouncement] = useState('');
    const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
    const [stats, setStats] = useState<Record<string, { gb: number; title: string }>>({});
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importingChart, setImportingChart] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [isAddTextModalOpen, setIsAddTextModalOpen] = useState(false);
    const [textTitle, setTextTitle] = useState('');
    const [textMarkdown, setTextMarkdown] = useState('');
    const [textWidth, setTextWidth] = useState('100');
    const [addingText, setAddingText] = useState(false);
    const [textError, setTextError] = useState<string | null>(null);
    const [editTextChart, setEditTextChart] = useState<OversiktChart | null>(null);
    const [editTextName, setEditTextName] = useState('');
    const [editTextMarkdown, setEditTextMarkdown] = useState('');
    const [editTextWidth, setEditTextWidth] = useState('100');
    const [savingEditText, setSavingEditText] = useState(false);
    const [editTextError, setEditTextError] = useState<string | null>(null);
    const [isCreateTabModalOpen, setIsCreateTabModalOpen] = useState(false);
    const [isRenameTabModalOpen, setIsRenameTabModalOpen] = useState(false);
    const [newTabName, setNewTabName] = useState('');
    const [renameTabName, setRenameTabName] = useState('');
    const [categoryMutationError, setCategoryMutationError] = useState<string | null>(null);
    const [savingCategory, setSavingCategory] = useState(false);
    const [deletingCategory, setDeletingCategory] = useState(false);
    const [selectedVariantByGraphId, setSelectedVariantByGraphId] = useState<Record<number, number>>({});
    const chartRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const chartPositionsRef = useRef<Map<number, DOMRect>>(new Map());
    const totalGb = Object.values(stats).reduce((acc, curr) => acc + curr.gb, 0);
    const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null;
    const hasMultipleTabs = categories.length > 1;

    useEffect(() => {
        setStats({});
    }, [selectedDashboardId, activeWebsiteId, activeFilters]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!selectedProjectId) return;
        window.localStorage.setItem('projectmanager:lastSelectedProjectId', String(selectedProjectId));
    }, [selectedProjectId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const flash = window.sessionStorage.getItem(DASHBOARD_MOVE_SUCCESS_FLASH_KEY);
        if (!flash) return;
        setDashboardMoveSuccessMessage(flash);
        window.sessionStorage.removeItem(DASHBOARD_MOVE_SUCCESS_FLASH_KEY);
    }, []);

    useEffect(() => {
        const chartIds = new Set(charts.filter((chart) => chart.graphType !== 'TEXT').map((chart) => chart.id));
        setStats((prev) => {
            const nextEntries = Object.entries(prev).filter(([id]) => chartIds.has(id));
            if (nextEntries.length === Object.keys(prev).length) return prev;
            return Object.fromEntries(nextEntries);
        });
    }, [charts]);

    useEffect(() => {
        setSelectedVariantByGraphId((prev) => {
            let changed = false;
            const next: Record<number, number> = {};

            for (const chart of charts) {
                const variants = chart.variants ?? [];
                const selectedQueryId = prev[chart.graphId];
                const resolved =
                    (selectedQueryId && variants.some((variant) => variant.queryId === selectedQueryId)
                        ? selectedQueryId
                        : chart.queryId);

                next[chart.graphId] = resolved;
                if (prev[chart.graphId] !== resolved) changed = true;
            }

            if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev;
            return next;
        });
    }, [charts]);

    const getChartWithSelectedVariant = (chart: OversiktChart): OversiktChart => {
        const variants = chart.variants ?? [];
        if (variants.length <= 1) return chart;

        const selectedQueryId = selectedVariantByGraphId[chart.graphId];
        const selectedVariant =
            variants.find((variant) => variant.queryId === selectedQueryId)
            ?? variants[0];

        if (!selectedVariant) return chart;

        return {
            ...chart,
            sql: selectedVariant.sql,
            queryId: selectedVariant.queryId,
            queryName: selectedVariant.queryName,
        };
    };

    const visibleFilterCapabilities = useMemo(() => {
        return charts.reduce((acc, chart) => {
            const activeChart = getChartWithSelectedVariant(chart);
            const sql = activeChart.sql ?? '';
            if (sql.includes('{{website_id}}')) acc.website = true;
            if (sql.includes('{{url_sti}}')) acc.url = true;
            if (sql.includes('{{created_at}}')) acc.date = true;
            return acc;
        }, { website: false, url: false, date: false });
    }, [charts, selectedVariantByGraphId]);

    const supportsVisibleStandardFilters =
        visibleFilterCapabilities.website || visibleFilterCapabilities.url || visibleFilterCapabilities.date;

    useLayoutEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            const currentPositions = new Map<number, DOMRect>();
            chartRefs.current.forEach((element, graphId) => {
                currentPositions.set(graphId, element.getBoundingClientRect());
            });
            chartPositionsRef.current = currentPositions;
            return;
        }

        const currentPositions = new Map<number, DOMRect>();
        chartRefs.current.forEach((element, graphId) => {
            currentPositions.set(graphId, element.getBoundingClientRect());
        });

        currentPositions.forEach((newRect, graphId) => {
            const element = chartRefs.current.get(graphId);
            const oldRect = chartPositionsRef.current.get(graphId);
            if (!element || !oldRect) return;

            const deltaX = oldRect.left - newRect.left;
            const deltaY = oldRect.top - newRect.top;
            if (deltaX === 0 && deltaY === 0) return;

            element.style.transition = 'none';
            element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            requestAnimationFrame(() => {
                element.style.transition = 'transform 220ms ease';
                element.style.transform = '';
            });
        });

        chartPositionsRef.current = currentPositions;
    }, [charts]);

    const openEditDialog = (chartId?: string) => {
        if (!chartId) return;
        const baseChart = charts.find((item) => item.id === chartId) ?? null;
        const chart = baseChart ? getChartWithSelectedVariant(baseChart) : null;
        if (!chart) return;
        if (chart.graphType === 'TEXT') {
            setEditTextError(null);
            setEditTextChart(chart);
            setEditTextName(chart.title || '');
            setEditTextMarkdown(chart.description ?? '');
            setEditTextWidth(chart.width ? String(chart.width) : '100');
            return;
        }
        setMutationError(null);
        setEditChart(chart);
    };

    const openDeleteDialog = (chartId?: string) => {
        if (!chartId) return;
        const baseChart = charts.find((item) => item.id === chartId) ?? null;
        const chart = baseChart ? getChartWithSelectedVariant(baseChart) : null;
        if (!chart) return;
        setMutationError(null);
        setDeleteChartTarget(chart);
    };

    const openCopyDialog = (chartId?: string, sourceWebsiteId?: string) => {
        if (!chartId) return;
        const baseChart = charts.find((item) => item.id === chartId) ?? null;
        const chart = baseChart ? getChartWithSelectedVariant(baseChart) : null;
        if (!chart) return;
        const resolvedSourceWebsiteId =
            sourceWebsiteId
            || (chart.sql ? extractWebsiteId(chart.sql) : undefined)
            || (activeWebsiteId || undefined);
        setCopyMutationError(null);
        setCopyChartTarget({ chart, sourceWebsiteId: resolvedSourceWebsiteId });
    };

    const openMoveDialog = (chartId?: string) => {
        if (!chartId) return;
        const baseChart = charts.find((item) => item.id === chartId) ?? null;
        const chart = baseChart ? getChartWithSelectedVariant(baseChart) : null;
        if (!chart) return;
        setMutationError(null);
        setMoveChartTarget(chart);
        const defaultTarget = categories.find((category) => category.id !== chart.categoryId);
        setMoveTargetCategoryId(defaultTarget ? String(defaultTarget.id) : '');
    };

    const handleSaveChart = async (params: {
        name: string;
        graphType: GraphType;
        sqlText: string;
        width: number;
        websiteId?: string;
        addAsVariant?: boolean;
        variantName?: string;
        newVariants?: Array<{ name: string; sqlText: string }>;
        targetQueryId?: number;
        targetQueryName?: string;
    }) => {
        if (!editChart || !selectedProjectId || !selectedDashboardId) return;
        setSavingEdit(true);
        setMutationError(null);
        try {
            const sqlForSave = rewriteSqlWebsiteId(params.sqlText, params.websiteId);
            await updateGraph(selectedProjectId, selectedDashboardId, editChart.categoryId, editChart.graphId, {
                name: params.name,
                graphType: params.graphType,
                width: params.width,
            });
            const hasTargetQuery = typeof params.targetQueryId === 'number' && params.targetQueryId > 0;
            const pendingNewVariants = (params.newVariants ?? [])
                .map((variant) => ({
                    name: variant.name.trim(),
                    sqlText: variant.sqlText.trim(),
                }))
                .filter((variant) => variant.name && variant.sqlText);

            if (hasTargetQuery) {
                await updateQuery(
                    selectedProjectId,
                    selectedDashboardId,
                    editChart.categoryId,
                    editChart.graphId,
                    params.targetQueryId as number,
                    {
                        name: params.targetQueryName ?? editChart.queryName,
                        sqlText: sqlForSave,
                    },
                );
            } else if (params.addAsVariant && pendingNewVariants.length === 0) {
                await createQuery(selectedProjectId, selectedDashboardId, editChart.categoryId, editChart.graphId, {
                    name: params.variantName?.trim() || `${params.name} - variant`,
                    sqlText: sqlForSave,
                });
            }

            for (const variant of pendingNewVariants) {
                await createQuery(selectedProjectId, selectedDashboardId, editChart.categoryId, editChart.graphId, {
                    name: variant.name,
                    sqlText: rewriteSqlWebsiteId(variant.sqlText, params.websiteId),
                });
            }
            await refreshGraphs(editChart.categoryId);
            setEditChart(null);
        } catch (err: unknown) {
            setMutationError(err instanceof Error ? err.message : 'Kunne ikke oppdatere graf');
        } finally {
            setSavingEdit(false);
        }
    };

    const handleRenameChartVariant = async (params: { queryId: number; name: string }) => {
        if (!editChart || !selectedProjectId || !selectedDashboardId) throw new Error('Ingen graf valgt');
        const activeVariant = (editChart.variants ?? []).find((variant) => variant.queryId === params.queryId);
        if (!activeVariant) throw new Error('Fant ikke variant');

        setSavingEdit(true);
        setMutationError(null);
        try {
            await updateQuery(
                selectedProjectId,
                selectedDashboardId,
                editChart.categoryId,
                editChart.graphId,
                params.queryId,
                {
                    name: params.name.trim(),
                    sqlText: activeVariant.sql,
                },
            );
            setEditChart((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    queryName: prev.queryId === params.queryId ? params.name.trim() : prev.queryName,
                    variants: (prev.variants ?? []).map((variant, index) => (
                        variant.queryId === params.queryId
                            ? { ...variant, queryName: params.name.trim() || `Variant ${index + 1}` }
                            : variant
                    )),
                };
            });
            await refreshGraphs(editChart.categoryId);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Kunne ikke endre navn på variant';
            setMutationError(message);
            throw (err instanceof Error ? err : new Error(message));
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDeleteChartVariant = async (params: { queryId: number }) => {
        if (!editChart || !selectedProjectId || !selectedDashboardId) throw new Error('Ingen graf valgt');
        const variants = editChart.variants ?? [];
        if (variants.length <= 1) throw new Error('Du kan ikke slette siste variant');

        setSavingEdit(true);
        setMutationError(null);
        try {
            await deleteQuery(
                selectedProjectId,
                selectedDashboardId,
                editChart.categoryId,
                editChart.graphId,
                params.queryId,
            );

            const nextVariants = variants.filter((variant) => variant.queryId !== params.queryId);
            const fallbackVariant = nextVariants[0] ?? null;
            setEditChart((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    queryId: fallbackVariant?.queryId ?? prev.queryId,
                    queryName: fallbackVariant?.queryName ?? prev.queryName,
                    sql: fallbackVariant?.sql ?? prev.sql,
                    variants: nextVariants,
                };
            });

            await refreshGraphs(editChart.categoryId);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Kunne ikke slette variant';
            setMutationError(message);
            throw (err instanceof Error ? err : new Error(message));
        } finally {
            setSavingEdit(false);
        }
    };

    const handleReorderChartVariants = async (params: { queryIds: number[] }) => {
        if (!editChart || !selectedProjectId || !selectedDashboardId) throw new Error('Ingen graf valgt');
        const queryIds = params.queryIds;
        if (queryIds.length <= 1) return;

        const previousVariants = editChart.variants ?? [];
        const orderMap = new Map(queryIds.map((queryId, index) => [queryId, index]));
        const reorderedVariants = [...previousVariants].sort((a, b) => {
            const orderA = orderMap.get(a.queryId) ?? Number.MAX_SAFE_INTEGER;
            const orderB = orderMap.get(b.queryId) ?? Number.MAX_SAFE_INTEGER;
            return orderA - orderB;
        });

        setEditChart((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                variants: reorderedVariants,
            };
        });

        setSavingEdit(true);
        setMutationError(null);
        try {
            await updateQueryOrdering(
                selectedProjectId,
                selectedDashboardId,
                editChart.categoryId,
                editChart.graphId,
                queryIds.map((id, index) => ({ id, ordering: index })),
            );
            await refreshGraphs(editChart.categoryId);
        } catch (err) {
            setEditChart((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    variants: previousVariants,
                };
            });
            const message = err instanceof Error ? err.message : 'Kunne ikke endre rekkefølge på varianter';
            setMutationError(message);
            throw (err instanceof Error ? err : new Error(message));
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDeleteChart = async () => {
        if (!deleteChartTarget || !selectedProjectId || !selectedDashboardId) return;
        setDeletingChart(true);
        setMutationError(null);
        try {
            await deleteGraph(selectedProjectId, selectedDashboardId, deleteChartTarget.categoryId, deleteChartTarget.graphId);
            await refreshGraphs(deleteChartTarget.categoryId);
            setDeleteChartTarget(null);
        } catch (err: unknown) {
            setMutationError(err instanceof Error ? err.message : 'Kunne ikke slette graf');
        } finally {
            setDeletingChart(false);
        }
    };

    const handleMoveChartToTab = async () => {
        if (!moveChartTarget || !selectedProjectId || !selectedDashboardId) return;
        const targetCategoryId = Number(moveTargetCategoryId);
        if (!Number.isFinite(targetCategoryId)) {
            setMutationError('Velg en fane');
            return;
        }
        if (targetCategoryId === moveChartTarget.categoryId) {
            setMutationError('Grafen er allerede i denne fanen');
            return;
        }

        setMovingChart(true);
        setMutationError(null);
        try {
            const targetGraphs = await fetchGraphs(selectedProjectId, selectedDashboardId, targetCategoryId);
            const targetName = moveChartTarget.title.trim();
            if (!targetName) {
                setMutationError('Grafnavn mangler og grafen kan ikke flyttes');
                setMovingChart(false);
                return;
            }

            const existingTarget = targetGraphs.find(
                (graph) => graph.name.trim().toLowerCase() === targetName.toLowerCase(),
            );

            const width = parseChartWidth(moveChartTarget.width);
            if (existingTarget) {
                await updateGraph(selectedProjectId, selectedDashboardId, targetCategoryId, existingTarget.id, {
                    name: targetName,
                    graphType: moveChartTarget.graphType,
                    width,
                });

                const existingQueries = await fetchQueries(selectedProjectId, selectedDashboardId, targetCategoryId, existingTarget.id);
                const firstQuery = existingQueries[0];
                if (firstQuery) {
                    await updateQuery(selectedProjectId, selectedDashboardId, targetCategoryId, existingTarget.id, firstQuery.id, {
                        name: moveChartTarget.queryName,
                        sqlText: moveChartTarget.sql ?? '',
                    });
                } else {
                    await createQuery(selectedProjectId, selectedDashboardId, targetCategoryId, existingTarget.id, {
                        name: moveChartTarget.queryName,
                        sqlText: moveChartTarget.sql ?? '',
                    });
                }
            } else {
                const createdGraph = await createGraph(selectedProjectId, selectedDashboardId, targetCategoryId, {
                    name: targetName,
                    graphType: moveChartTarget.graphType,
                    width,
                });
                await createQuery(selectedProjectId, selectedDashboardId, targetCategoryId, createdGraph.id, {
                    name: moveChartTarget.queryName,
                    sqlText: moveChartTarget.sql ?? '',
                });
            }

            await deleteGraph(selectedProjectId, selectedDashboardId, moveChartTarget.categoryId, moveChartTarget.graphId);
            await refreshCategories(activeCategoryId ?? moveChartTarget.categoryId);
            await refreshGraphs(moveChartTarget.categoryId);
            setMoveChartTarget(null);
        } catch (err: unknown) {
            setMutationError(err instanceof Error ? err.message : 'Kunne ikke flytte graf til valgt fane');
        } finally {
            setMovingChart(false);
        }
    };

    const handleCopyChart = async (params: {
        projectId: number;
        projectName: string;
        dashboardId: number;
        dashboardName: string;
        categoryId?: number;
        chartName: string;
        websiteId?: string;
    }) => {
        if (!copyChartTarget) return;
        if (!params.chartName.trim()) {
            setCopyMutationError('Grafnavn er påkrevd');
            return;
        }

        const sourceVariants = (copyChartTarget.chart.variants ?? [])
            .map((variant, index) => {
                const sqlText = variant.sql?.trim() ?? '';
                if (!sqlText) return null;
                return {
                    name: variant.queryName?.trim() || `${params.chartName.trim()} - query ${index + 1}`,
                    sqlText: rewriteSqlWebsiteId(sqlText, params.websiteId),
                };
            })
            .filter((variant): variant is { name: string; sqlText: string } => Boolean(variant));

        if (sourceVariants.length === 0) {
            const sqlText = copyChartTarget.chart.sql?.trim() ?? '';
            if (!sqlText) {
                setCopyMutationError('Grafen mangler SQL og kan ikke kopieres');
                return;
            }
            sourceVariants.push({
                name: copyChartTarget.chart.queryName,
                sqlText: rewriteSqlWebsiteId(sqlText, params.websiteId),
            });
        }

        setCopyingChart(true);
        setCopyMutationError(null);
        try {
            // Resolve target category (use first existing or create default)
            let targetCategoryId: number;
            const targetCategories = await fetchCategories(params.projectId, params.dashboardId);
            const isSameDashboard =
                selectedProjectId === params.projectId && selectedDashboardId === params.dashboardId;
            const preferredSameDashboardCategoryId = isSameDashboard ? activeCategoryId : null;

            if (params.categoryId && targetCategories.some((category) => category.id === params.categoryId)) {
                targetCategoryId = params.categoryId;
            } else if (preferredSameDashboardCategoryId && targetCategories.some((category) => category.id === preferredSameDashboardCategoryId)) {
                targetCategoryId = preferredSameDashboardCategoryId;
            } else if (targetCategories.length > 0) {
                targetCategoryId = targetCategories[0].id;
            } else {
                const created = await createCategory(params.projectId, params.dashboardId, 'Fane 1');
                targetCategoryId = created.id;
            }

            const graphItems = await fetchGraphs(params.projectId, params.dashboardId, targetCategoryId);
            const sourceName = params.chartName.trim();
            const sourceNameLower = sourceName.toLowerCase();
            const existingGraph = graphItems.find((graph) => {
                if (isSameDashboard && graph.id === copyChartTarget.chart.graphId) return false;
                return graph.name.trim().toLowerCase() === sourceNameLower;
            });

            const width = parseChartWidth(copyChartTarget.chart.width);
            if (existingGraph) {
                await updateGraph(params.projectId, params.dashboardId, targetCategoryId, existingGraph.id, {
                    name: sourceName,
                    graphType: copyChartTarget.chart.graphType,
                    width,
                });

                const existingQueries = await fetchQueries(params.projectId, params.dashboardId, targetCategoryId, existingGraph.id);
                for (let index = 0; index < sourceVariants.length; index += 1) {
                    const sourceVariant = sourceVariants[index];
                    const existingQuery = existingQueries[index];
                    if (existingQuery) {
                        await updateQuery(params.projectId, params.dashboardId, targetCategoryId, existingGraph.id, existingQuery.id, {
                            name: sourceVariant.name,
                            sqlText: sourceVariant.sqlText,
                        });
                    } else {
                        await createQuery(params.projectId, params.dashboardId, targetCategoryId, existingGraph.id, {
                            name: sourceVariant.name,
                            sqlText: sourceVariant.sqlText,
                        });
                    }
                }
            } else {
                const createdGraph = await createGraph(params.projectId, params.dashboardId, targetCategoryId, {
                    name: sourceName,
                    graphType: copyChartTarget.chart.graphType,
                    width,
                });

                for (const sourceVariant of sourceVariants) {
                    await createQuery(params.projectId, params.dashboardId, targetCategoryId, createdGraph.id, {
                        name: sourceVariant.name,
                        sqlText: sourceVariant.sqlText,
                    });
                }
            }

            if (isSameDashboard) {
                await refreshCategories(targetCategoryId);
                await refreshGraphs(targetCategoryId);
            }

            setCopyChartTarget(null);
            setCopySuccess({
                projectId: params.projectId,
                projectName: params.projectName,
                dashboardId: params.dashboardId,
                dashboardName: params.dashboardName,
                chartName: params.chartName.trim(),
            });
        } catch (err: unknown) {
            setCopyMutationError(err instanceof Error ? err.message : 'Kunne ikke kopiere graf');
        } finally {
            setCopyingChart(false);
        }
    };

    const handleGoToCopiedDashboard = async () => {
        if (!copySuccess) return;
        setSelectedProjectId(copySuccess.projectId);
        await refreshDashboards(copySuccess.projectId, copySuccess.dashboardId);
        setCopySuccess(null);
    };

    const openEditDashboardDialog = () => {
        if (!selectedDashboard) return;
        setDashboardMutationError(null);
        setEditDashboardTarget(selectedDashboard);
    };

    const openDeleteDashboardDialog = () => {
        if (!selectedDashboard) return;
        setDashboardMutationError(null);
        setDeleteDashboardTarget(selectedDashboard);
    };

    const openMoveDashboardDialog = () => {
        if (!selectedDashboard || !selectedProjectId) return;
        setMoveDashboardError(null);
        setMoveDashboardTarget(selectedDashboard);
        setMoveDashboardTargetProjectId(selectedProjectId);
        setIsMoveDashboardModalOpen(true);
    };

    const openCreateTabModal = () => {
        if (!selectedDashboardId) return;
        setCategoryMutationError(null);
        setIsCreateTabModalOpen(true);
    };

    const openRenameTabModal = () => {
        if (!activeCategory) return;
        setCategoryMutationError(null);
        setRenameTabName(getCategoryDisplayName(activeCategory.name));
        setIsRenameTabModalOpen(true);
    };

    const handleCreateTab = async () => {
        if (!selectedProjectId || !selectedDashboardId) return;
        const trimmedName = newTabName.trim();
        if (!trimmedName) {
            setCategoryMutationError('Fanenavn er påkrevd');
            return;
        }

        setSavingCategory(true);
        setCategoryMutationError(null);
        try {
            const createdCategory = await createCategory(selectedProjectId, selectedDashboardId, trimmedName);
            const categoryResult = await refreshCategories(createdCategory.id);
            await refreshGraphs(categoryResult.activeCategoryId ?? createdCategory.id);
            setNewTabName('');
            setIsCreateTabModalOpen(false);
        } catch (err: unknown) {
            setCategoryMutationError(err instanceof Error ? err.message : 'Kunne ikke opprette fane');
        } finally {
            setSavingCategory(false);
        }
    };

    const handleDeleteActiveTab = async () => {
        if (!selectedProjectId || !selectedDashboardId || !activeCategory) return;
        if (categories.length <= 1) {
            setCategoryMutationError('Kan ikke slette siste fane');
            return;
        }
        if (charts.length > 0) {
            setCategoryMutationError('Faner som inneholder grafer kan ikke slettes');
            return;
        }

        setDeletingCategory(true);
        setCategoryMutationError(null);
        try {
            await deleteCategory(selectedProjectId, selectedDashboardId, activeCategory.id);
            const categoryResult = await refreshCategories();
            await refreshGraphs(categoryResult.activeCategoryId);
        } catch (err: unknown) {
            setCategoryMutationError(err instanceof Error ? err.message : 'Kunne ikke slette fane');
        } finally {
            setDeletingCategory(false);
        }
    };

    const handleRenameActiveTab = async () => {
        if (!selectedProjectId || !selectedDashboardId || !activeCategory) return;
        const trimmedName = renameTabName.trim();
        if (!trimmedName) {
            setCategoryMutationError('Fanenavn er påkrevd');
            return;
        }

        setSavingCategory(true);
        setCategoryMutationError(null);
        try {
            await updateCategory(selectedProjectId, selectedDashboardId, activeCategory.id, { name: trimmedName });
            await refreshCategories(activeCategory.id);
            setIsRenameTabModalOpen(false);
        } catch (err: unknown) {
            setCategoryMutationError(err instanceof Error ? err.message : 'Kunne ikke endre navn på fane');
        } finally {
            setSavingCategory(false);
        }
    };

    const handleCategoryTabChange = (value: string) => {
        const nextCategoryId = Number(value);
        if (!Number.isFinite(nextCategoryId)) return;
        setCategoryMutationError(null);
        setActiveCategoryId(nextCategoryId);
    };

    const handleSaveDashboard = async (params: { name: string; description?: string }) => {
        if (!editDashboardTarget || !selectedProjectId) return;
        setSavingDashboard(true);
        setDashboardMutationError(null);
        try {
            const updatedDashboard = await updateDashboard(selectedProjectId, editDashboardTarget.id, {
                name: params.name,
                description: params.description,
            });
            setSelectedDashboardId(updatedDashboard.id);
            await refreshDashboards(selectedProjectId, updatedDashboard.id);
            setEditDashboardTarget(null);
        } catch (err: unknown) {
            setDashboardMutationError(err instanceof Error ? err.message : 'Kunne ikke oppdatere dashboard');
        } finally {
            setSavingDashboard(false);
        }
    };

    const handleDeleteDashboard = async () => {
        if (!deleteDashboardTarget || !selectedProjectId) return;
        setDeletingDashboard(true);
        setDashboardMutationError(null);
        try {
            const dashboardCategories = await fetchCategories(selectedProjectId, deleteDashboardTarget.id);
            for (const category of dashboardCategories) {
                const categoryGraphs = await fetchGraphs(selectedProjectId, deleteDashboardTarget.id, category.id);
                if (categoryGraphs.length > 0) {
                    setDashboardMutationError('Dashboard med grafer kan ikke slettes');
                    setDeletingDashboard(false);
                    return;
                }
            }
            await deleteDashboard(selectedProjectId, deleteDashboardTarget.id);
            await refreshDashboards(selectedProjectId, null);
            setDeleteDashboardTarget(null);
        } catch (err: unknown) {
            setDashboardMutationError(err instanceof Error ? err.message : 'Kunne ikke slette dashboard');
        } finally {
            setDeletingDashboard(false);
        }
    };

    const handleMoveDashboard = async () => {
        if (!moveDashboardTarget || !selectedProjectId) return;
        const sourceProjectId = selectedProjectId;
        const targetProjectId = moveDashboardTargetProjectId;
        const dashboardToMove = moveDashboardTarget;
        if (!moveDashboardTargetProjectId) {
            setMoveDashboardError('Velg team');
            return;
        }
        if (moveDashboardTargetProjectId === selectedProjectId) {
            setMoveDashboardError('Velg et annet team');
            return;
        }

        setMovingDashboard(true);
        setMoveDashboardError(null);
        try {
            await updateDashboard(sourceProjectId, dashboardToMove.id, {
                name: dashboardToMove.name,
                description: dashboardToMove.description,
                projectId: targetProjectId,
            });
            setIsMoveDashboardModalOpen(false);
            setMoveDashboardTarget(null);
            setMoveDashboardTargetProjectId(0);
            setDashboardMoveSuccessMessage('Dashboard flyttet');
            setSelectedProjectId(targetProjectId);
            await refreshDashboards(targetProjectId, dashboardToMove.id);
        } catch (err: unknown) {
            setMoveDashboardError(err instanceof Error ? err.message : 'Kunne ikke flytte dashboard');
        } finally {
            setMovingDashboard(false);
        }
    };

    const handleMoveChart = async (fromIndex: number, toIndex: number): Promise<boolean> => {
        if (fromIndex === toIndex) return true;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= charts.length || toIndex >= charts.length) return false;

        const movedChart = charts[fromIndex];
        if (!movedChart) return false;

        setReorderingGraphId(movedChart.graphId);
        const success = await handleReorderCharts(fromIndex, toIndex);
        if (success) {
            setReorderAnnouncement(`${movedChart.title} flyttet til plass ${toIndex + 1} av ${charts.length}.`);
        } else {
            setReorderAnnouncement(`Kunne ikke flytte ${movedChart.title}. Prøv igjen.`);
        }
        setReorderingGraphId(null);
        return success;
    };

    const getCategoryIndex = (categoryId: number) => categories.findIndex((item) => item.id === categoryId);

    const handleMoveCategory = async (fromIndex: number, toIndex: number): Promise<boolean> => {
        if (!selectedProjectId || !selectedDashboardId) return false;
        if (fromIndex === toIndex) return true;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= categories.length || toIndex >= categories.length) return false;

        const reordered = [...categories];
        const [moved] = reordered.splice(fromIndex, 1);
        if (!moved) return false;
        reordered.splice(toIndex, 0, moved);

        setReorderingCategoryId(moved.id);
        setCategoryMutationError(null);
        try {
            await updateCategoryOrdering(
                selectedProjectId,
                selectedDashboardId,
                reordered.map((category, index) => ({ id: category.id, ordering: index })),
            );
            await refreshCategories(activeCategoryId ?? moved.id);
            setReorderAnnouncement(`${getCategoryDisplayName(moved.name)} flyttet til plass ${toIndex + 1} av ${categories.length}.`);
            return true;
        } catch (err: unknown) {
            setCategoryMutationError(err instanceof Error ? err.message : 'Kunne ikke endre rekkefølge på faner');
            setReorderAnnouncement(`Kunne ikke flytte fane. Prøv igjen.`);
            return false;
        } finally {
            setReorderingCategoryId(null);
        }
    };

    const getChartIndex = (graphId: number) => charts.findIndex((item) => item.graphId === graphId);

    const handleMoveHandleKeyDown = async (event: KeyboardEvent<HTMLButtonElement>, graphId: number, title: string) => {
        if (!isEditPanelOpen) return;
        if (charts.length <= 1) return;

        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            if (grabbedGraphId === graphId) {
                setGrabbedGraphId(null);
                setReorderAnnouncement(`${title} sluppet.`);
            } else {
                const index = getChartIndex(graphId);
                if (index < 0) return;
                setGrabbedGraphId(graphId);
                setReorderAnnouncement(`${title} valgt for flytting. Plass ${index + 1} av ${charts.length}.`);
            }
            return;
        }

        if (event.key === 'Escape' && grabbedGraphId === graphId) {
            event.preventDefault();
            setGrabbedGraphId(null);
            setReorderAnnouncement(`Flytting av ${title} avbrutt.`);
            return;
        }

        if (grabbedGraphId !== graphId) return;
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

        event.preventDefault();
        const fromIndex = getChartIndex(graphId);
        if (fromIndex < 0) return;
        const toIndex = event.key === 'ArrowUp' ? fromIndex - 1 : fromIndex + 1;
        if (toIndex < 0 || toIndex >= charts.length) return;
        await handleMoveChart(fromIndex, toIndex);
    };

    const handleDragStart = (event: DragEvent<HTMLButtonElement>, graphId: number, title: string) => {
        if (!isEditPanelOpen) return;
        setDraggedGraphId(graphId);
        setDropTargetGraphId(null);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(graphId));
        const chartElement = chartRefs.current.get(graphId);
        if (chartElement) {
            event.dataTransfer.setDragImage(chartElement, 24, 24);
        }
        const index = getChartIndex(graphId);
        if (index >= 0) {
            setReorderAnnouncement(`${title} valgt for flytting. Plass ${index + 1} av ${charts.length}.`);
        }
    };

    const handleDropOnChart = async (event: DragEvent<HTMLDivElement>, targetGraphId: number) => {
        if (!isEditPanelOpen) return;
        event.preventDefault();
        const sourceGraphId = draggedGraphId ?? Number(event.dataTransfer.getData('text/plain'));
        if (!Number.isFinite(sourceGraphId)) return;
        const fromIndex = getChartIndex(sourceGraphId);
        const toIndex = getChartIndex(targetGraphId);
        if (fromIndex < 0 || toIndex < 0) return;
        await handleMoveChart(fromIndex, toIndex);
        setDraggedGraphId(null);
        setDropTargetGraphId(null);
    };

    const handleCategoryDragStart = (event: DragEvent<HTMLSpanElement>, categoryId: number, name: string) => {
        if (!isEditPanelOpen || categories.length <= 1) return;
        setDraggedCategoryId(categoryId);
        setDropTargetCategoryId(null);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(categoryId));
        const index = getCategoryIndex(categoryId);
        if (index >= 0) {
            setReorderAnnouncement(`${getCategoryDisplayName(name)} valgt for flytting. Plass ${index + 1} av ${categories.length}.`);
        }
    };

    const handleDropOnCategory = async (event: DragEvent<HTMLSpanElement>, targetCategoryId: number) => {
        if (!isEditPanelOpen || categories.length <= 1) return;
        event.preventDefault();
        const sourceCategoryId = draggedCategoryId ?? Number(event.dataTransfer.getData('text/plain'));
        if (!Number.isFinite(sourceCategoryId)) return;
        const fromIndex = getCategoryIndex(sourceCategoryId);
        const toIndex = getCategoryIndex(targetCategoryId);
        if (fromIndex < 0 || toIndex < 0) return;
        await handleMoveCategory(fromIndex, toIndex);
        setDraggedCategoryId(null);
        setDropTargetCategoryId(null);
    };

    const handleMoveChartVariant = async (graphId: number, fromIndex: number, toIndex: number): Promise<boolean> => {
        if (!selectedProjectId || !selectedDashboardId) return false;
        if (fromIndex === toIndex) return true;

        const chart = charts.find((item) => item.graphId === graphId);
        const variants = chart?.variants ?? [];
        if (!chart || variants.length <= 1) return false;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= variants.length || toIndex >= variants.length) return false;

        const reordered = [...variants];
        const [moved] = reordered.splice(fromIndex, 1);
        if (!moved) return false;
        reordered.splice(toIndex, 0, moved);

        setReorderingVariantGraphId(graphId);
        try {
            await updateQueryOrdering(
                selectedProjectId,
                selectedDashboardId,
                chart.categoryId,
                graphId,
                reordered.map((variant, index) => ({
                    id: variant.queryId,
                    ordering: index,
                })),
            );
            await refreshGraphs(chart.categoryId);
            setReorderAnnouncement(`${getVariantDisplayName(moved.queryName, toIndex)} flyttet til plass ${toIndex + 1} av ${variants.length}.`);
            return true;
        } catch (err: unknown) {
            setMutationError(err instanceof Error ? err.message : 'Kunne ikke endre rekkefølge på varianter');
            setReorderAnnouncement('Kunne ikke flytte variant. Prøv igjen.');
            return false;
        } finally {
            setReorderingVariantGraphId(null);
        }
    };

    const handleVariantDragStart = (
        event: DragEvent<HTMLSpanElement>,
        graphId: number,
        queryId: number,
        queryName: string,
        index: number,
        total: number,
    ) => {
        if (!isEditPanelOpen || total <= 1 || reorderingVariantGraphId !== null) return;
        setDraggedVariant({ graphId, queryId });
        setDropTargetVariant(null);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `${graphId}:${queryId}`);
        setReorderAnnouncement(`${getVariantDisplayName(queryName, index)} valgt for flytting. Plass ${index + 1} av ${total}.`);
    };

    const handleDropOnVariant = async (
        event: DragEvent<HTMLSpanElement>,
        targetGraphId: number,
        targetQueryId: number,
    ) => {
        if (!isEditPanelOpen || reorderingVariantGraphId !== null) return;
        event.preventDefault();

        const payload = event.dataTransfer.getData('text/plain');
        const [payloadGraphId, payloadQueryId] = payload.split(':').map(Number);
        const sourceGraphId =
            draggedVariant?.graphId
            ?? (Number.isFinite(payloadGraphId) ? payloadGraphId : NaN);
        const sourceQueryId =
            draggedVariant?.queryId
            ?? (Number.isFinite(payloadQueryId) ? payloadQueryId : NaN);

        if (!Number.isFinite(sourceGraphId) || !Number.isFinite(sourceQueryId)) return;
        if (sourceGraphId !== targetGraphId) return;

        const chart = charts.find((item) => item.graphId === targetGraphId);
        const variants = chart?.variants ?? [];
        const fromIndex = variants.findIndex((variant) => variant.queryId === sourceQueryId);
        const toIndex = variants.findIndex((variant) => variant.queryId === targetQueryId);
        if (fromIndex < 0 || toIndex < 0) return;

        await handleMoveChartVariant(targetGraphId, fromIndex, toIndex);
        setDraggedVariant(null);
        setDropTargetVariant(null);
    };

    const openImportModal = () => {
        if (!selectedDashboardId) return;
        setCategoryMutationError(null);
        setImportError(null);
        setIsImportModalOpen(true);
    };

    const openAddTextModal = () => {
        if (!selectedDashboardId) return;
        setTextError(null);
        setTextTitle('');
        setTextWidth('100');
        setIsAddTextModalOpen(true);
    };

    const handleImportChart = async (params: {
        name: string;
        graphType: GraphType;
        width: string;
        sqlText: string;
    }) => {
        if (!selectedProjectId || !selectedDashboardId) return;

        const parsedWidth = Number(params.width);
        if (!Number.isFinite(parsedWidth)) {
            setImportError('Bredde må være et tall mellom 1 og 100');
            return;
        }
        const normalizedWidth = Math.max(1, Math.min(100, Math.round(parsedWidth)));
        const sqlForSave = params.sqlText;

        setImportError(null);
        setImportingChart(true);
        try {
            // Resolve a category (use first existing or create default)
            let categoryId: number;
            const dashboardCategories = await fetchCategories(selectedProjectId, selectedDashboardId);
            if (activeCategoryId && dashboardCategories.some((category) => category.id === activeCategoryId)) {
                categoryId = activeCategoryId;
            } else if (dashboardCategories.length > 0) {
                categoryId = dashboardCategories[0].id;
            } else {
                const created = await createCategory(selectedProjectId, selectedDashboardId, 'Fane 1');
                categoryId = created.id;
            }

            const createdGraph = await createGraph(selectedProjectId, selectedDashboardId, categoryId, {
                name: params.name,
                graphType: params.graphType,
                width: normalizedWidth,
            });
            await createQuery(selectedProjectId, selectedDashboardId, categoryId, createdGraph.id, {
                name: `${params.name} - query`,
                sqlText: sqlForSave,
            });
            await refreshCategories(categoryId);
            await refreshGraphs(categoryId);
            setIsImportModalOpen(false);
        } catch (err: unknown) {
            setImportError(err instanceof Error ? err.message : 'Kunne ikke importere graf');
        } finally {
            setImportingChart(false);
        }
    };

    const handleAddTextChart = async () => {
        if (!selectedProjectId || !selectedDashboardId) return;
        const title = textTitle.trim() || 'Tekst';
        const markdown = textMarkdown.trim();
        const parsedWidth = Number(textWidth);
        if (!Number.isFinite(parsedWidth)) {
            setTextError('Bredde må være et tall mellom 1 og 100');
            return;
        }
        const normalizedWidth = Math.max(1, Math.min(100, Math.round(parsedWidth)));

        setTextError(null);
        setAddingText(true);
        try {
            let categoryId: number;
            const dashboardCategories = await fetchCategories(selectedProjectId, selectedDashboardId);
            if (activeCategoryId && dashboardCategories.some((category) => category.id === activeCategoryId)) {
                categoryId = activeCategoryId;
            } else if (dashboardCategories.length > 0) {
                categoryId = dashboardCategories[0].id;
            } else {
                const created = await createCategory(selectedProjectId, selectedDashboardId, 'Fane 1');
                categoryId = created.id;
            }

            await createGraph(selectedProjectId, selectedDashboardId, categoryId, {
                name: title,
                graphType: 'TEXT',
                width: normalizedWidth,
                description: markdown || undefined,
            });
            await refreshCategories(categoryId);
            await refreshGraphs(categoryId);
            setIsAddTextModalOpen(false);
            setTextTitle('');
            setTextMarkdown('');
        } catch (err: unknown) {
            setTextError(err instanceof Error ? err.message : 'Kunne ikke legge til tekst');
        } finally {
            setAddingText(false);
        }
    };

    const handleSaveTextChart = async () => {
        if (!editTextChart || !selectedProjectId || !selectedDashboardId) return;
        const trimmedName = editTextName.trim() || 'Tekst';
        const markdown = editTextMarkdown.trim();
        const parsedWidth = Number(editTextWidth);
        if (!Number.isFinite(parsedWidth)) {
            setEditTextError('Bredde må være et tall mellom 1 og 100');
            return;
        }
        const normalizedWidth = Math.max(1, Math.min(100, Math.round(parsedWidth)));

        setEditTextError(null);
        setSavingEditText(true);
        try {
            await updateGraph(selectedProjectId, selectedDashboardId, editTextChart.categoryId, editTextChart.graphId, {
                name: trimmedName,
                graphType: 'TEXT',
                width: normalizedWidth,
                description: markdown || undefined,
            });
            await refreshGraphs(editTextChart.categoryId);
            setEditTextChart(null);
        } catch (err: unknown) {
            setEditTextError(err instanceof Error ? err.message : 'Kunne ikke oppdatere tekst');
        } finally {
            setSavingEditText(false);
        }
    };

    const handleDataLoaded = (data: { id: string; gb: number; title: string }) => {
        const chart = charts.find((item) => item.id === data.id);
        if (chart?.graphType === 'TEXT') return;
        setStats((prev) => ({
            ...prev,
            [data.id]: { gb: data.gb, title: data.title },
        }));
    };

    const toggleEditPanel = () => {
        setIsEditPanelOpen((prev) => {
            const next = !prev;
            if (!next) {
                setGrabbedGraphId(null);
                setDraggedGraphId(null);
                setDropTargetGraphId(null);
                setDraggedVariant(null);
                setDropTargetVariant(null);
                setReorderAnnouncement('Rekkefølge-redigering avsluttet.');
            }
            return next;
        });
    };

    const filters = (
        <>
            {supportsVisibleStandardFilters && (
                <>
                    {visibleFilterCapabilities.website && (
                        <div className="w-full md:w-[18rem]">
                            <DashboardWebsitePicker
                                selectedWebsite={selectedWebsite}
                                onWebsiteChange={setSelectedWebsite}
                                variant="minimal"
                                size="small"
                                disableUrlUpdate
                            />
                        </div>
                    )}

                    {visibleFilterCapabilities.url && (
                        <div className="w-full md:w-[20rem]">
                            <div className="flex items-center gap-2 mb-1">
                                <Label size="small" htmlFor="oversikt-url-filter">URL-sti</Label>
                                <select
                                    className="text-sm bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-subtle)] rounded text-[var(--ax-text-accent)] font-medium cursor-pointer focus:outline-none py-1 px-2"
                                    value={tempPathOperator}
                                    onChange={(e) => setTempPathOperator(e.target.value)}
                                >
                                    <option value="equals">er lik</option>
                                    <option value="starts-with">starter med</option>
                                </select>
                            </div>
                            <UNSAFE_Combobox
                                id="oversikt-url-filter"
                                label="URL-stier"
                                hideLabel
                                size="small"
                                isMultiSelect
                                allowNewValues
                                options={tempUrlPaths.map((path) => ({ label: path, value: path }))}
                                selectedOptions={tempUrlPaths}
                                onToggleSelected={handleUrlToggleSelected}
                                value={comboInputValue}
                                onChange={handleComboChange}
                                clearButton
                            />
                        </div>
                    )}

                    {visibleFilterCapabilities.date && (
                        <div className="w-full sm:w-auto min-w-[180px]">
                            <Select
                                label="Datoperiode"
                                size="small"
                                value={tempDateRange}
                                onChange={(e) => setTempDateRange(e.target.value)}
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

                    {visibleFilterCapabilities.website && (
                        <div className="w-full sm:w-auto min-w-[150px]">
                            <Select
                                label="Visning"
                                size="small"
                                value={tempMetricType}
                                onChange={(e) => setTempMetricType(e.target.value as 'visitors' | 'pageviews' | 'proportion' | 'visits')}
                            >
                                <option value="visitors">Unike besøkende</option>
                                <option value="visits">Økter / besøk</option>
                                <option value="pageviews">Sidevisninger</option>
                                <option value="proportion">Andel (%)</option>
                            </Select>
                        </div>
                    )}

                    <div className="flex items-end pb-[2px]">
                        <Button size="small" onClick={handleUpdate} disabled={!hasChanges}>
                            Oppdater
                        </Button>
                    </div>
                </>
            )}
        </>
    );

    return (
        <DashboardLayout
            title={selectedDashboard ? `${selectedDashboard.name}` : 'Dashboard'}
            description={(
                <Link
                    href={selectedProjectId ? `/prosjekter?projectId=${selectedProjectId}` : '/prosjekter'}
                    className="inline-flex items-center gap-1"
                >
                    <ArrowLeftIcon aria-hidden fontSize="1rem" />
                    <span>Alle dashboard</span>
                </Link>
            )}
            filtersTop={selectedDashboard ? (
                <div className="flex justify-end gap-2">
                    <Button
                        variant={isEditPanelOpen ? 'primary' : 'secondary'}
                        size="small"
                        onClick={toggleEditPanel}
                    >
                        {isEditPanelOpen ? 'Lukk' : 'Rediger'}
                    </Button>
                    <ActionMenu>
                        <ActionMenu.Trigger>
                            <Button type="button" variant="secondary" size="small">
                                + legg til
                            </Button>
                        </ActionMenu.Trigger>
                        <ActionMenu.Content align="end">
                            <ActionMenu.Item as="a" href="/grafbygger">
                                Legg til graf
                            </ActionMenu.Item>
                            <ActionMenu.Item onClick={openAddTextModal}>
                                Legg til tekstboks
                            </ActionMenu.Item>
                            <ActionMenu.Item onClick={openCreateTabModal}>
                                Legg til fane
                            </ActionMenu.Item>
                            <ActionMenu.Item onClick={openImportModal}>
                                Importer graf
                            </ActionMenu.Item>
                        </ActionMenu.Content>
                    </ActionMenu>
                </div>
            ) : undefined}
            filters={supportsVisibleStandardFilters ? filters : undefined}
        >
            {error && <Alert variant="error">{error}</Alert>}
            {dashboardMoveSuccessMessage && (
                <Alert variant="success" closeButton onClose={() => setDashboardMoveSuccessMessage(null)}>
                    {dashboardMoveSuccessMessage}
                </Alert>
            )}
            <p className="sr-only" aria-live="polite" aria-atomic="true">
                {reorderAnnouncement}
            </p>

            {isLoading && (
                <div className="flex justify-center p-8">
                    <Loader />
                </div>
            )}

            {!isLoading && !selectedDashboard && (
                <div className="w-fit">
                    <Alert variant="info" size="small">
                        Velg arbeidsområde og dashboard for å vise grafer.
                    </Alert>
                </div>
            )}

            {!isLoading && visibleFilterCapabilities.website && selectedDashboard && !activeWebsiteId && (
                <div className="w-fit">
                    <Alert variant="info" size="small">
                        Velg nettside eller app for å vise grafdata.
                    </Alert>
                </div>
            )}

            {!isLoading && selectedDashboard && (!visibleFilterCapabilities.website || activeWebsiteId) && (
                <>
                    {isEditPanelOpen && (
                        <section className="mb-4 p-3 border border-[var(--ax-border-neutral-subtle)] rounded-md bg-[var(--ax-bg-default)]">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                    variant="secondary"
                                    size="xsmall"
                                    onClick={openEditDashboardDialog}
                                    disabled={!selectedDashboard}
                                >
                                    Endre info
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="xsmall"
                                    onClick={openMoveDashboardDialog}
                                    disabled={!selectedDashboard}
                                >
                                    Flytt dashboard
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="xsmall"
                                    onClick={openDeleteDashboardDialog}
                                    disabled={!selectedDashboard}
                                >
                                    Slett dashboard
                                </Button>
                                {categories.length > 1 && (
                                    <Button
                                        variant="secondary"
                                        size="xsmall"
                                        onClick={openRenameTabModal}
                                        disabled={!activeCategory}
                                    >
                                        Gi nytt navn til fane
                                    </Button>
                                )}
                                {categories.length > 1 && (
                                    <Button
                                        variant="secondary"
                                        size="xsmall"
                                        onClick={() => void handleDeleteActiveTab()}
                                        loading={deletingCategory}
                                        disabled={!activeCategory || charts.length > 0}
                                        title={charts.length > 0 ? 'Tøm fanen for grafer før du sletter den' : undefined}
                                    >
                                        Slett aktiv fane
                                    </Button>
                                )}
                                <Button
                                    variant="secondary"
                                    size="xsmall"
                                    onClick={openCreateTabModal}
                                    disabled={!selectedDashboard}
                                >
                                    Legg til fane
                                </Button>
                            </div>
                            {categoryMutationError && (
                                <div className="mt-3">
                                    <Alert variant="error" size="small">{categoryMutationError}</Alert>
                                </div>
                            )}
                        </section>
                    )}
                    {hasMultipleTabs && (
                        <div className="mb-6">
                            <Tabs value={activeCategoryId ? String(activeCategoryId) : undefined} onChange={handleCategoryTabChange}>
                                <Tabs.List>
                                    {categories.map((category) => (
                                        <Tabs.Tab
                                            key={category.id}
                                            value={String(category.id)}
                                            label={(
                                                <span
                                                    className={`inline-flex items-center gap-2 rounded ${dropTargetCategoryId === category.id ? 'outline outline-2 outline-[var(--ax-border-accent)] outline-offset-2' : ''}`}
                                                    draggable={isEditPanelOpen && categories.length > 1 && reorderingCategoryId === null}
                                                    onDragStart={(event) => handleCategoryDragStart(event, category.id, category.name)}
                                                    onDragEnd={() => {
                                                        setDraggedCategoryId(null);
                                                        setDropTargetCategoryId(null);
                                                    }}
                                                    onDragOver={(event) => {
                                                        if (!isEditPanelOpen || draggedCategoryId === null) return;
                                                        event.preventDefault();
                                                        event.dataTransfer.dropEffect = 'move';
                                                    }}
                                                    onDragEnter={() => {
                                                        if (!isEditPanelOpen || draggedCategoryId === null || draggedCategoryId === category.id) return;
                                                        setDropTargetCategoryId(category.id);
                                                    }}
                                                    onDragLeave={() => {
                                                        if (dropTargetCategoryId === category.id) setDropTargetCategoryId(null);
                                                    }}
                                                    onDrop={(event) => {
                                                        void handleDropOnCategory(event, category.id);
                                                    }}
                                                    style={{ opacity: draggedCategoryId === category.id ? 0.65 : 1 }}
                                                >
                                                    {isEditPanelOpen && categories.length > 1 && (
                                                        <GripVertical aria-hidden size={14} />
                                                    )}
                                                    <span>{getCategoryDisplayName(category.name)}</span>
                                                </span>
                                            )}
                                        />
                                    ))}
                                </Tabs.List>
                            </Tabs>
                        </div>
                    )}
                    {charts.length === 0 && (
                        <div className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-[var(--ax-text-default)]">
                                    {activeCategory ? `Fanen "${getCategoryDisplayName(activeCategory.name)}" er tom` : 'Dashboardet er tomt'}
                                </span>
                                {hasMultipleTabs && (
                                    <span className="text-sm text-[var(--ax-text-subtle)]">
                                        Du kan flytte grafer hit fra handlingsmenyen på en graf i en annen fane.
                                    </span>
                                )}
                                <ActionMenu>
                                    <ActionMenu.Trigger>
                                        <Button type="button" variant="secondary" size="xsmall">
                                            + legg til graf
                                        </Button>
                                    </ActionMenu.Trigger>
                                    <ActionMenu.Content align="start">
                                        <ActionMenu.Item as="a" href="/grafbygger">
                                            Legg til ny graf
                                        </ActionMenu.Item>
                                        <ActionMenu.Item onClick={openAddTextModal}>
                                            Legg til tekstboks
                                        </ActionMenu.Item>
                                        <ActionMenu.Item onClick={openImportModal}>
                                            Importer graf
                                        </ActionMenu.Item>
                                        <ActionMenu.Item onClick={openCreateTabModal}>
                                            Legg til fane
                                        </ActionMenu.Item>
                                    </ActionMenu.Content>
                                </ActionMenu>
                            </div>
                        </div>
                    )}
                    {charts.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-20 gap-6">
                            {charts.map((chart, index) => {
                                const activeChart = getChartWithSelectedVariant(chart);
                                const resolvedWebsiteId = activeWebsiteId || (activeChart.sql ? (extractWebsiteId(activeChart.sql) ?? '') : '');
                                return (
                                <div
                                    key={chart.id}
                                    className={`relative ${getSpanClass(chart.width)}`}
                                    ref={(element) => {
                                        if (element) chartRefs.current.set(chart.graphId, element);
                                        else chartRefs.current.delete(chart.graphId);
                                    }}
                                    onDragOver={(event) => {
                                        if (!isEditPanelOpen || draggedGraphId === null) return;
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDragEnter={() => {
                                        if (!isEditPanelOpen || draggedGraphId === null || draggedGraphId === chart.graphId) return;
                                        setDropTargetGraphId(chart.graphId);
                                    }}
                                    onDragLeave={() => {
                                        if (dropTargetGraphId === chart.graphId) {
                                            setDropTargetGraphId(null);
                                        }
                                    }}
                                    onDrop={(event) => {
                                        void handleDropOnChart(event, chart.graphId);
                                    }}
                                    style={{
                                        opacity: draggedGraphId === chart.graphId ? 0.65 : 1,
                                        outline: dropTargetGraphId === chart.graphId ? '2px dashed var(--ax-border-accent)' : 'none',
                                        outlineOffset: dropTargetGraphId === chart.graphId ? '4px' : undefined,
                                    }}
                                >
                                    <DashboardWidget
                                        chart={activeChart}
                                        websiteId={resolvedWebsiteId}
                                        filters={activeFilters}
                                        onDataLoaded={handleDataLoaded}
                                        selectedWebsite={activeWebsite ? { ...activeWebsite } : undefined}
                                        dashboardTitle={selectedDashboard.name}
                                        onEditChart={openEditDialog}
                                        onDeleteChart={openDeleteDialog}
                                        onCopyChart={chart.graphType === 'TEXT' ? undefined : openCopyDialog}
                                        onMoveChart={categories.length > 1 ? openMoveDialog : undefined}
                                        replaceExploreActionWithSqlEditor
                                        titleBelow={(chart.variants?.length ?? 0) > 1 ? (
                                            <Tabs
                                                size="small"
                                                value={String(selectedVariantByGraphId[chart.graphId] ?? chart.queryId)}
                                                onChange={(value) => {
                                                    const nextQueryId = Number(value);
                                                    if (!Number.isFinite(nextQueryId)) return;
                                                    setSelectedVariantByGraphId((prev) => ({
                                                        ...prev,
                                                        [chart.graphId]: nextQueryId,
                                                    }));
                                                }}
                                            >
                                                <Tabs.List>
                                                    {(chart.variants ?? []).map((variant, variantIndex) => (
                                                        <Tabs.Tab
                                                            key={variant.queryId}
                                                            value={String(variant.queryId)}
                                                            label={(
                                                                <span
                                                                    className={`inline-flex items-center gap-1 rounded ${dropTargetVariant?.graphId === chart.graphId && dropTargetVariant?.queryId === variant.queryId ? 'outline outline-2 outline-[var(--ax-border-accent)] outline-offset-2' : ''}`}
                                                                    draggable={isEditPanelOpen && (chart.variants?.length ?? 0) > 1 && reorderingVariantGraphId === null}
                                                                    onDragStart={(event) => {
                                                                        handleVariantDragStart(
                                                                            event,
                                                                            chart.graphId,
                                                                            variant.queryId,
                                                                            variant.queryName,
                                                                            variantIndex,
                                                                            chart.variants?.length ?? 0,
                                                                        );
                                                                    }}
                                                                    onDragEnd={() => {
                                                                        setDraggedVariant(null);
                                                                        setDropTargetVariant(null);
                                                                    }}
                                                                    onDragOver={(event) => {
                                                                        if (
                                                                            !isEditPanelOpen
                                                                            || !draggedVariant
                                                                            || draggedVariant.graphId !== chart.graphId
                                                                            || reorderingVariantGraphId !== null
                                                                        ) return;
                                                                        event.preventDefault();
                                                                        event.dataTransfer.dropEffect = 'move';
                                                                    }}
                                                                    onDragEnter={() => {
                                                                        if (
                                                                            !isEditPanelOpen
                                                                            || !draggedVariant
                                                                            || draggedVariant.graphId !== chart.graphId
                                                                            || draggedVariant.queryId === variant.queryId
                                                                        ) return;
                                                                        setDropTargetVariant({ graphId: chart.graphId, queryId: variant.queryId });
                                                                    }}
                                                                    onDragLeave={() => {
                                                                        if (dropTargetVariant?.graphId === chart.graphId && dropTargetVariant?.queryId === variant.queryId) {
                                                                            setDropTargetVariant(null);
                                                                        }
                                                                    }}
                                                                    onDrop={(event) => {
                                                                        void handleDropOnVariant(event, chart.graphId, variant.queryId);
                                                                    }}
                                                                    style={{
                                                                        opacity: draggedVariant?.graphId === chart.graphId && draggedVariant?.queryId === variant.queryId ? 0.65 : 1,
                                                                    }}
                                                                >
                                                                    {isEditPanelOpen && (chart.variants?.length ?? 0) > 1 && (
                                                                        <GripVertical aria-hidden size={14} />
                                                                    )}
                                                                    <span>{getVariantDisplayName(variant.queryName, variantIndex)}</span>
                                                                </span>
                                                            )}
                                                        />
                                                    ))}
                                                </Tabs.List>
                                            </Tabs>
                                        ) : undefined}
                                        titlePrefix={isEditPanelOpen && charts.length > 1 ? (
                                            <Button
                                                variant="secondary"
                                                size="xsmall"
                                                icon={<GripVertical aria-hidden />}
                                                title={grabbedGraphId === chart.graphId ? 'Slipp graf' : 'Flytt graf'}
                                                aria-label={`${grabbedGraphId === chart.graphId ? 'Slipp' : 'Flytt'} ${chart.title}. Plass ${index + 1} av ${charts.length}.`}
                                                aria-pressed={grabbedGraphId === chart.graphId}
                                                disabled={reorderingGraphId !== null}
                                                loading={reorderingGraphId === chart.graphId}
                                                draggable={reorderingGraphId === null}
                                                onKeyDown={(event) => {
                                                    void handleMoveHandleKeyDown(event, chart.graphId, chart.title);
                                                }}
                                                onDragStart={(event) => handleDragStart(event, chart.graphId, chart.title)}
                                                onDragEnd={() => {
                                                    setDraggedGraphId(null);
                                                    setDropTargetGraphId(null);
                                                }}
                                            >
                                                Flytt
                                            </Button>
                                        ) : undefined}
                                    />
                                </div>
                                );
                            })}
                        </div>
                    )}

                    {Object.keys(stats).length > 0 && (
                        <div className="mt-5">
                            <ReadMore header={`${Math.round(totalGb)} GB prosessert`} size="small">
                                <div className="text-sm text-[var(--ax-text-subtle)]">
                                    <ul className="list-disc pl-5">
                                        {Object.entries(stats).map(([id, stat]) => (
                                            <li key={id}>
                                                <span className="font-medium">{Math.round(stat.gb)} GB</span> - {stat.title}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </ReadMore>
                        </div>
                    )}

                    {charts.length > 4 && (
                        <div className="flex justify-end mt-4 pb-6">
                            <ActionMenu>
                                <ActionMenu.Trigger>
                                    <Button type="button" variant="secondary" size="small">
                                        + legg til
                                    </Button>
                                </ActionMenu.Trigger>
                                <ActionMenu.Content align="end">
                                    <ActionMenu.Item as="a" href="/grafbygger">
                                        Legg til graf
                                    </ActionMenu.Item>
                                    <ActionMenu.Item onClick={openAddTextModal}>
                                        Legg til tekstboks
                                    </ActionMenu.Item>
                                    <ActionMenu.Item onClick={openImportModal}>
                                        Importer graf
                                    </ActionMenu.Item>
                                </ActionMenu.Content>
                            </ActionMenu>
                        </div>
                    )}
                </>
            )}

            <EditChartDialog
                key={editChart?.id ?? 'edit-chart-dialog'}
                open={!!editChart}
                chart={editChart}
                defaultWebsiteId={
                    editChart?.sql
                        ? (extractWebsiteId(editChart.sql) ?? (activeWebsiteId || undefined))
                        : (activeWebsiteId || undefined)
                }
                loading={savingEdit}
                error={mutationError}
                defaultShowSql
                onClose={() => {
                    setEditChart(null);
                    setMutationError(null);
                }}
                onSave={handleSaveChart}
                onRenameVariant={handleRenameChartVariant}
                onDeleteVariant={handleDeleteChartVariant}
                onReorderVariants={handleReorderChartVariants}
            />

            <DeleteChartDialog
                open={!!deleteChartTarget}
                chart={deleteChartTarget}
                loading={deletingChart}
                error={mutationError}
                onClose={() => {
                    setDeleteChartTarget(null);
                    setMutationError(null);
                }}
                onConfirm={handleDeleteChart}
            />

            <Modal
                open={!!moveChartTarget}
                onClose={() => {
                    setMoveChartTarget(null);
                    setMutationError(null);
                }}
                header={{ heading: 'Flytt graf til fane' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-3">
                        <p className="text-sm text-[var(--ax-text-subtle)]">
                            {moveChartTarget ? `Velg hvilken fane "${moveChartTarget.title}" skal flyttes til.` : 'Velg mål-fane.'}
                        </p>
                        <Select
                            label="Mål-fane"
                            value={moveTargetCategoryId}
                            onChange={(event) => {
                                setMoveTargetCategoryId(event.target.value);
                                setMutationError(null);
                            }}
                        >
                            <option value="">Velg fane</option>
                            {categories
                                .filter((category) => category.id !== moveChartTarget?.categoryId)
                                .map((category) => (
                                    <option key={category.id} value={category.id}>
                                        {getCategoryDisplayName(category.name)}
                                    </option>
                                ))}
                        </Select>
                        {mutationError && (
                            <Alert variant="error" size="small">{mutationError}</Alert>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        onClick={() => void handleMoveChartToTab()}
                        loading={movingChart}
                        disabled={!moveChartTarget || !moveTargetCategoryId}
                    >
                        Flytt til annen fane
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setMoveChartTarget(null);
                            setMutationError(null);
                        }}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <CopyChartDialog
                open={!!copyChartTarget}
                chart={copyChartTarget?.chart ?? null}
                projects={projects}
                selectedProjectId={selectedProjectId}
                selectedDashboardId={selectedDashboardId}
                loading={copyingChart}
                error={copyMutationError}
                onClose={() => {
                    setCopyChartTarget(null);
                    setCopyMutationError(null);
                }}
                sourceWebsiteId={copyChartTarget?.sourceWebsiteId}
                loadDashboards={fetchDashboards}
                loadCategories={fetchCategories}
                onCopy={handleCopyChart}
            />

            <Modal
                open={isCreateTabModalOpen}
                onClose={() => {
                    setIsCreateTabModalOpen(false);
                    setCategoryMutationError(null);
                }}
                header={{ heading: 'Opprett fane' }}
                width="small"
            >
                <Modal.Body>
                    <TextField
                        label="Fanenavn"
                        value={newTabName}
                        onChange={(event) => setNewTabName(event.target.value)}
                    />
                    {categoryMutationError && (
                        <div className="mt-3">
                            <Alert variant="error" size="small">{categoryMutationError}</Alert>
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        onClick={() => void handleCreateTab()}
                        loading={savingCategory}
                        disabled={!selectedDashboard}
                    >
                        Opprett fane
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setIsCreateTabModalOpen(false);
                            setCategoryMutationError(null);
                        }}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={isRenameTabModalOpen}
                onClose={() => {
                    setIsRenameTabModalOpen(false);
                    setCategoryMutationError(null);
                }}
                header={{ heading: 'Endre navn på fane' }}
                width="small"
            >
                <Modal.Body>
                    <TextField
                        label="Fanenavn"
                        value={renameTabName}
                        onChange={(event) => setRenameTabName(event.target.value)}
                        placeholder="F.eks. Konvertering"
                    />
                    {categoryMutationError && (
                        <div className="mt-3">
                            <Alert variant="error" size="small">{categoryMutationError}</Alert>
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        onClick={() => void handleRenameActiveTab()}
                        loading={savingCategory}
                        disabled={!activeCategory}
                    >
                        Lagre navn
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setIsRenameTabModalOpen(false);
                            setCategoryMutationError(null);
                        }}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={!!copySuccess}
                onClose={() => setCopySuccess(null)}
                header={{ heading: 'Graf kopiert' }}
                width="small"
            >
                <Modal.Body>
                    {copySuccess && (
                        <p>
                            {copySuccess.chartName} er kopiert til {copySuccess.projectName} / {copySuccess.dashboardName}. Vil du gå dit nå?
                        </p>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleGoToCopiedDashboard()}>
                        Ja, gå dit
                    </Button>
                    <Button variant="secondary" onClick={() => setCopySuccess(null)}>
                        Nei, bli her
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={isMoveDashboardModalOpen}
                onClose={() => {
                    setIsMoveDashboardModalOpen(false);
                    setMoveDashboardTarget(null);
                    setMoveDashboardTargetProjectId(0);
                    setMoveDashboardError(null);
                }}
                header={{ heading: 'Flytt dashboard' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        {moveDashboardError && <Alert variant="error" size="small">{moveDashboardError}</Alert>}
                        {moveDashboardTarget && (
                            <p>
                                Dashboard: <strong>{moveDashboardTarget.name}</strong>
                            </p>
                        )}
                        <Select
                            label="Team"
                            value={moveDashboardTargetProjectId ? String(moveDashboardTargetProjectId) : ''}
                            onChange={(event) => {
                                setMoveDashboardTargetProjectId(Number(event.target.value));
                                setMoveDashboardError(null);
                            }}
                            size="small"
                        >
                            <option value="">Velg team</option>
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleMoveDashboard()} loading={movingDashboard}>
                        Flytt dashboard
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setIsMoveDashboardModalOpen(false);
                            setMoveDashboardTarget(null);
                            setMoveDashboardTargetProjectId(0);
                            setMoveDashboardError(null);
                        }}
                        disabled={movingDashboard}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            {isImportModalOpen && (
                <ImportChartDialog
                    open={isImportModalOpen}
                    loading={importingChart}
                    error={importError}
                    onClose={() => {
                        setIsImportModalOpen(false);
                        setImportError(null);
                    }}
                    onImport={handleImportChart}
                />
            )}

            <Modal
                open={isAddTextModalOpen}
                onClose={() => {
                    setIsAddTextModalOpen(false);
                    setTextError(null);
                }}
                header={{ heading: 'Legg til tekstboks' }}
                width="medium"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        <TextField
                            label="Tittel"
                            value={textTitle}
                            onChange={(event) => setTextTitle(event.target.value)}
                        />
                        <Textarea
                            label="Innhold (valgfritt)"
                            value={textMarkdown}
                            minRows={10}
                            onChange={(event) => setTextMarkdown(event.target.value)}
                        />
                        <TextField
                            label="Bredde (%)"
                            value={textWidth}
                            onChange={(event) => setTextWidth(event.target.value)}
                        />
                        {textError && (
                            <Alert variant="error" size="small">{textError}</Alert>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleAddTextChart()} loading={addingText} disabled={!selectedDashboard}>
                        Legg til tekstboks
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setIsAddTextModalOpen(false);
                            setTextError(null);
                        }}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={!!editTextChart}
                onClose={() => {
                    setEditTextChart(null);
                    setEditTextError(null);
                }}
                header={{ heading: 'Rediger tekst' }}
                width="medium"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        <TextField
                            label="Tittel"
                            value={editTextName}
                            onChange={(event) => setEditTextName(event.target.value)}
                        />
                        <Textarea
                            label="Innhold (valgfritt)"
                            value={editTextMarkdown}
                            minRows={10}
                            onChange={(event) => setEditTextMarkdown(event.target.value)}
                        />
                        <TextField
                            label="Bredde (%)"
                            value={editTextWidth}
                            onChange={(event) => setEditTextWidth(event.target.value)}
                        />
                        {editTextError && (
                            <Alert variant="error" size="small">{editTextError}</Alert>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleSaveTextChart()} loading={savingEditText} disabled={!editTextChart}>
                        Lagre
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setEditTextChart(null);
                            setEditTextError(null);
                        }}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <EditDashboardDialog
                key={editDashboardTarget ? `edit-dashboard-${editDashboardTarget.id}-${editDashboardTarget.projectId}` : 'edit-dashboard-dialog'}
                open={!!editDashboardTarget}
                dashboard={editDashboardTarget}
                loading={savingDashboard}
                error={dashboardMutationError}
                onClose={() => {
                    setEditDashboardTarget(null);
                    setDashboardMutationError(null);
                }}
                onSave={handleSaveDashboard}
            />

            <DeleteDashboardDialog
                open={!!deleteDashboardTarget}
                dashboard={deleteDashboardTarget}
                hasCharts={charts.length > 0}
                loading={deletingDashboard}
                error={dashboardMutationError}
                onClose={() => {
                    setDeleteDashboardTarget(null);
                    setDashboardMutationError(null);
                }}
                onConfirm={handleDeleteDashboard}
            />
        </DashboardLayout>
    );
};

export default Oversikt;
