import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { BarChartIcon, LineGraphIcon, PieChartIcon, SquareGridIcon, TableIcon } from '@navikt/aksel-icons';
import { ChevronDown, ChevronUp, MoreVertical, Plus } from 'lucide-react';
import { ActionMenu, Alert, BodyShort, Button, Heading, Link, Loader, Modal, Search, Select, Table, TextField, Tooltip } from '@navikt/ds-react';
import { Link as RouterLink } from 'react-router-dom';
import DeleteDashboardDialog from '../../oversikt/ui/dialogs/DeleteDashboardDialog.tsx';
import CopyChartDialog from '../../oversikt/ui/dialogs/CopyChartDialog.tsx';
import EditChartDialog from '../../oversikt/ui/dialogs/EditChartDialog.tsx';
import EditDashboardDialog from '../../oversikt/ui/dialogs/EditDashboardDialog.tsx';
import ImportChartDialog from '../../oversikt/ui/dialogs/ImportChartDialog.tsx';
import * as api from '../api/backendApi.ts';
import { useProjectManager } from '../hooks/useProjectManager.ts';
import type { ProjectSummary } from '../hooks/useProjectManager.ts';
import type { DashboardDto, ProjectDto } from '../model/types.ts';
import ProjectManagerLayout from './ProjectManagerLayout.tsx';
import { extractWebsiteId } from '../../sql/utils/sqlProcessing.ts';
import type { GraphType, OversiktChart } from '../../oversikt';

type FileTableRow = {
    id: string;
    type: 'dashboard' | 'category' | 'chart';
    name: string;
    indentLevel?: 0 | 1 | 2;
    dashboardId: number;
    dashboardName: string;
    categoryName?: string;
    categoryId?: number;
    graphType?: string;
    graphId?: number;
    variantCount?: number;
};

type ImportGraphType = 'LINE' | 'BAR' | 'PIE' | 'TABLE';
type ProjectManagerEditChartTarget = {
    projectId: number;
    dashboardId: number;
    categoryId: number;
    chart: OversiktChart;
    defaultWebsiteId?: string;
};
type ProjectManagerMoveChartTarget = {
    projectId: number;
    projectName: string;
    dashboardId: number;
    dashboardName: string;
    categoryId: number;
    graphId: number;
    name: string;
};

const LAST_PROJECT_STORAGE_KEY = 'projectmanager:lastSelectedProjectId';

const ProjectManager = () => {
    const {
        projectSummaries,
        loading,
        error,
        message,
        newProjectName,
        setNewProjectName,
        newProjectDescription,
        setNewProjectDescription,
        createProject,
        editProject,
        createDashboard,
        createCategory,
        updateCategory,
        importChart,
        deleteProject,
        editDashboard,
        deleteDashboard,
        deleteCategory,
        deleteChart,
        editChart,
        copyChart,
        moveChart,
    } = useProjectManager();

    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
        if (typeof window === 'undefined') return null;
        const fromQuery = new URLSearchParams(window.location.search).get('projectId');
        if (fromQuery) {
            const parsedQuery = Number(fromQuery);
            if (Number.isFinite(parsedQuery)) return parsedQuery;
        }
        const raw = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
    });
    const [editTarget, setEditTarget] = useState<ProjectSummary | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [editDashboardTarget, setEditDashboardTarget] = useState<DashboardDto | null>(null);
    const [deleteDashboardTarget, setDeleteDashboardTarget] = useState<DashboardDto | null>(null);
    const [dashboardMutationError, setDashboardMutationError] = useState<string | null>(null);
    const [editChartTarget, setEditChartTarget] = useState<ProjectManagerEditChartTarget | null>(null);
    const [deleteChartTarget, setDeleteChartTarget] = useState<{
        projectId: number;
        dashboardId: number;
        categoryId: number;
        graphId: number;
        name: string;
    } | null>(null);
    const [chartMutationError, setChartMutationError] = useState<string | null>(null);
    const [copyChartTarget, setCopyChartTarget] = useState<{
        projectId: number;
        dashboardId: number;
        categoryId: number;
        graphId: number;
        name: string;
        sourceWebsiteId?: string;
    } | null>(null);
    const [copyChartError, setCopyChartError] = useState<string | null>(null);
    const [moveChartTarget, setMoveChartTarget] = useState<ProjectManagerMoveChartTarget | null>(null);
    const [moveChartTargetProjectId, setMoveChartTargetProjectId] = useState<number>(0);
    const [moveChartTargetDashboardId, setMoveChartTargetDashboardId] = useState<number>(0);
    const [moveChartTargetCategoryId, setMoveChartTargetCategoryId] = useState<number>(0);
    const [moveChartError, setMoveChartError] = useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [projectSearch, setProjectSearch] = useState('');
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false);
    const [newDashboardName, setNewDashboardName] = useState('');
    const [newDashboardDescription, setNewDashboardDescription] = useState('');
    const [createDashboardError, setCreateDashboardError] = useState<string | null>(null);
    const [createTabTarget, setCreateTabTarget] = useState<{ dashboardId: number; dashboardName: string } | null>(null);
    const [newTabName, setNewTabName] = useState('');
    const [createTabError, setCreateTabError] = useState<string | null>(null);
    const [renameTabTarget, setRenameTabTarget] = useState<{ projectId: number; dashboardId: number; categoryId: number; dashboardName: string; tabName: string } | null>(null);
    const [renameTabName, setRenameTabName] = useState('');
    const [renameTabError, setRenameTabError] = useState<string | null>(null);
    const [deleteTabTarget, setDeleteTabTarget] = useState<{ projectId: number; dashboardId: number; categoryId: number; dashboardName: string; tabName: string; chartCount: number; categoryCount: number } | null>(null);
    const [deleteTabError, setDeleteTabError] = useState<string | null>(null);
    const [isImportChartOpen, setIsImportChartOpen] = useState(false);
    const [importChartError, setImportChartError] = useState<string | null>(null);
    const [importChartDefaultDashboardId, setImportChartDefaultDashboardId] = useState<number | null>(null);
    const [showErrorAlert, setShowErrorAlert] = useState(true);
    const [showMessageAlert, setShowMessageAlert] = useState(true);
    const [showNoProjectsAlert, setShowNoProjectsAlert] = useState(true);
    const [showNoSearchResultsAlert, setShowNoSearchResultsAlert] = useState(true);
    const [showNoSelectedProjectAlert, setShowNoSelectedProjectAlert] = useState(true);
    const [expandedDashboards, setExpandedDashboards] = useState<Set<number>>(new Set());
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const projectNameInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (projectSummaries.length === 0) {
            return;
        }
        if (!selectedProjectId || !projectSummaries.some((item) => item.project.id === selectedProjectId)) {
            setSelectedProjectId(projectSummaries[0].project.id);
        }
    }, [projectSummaries, selectedProjectId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (projectSummaries.length === 0) return;
        if (!selectedProjectId) {
            window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, String(selectedProjectId));
    }, [selectedProjectId, projectSummaries.length]);

    const selectedProject = useMemo(
        () => projectSummaries.find((item) => item.project.id === selectedProjectId) ?? null,
        [projectSummaries, selectedProjectId],
    );

    const filteredProjectSummaries = useMemo(() => {
        const query = projectSearch.trim().toLowerCase();
        const filtered = !query
            ? projectSummaries
            : projectSummaries.filter((summary) => {
            const name = summary.project.name.toLowerCase();
            const description = (summary.project.description ?? '').toLowerCase();
            return name.includes(query) || description.includes(query);
        });
        return [...filtered].sort((a, b) => a.project.name.localeCompare(b.project.name, 'nb', { sensitivity: 'base' }));
    }, [projectSummaries, projectSearch]);

    const fileRows = useMemo<FileTableRow[]>(() => {
        if (!selectedProject) return [];

        return selectedProject.dashboards.flatMap((dashboard) => {
            const dashboardRow: FileTableRow = {
                id: `dashboard-${dashboard.id}`,
                type: 'dashboard',
                name: dashboard.name,
                indentLevel: 0,
                dashboardId: dashboard.id,
                dashboardName: dashboard.name,
            };

            const hasMultipleCategories = dashboard.categories.length > 1;

            const rows: FileTableRow[] = [dashboardRow];
            if (!hasMultipleCategories) {
                const singleCategoryId = dashboard.categories[0]?.id;
                const visibleCharts = dashboard.charts.filter((chart) => chart.graphType !== 'TEXT');
                rows.push(...visibleCharts.map((chart) => ({
                    id: `chart-${chart.id}`,
                    type: 'chart' as const,
                    name: chart.name,
                    indentLevel: 1 as const,
                    dashboardId: dashboard.id,
                    dashboardName: dashboard.name,
                    categoryId: chart.categoryId ?? singleCategoryId,
                    graphType: chart.graphType,
                    graphId: chart.id,
                    variantCount: chart.variantCount,
                })));
                return rows;
            }

            dashboard.categories.forEach((category) => {
                rows.push({
                    id: `category-${dashboard.id}-${category.id}`,
                    type: 'category',
                    name: category.name,
                    indentLevel: 1,
                    categoryName: category.name,
                    dashboardId: dashboard.id,
                    dashboardName: dashboard.name,
                    categoryId: category.id,
                });

                const visibleCharts = category.charts.filter((chart) => chart.graphType !== 'TEXT');
                rows.push(...visibleCharts.map((chart) => ({
                    id: `chart-${chart.id}`,
                    type: 'chart' as const,
                    name: chart.name,
                    indentLevel: 2 as const,
                    dashboardId: dashboard.id,
                    dashboardName: dashboard.name,
                    categoryId: chart.categoryId ?? category.id,
                    categoryName: category.name,
                    graphType: chart.graphType,
                    graphId: chart.id,
                    variantCount: chart.variantCount,
                })));
            });

            return rows;
        });
    }, [selectedProject]);

    const getCategoryDisplayName = (name?: string) => {
        const trimmed = name?.trim() ?? '';
        if (!trimmed) return 'Fane 1';
        if (trimmed.toLowerCase() === 'general') return 'Fane 1';
        return trimmed;
    };

    const getCategoryMeta = (dashboardId: number, categoryId?: number) => {
        if (!selectedProject || !categoryId) return null;
        const dashboard = selectedProject.dashboards.find((item) => item.id === dashboardId);
        if (!dashboard) return null;
        const category = dashboard.categories.find((item) => item.id === categoryId);
        if (!category) return null;
        return {
            dashboard,
            category,
            chartCount: category.charts.length,
            categoryCount: dashboard.categories.length,
        };
    };

    useEffect(() => {
        if (error) setShowErrorAlert(true);
    }, [error]);

    useEffect(() => {
        if (message) setShowMessageAlert(true);
    }, [message]);

    useEffect(() => {
        setShowNoProjectsAlert(true);
    }, [projectSummaries.length]);

    useEffect(() => {
        setShowNoSearchResultsAlert(true);
    }, [projectSearch, filteredProjectSummaries.length, projectSummaries.length]);

    useEffect(() => {
        setShowNoSelectedProjectAlert(true);
    }, [selectedProjectId, projectSummaries.length]);

    useEffect(() => {
        const selectedSummary = projectSummaries.find((item) => item.project.id === selectedProjectId);
        if (!selectedSummary) {
            setExpandedDashboards(new Set());
            setExpandedCategories(new Set());
            return;
        }
        setExpandedDashboards(new Set());
        setExpandedCategories(new Set());
    }, [selectedProjectId, projectSummaries]);

    const openEdit = (summary: ProjectSummary) => {
        setLocalError(null);
        setEditTarget(summary);
        setEditName(summary.project.name);
        setEditDescription(summary.project.description ?? '');
    };

    const openDelete = (summary: ProjectSummary) => {
        setLocalError(null);
        setDeleteTarget(summary);
    };

    const handleEditSave = async () => {
        if (!editTarget) return;
        if (!editName.trim()) {
            setLocalError('Teamnavnnavn er påkrevd');
            return;
        }
        setLocalError(null);
        await editProject(editTarget.project.id, editName, editDescription);
        setEditTarget(null);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        if (deleteTarget.dashboardCount > 0 || deleteTarget.chartCount > 0) {
            setLocalError('Team med dashboard eller grafer kan ikke slettes');
            return;
        }
        setLocalError(null);
        await deleteProject(deleteTarget.project.id);
        setDeleteTarget(null);
    };

    const openEditDashboard = (projectId: number, dashboardId: number, name: string) => {
        setDashboardMutationError(null);
        const projectSummary = projectSummaries.find((summary) => summary.project.id === projectId);
        const dashboardSummary = projectSummary?.dashboards.find((dashboard) => dashboard.id === dashboardId);
        setEditDashboardTarget({
            id: dashboardId,
            projectId,
            name: dashboardSummary?.name ?? name,
            description: dashboardSummary?.description,
        });
    };

    const openDeleteDashboard = (projectId: number, dashboardId: number, name: string) => {
        setDashboardMutationError(null);
        setDeleteDashboardTarget({ id: dashboardId, projectId, name });
    };

    const openCreateDashboard = () => {
        setCreateDashboardError(null);
        setNewDashboardName('');
        setNewDashboardDescription('');
        setIsCreateDashboardOpen(true);
    };

    const handleSaveDashboard = async (params: { name: string; description?: string }) => {
        if (!editDashboardTarget) return;
        const result = await editDashboard(editDashboardTarget.projectId, editDashboardTarget.id, params);
        if (result === undefined) return;
        setEditDashboardTarget(null);
    };

    const handleDeleteDashboard = async () => {
        if (!deleteDashboardTarget) return;
        if (selectedDashboardHasCharts) {
            setDashboardMutationError('Dashboard med grafer kan ikke slettes');
            return;
        }
        await deleteDashboard(deleteDashboardTarget.projectId, deleteDashboardTarget.id);
        setDeleteDashboardTarget(null);
    };

    const handleCreateDashboard = async () => {
        if (!selectedProject) return;
        if (!newDashboardName.trim()) {
            setCreateDashboardError('Dashboardnavn er påkrevd');
            return;
        }
        setCreateDashboardError(null);
        await createDashboard(
            selectedProject.project.id,
            newDashboardName,
            newDashboardDescription || undefined,
        );
        setIsCreateDashboardOpen(false);
        setNewDashboardName('');
        setNewDashboardDescription('');
    };

    const openCreateDashboardTab = (dashboardId: number) => {
        if (!selectedProject) return;
        const dashboard = selectedProject.dashboards.find((item) => item.id === dashboardId);
        if (!dashboard) return;
        setCreateTabError(null);
        setNewTabName('');
        setCreateTabTarget({ dashboardId: dashboard.id, dashboardName: dashboard.name });
    };

    const handleCreateDashboardTab = async () => {
        if (!selectedProject || !createTabTarget) return;
        if (!newTabName.trim()) {
            setCreateTabError('Fanenavn er påkrevd');
            return;
        }
        setCreateTabError(null);
        await createCategory(selectedProject.project.id, createTabTarget.dashboardId, newTabName.trim());
        setCreateTabTarget(null);
        setNewTabName('');
    };

    const openRenameDashboardTab = (row: FileTableRow) => {
        if (!selectedProject || row.type !== 'category' || !row.categoryId) return;
        setRenameTabError(null);
        setRenameTabName(getCategoryDisplayName(row.name));
        setRenameTabTarget({
            projectId: selectedProject.project.id,
            dashboardId: row.dashboardId,
            categoryId: row.categoryId,
            dashboardName: row.dashboardName,
            tabName: getCategoryDisplayName(row.name),
        });
    };

    const handleRenameDashboardTab = async () => {
        if (!renameTabTarget) return;
        if (!renameTabName.trim()) {
            setRenameTabError('Fanenavn er påkrevd');
            return;
        }
        setRenameTabError(null);
        await updateCategory(renameTabTarget.projectId, renameTabTarget.dashboardId, renameTabTarget.categoryId, renameTabName);
        setRenameTabTarget(null);
        setRenameTabName('');
    };

    const openDeleteDashboardTab = (row: FileTableRow) => {
        if (!selectedProject || row.type !== 'category' || !row.categoryId) return;
        const meta = getCategoryMeta(row.dashboardId, row.categoryId);
        if (!meta) return;
        setDeleteTabError(null);
        setDeleteTabTarget({
            projectId: selectedProject.project.id,
            dashboardId: row.dashboardId,
            categoryId: row.categoryId,
            dashboardName: row.dashboardName,
            tabName: getCategoryDisplayName(row.name),
            chartCount: meta.chartCount,
            categoryCount: meta.categoryCount,
        });
    };

    const handleDeleteDashboardTab = async () => {
        if (!deleteTabTarget) return;
        if (deleteTabTarget.categoryCount <= 1) {
            setDeleteTabError('Kan ikke slette siste fane');
            return;
        }
        if (deleteTabTarget.chartCount > 0) {
            setDeleteTabError('Faner som inneholder grafer kan ikke slettes');
            return;
        }
        setDeleteTabError(null);
        await deleteCategory(deleteTabTarget.projectId, deleteTabTarget.dashboardId, deleteTabTarget.categoryId);
        setDeleteTabTarget(null);
    };

    const openImportChart = (defaultDashboardId?: number) => {
        setImportChartError(null);
        setImportChartDefaultDashboardId(defaultDashboardId ?? null);
        setIsImportChartOpen(true);
    };

    const handleImportChart = async (params: {
        dashboardId?: number;
        name: string;
        graphType: ImportGraphType;
        width: string;
        sqlText: string;
    }) => {
        if (!selectedProject) return;
        if (!params.dashboardId) {
            setImportChartError('Velg dashboard');
            return;
        }

        const parsedWidth = Number(params.width);
        if (!Number.isFinite(parsedWidth)) {
            setImportChartError('Bredde må være et tall mellom 1 og 100');
            return;
        }
        const normalizedWidth = Math.max(1, Math.min(100, Math.round(parsedWidth)));

        setImportChartError(null);

        // Resolve a category for the target dashboard (use first existing or create a default)
        let categoryId: number;
        try {
            const categories = await api.fetchCategories(selectedProject.project.id, params.dashboardId);
            if (categories.length > 0) {
                categoryId = categories[0].id;
            } else {
                const created = await api.createCategory(selectedProject.project.id, params.dashboardId, 'Standard');
                categoryId = created.id;
            }
        } catch (err: unknown) {
            setImportChartError(err instanceof Error ? err.message : 'Kunne ikke hente eller opprette kategori');
            return;
        }

        const result = await importChart(selectedProject.project.id, params.dashboardId, categoryId, {
            name: params.name,
            graphType: params.graphType,
            width: normalizedWidth,
            sqlText: params.sqlText,
        });
        if (!result.ok) {
            setImportChartError(result.error);
            return;
        }
        setIsImportChartOpen(false);
    };

    const toggleCreateProject = () => {
        setIsCreateOpen((prev) => !prev);
        setTimeout(() => {
            projectNameInputRef.current?.focus();
        }, 0);
    };

    const handleCreateProject = async () => {
        const createdProjectId = await createProject();
        if (createdProjectId == null) return;
        setSelectedProjectId(createdProjectId);
        setIsCreateOpen(false);
    };

    const getChartIcon = (graphType?: string) => {
        if (graphType === 'LINE') return <LineGraphIcon aria-hidden fontSize="1rem" />;
        if (graphType === 'BAR') return <BarChartIcon aria-hidden fontSize="1rem" />;
        if (graphType === 'PIE') return <PieChartIcon aria-hidden fontSize="1rem" />;
        return <TableIcon aria-hidden fontSize="1rem" />;
    };

    const getChartTypeLabel = (graphType?: string) => {
        if (graphType === 'LINE') return 'Linjediagram';
        if (graphType === 'BAR') return 'Stolpediagram';
        if (graphType === 'PIE') return 'Sektordiagram';
        if (graphType === 'TABLE') return 'Tabell';
        return 'Graf';
    };

    const getVariantCountLabel = (variantCount?: number) => {
        if (!variantCount || variantCount <= 1) return null;
        return `(${variantCount} varianter)`;
    };

    const normalizeGraphType = (graphType?: string): GraphType => {
        if (graphType === 'LINE' || graphType === 'BAR' || graphType === 'PIE' || graphType === 'TABLE') return graphType;
        return 'TABLE';
    };

    const openEditChart = async (projectId: number, row: FileTableRow) => {
        if (!row.graphId || !row.categoryId) return;
        setChartMutationError(null);
        try {
            const [queryItems, graphItems] = await Promise.all([
                api.fetchQueries(projectId, row.dashboardId, row.categoryId, row.graphId),
                api.fetchGraphs(projectId, row.dashboardId, row.categoryId),
            ]);
            if (queryItems.length === 0) {
                setChartMutationError('Grafen mangler SQL/query og kan ikke redigeres. Dette skjer ofte hvis import feilet under lagring.');
                return;
            }
            const sortedQueries = [...queryItems].sort((a, b) => {
                const aOrdering = a.ordering ?? Number.MAX_SAFE_INTEGER;
                const bOrdering = b.ordering ?? Number.MAX_SAFE_INTEGER;
                if (aOrdering !== bOrdering) return aOrdering - bOrdering;
                return a.id - b.id;
            });
            const primaryQuery = sortedQueries[0];
            if (!primaryQuery) {
                setChartMutationError('Grafen mangler SQL/query og kan ikke redigeres. Dette skjer ofte hvis import feilet under lagring.');
                return;
            }
            const graph = graphItems.find((item) => item.id === row.graphId);
            const chart: OversiktChart = {
                id: `projectmanager-${row.graphId}`,
                title: row.name,
                type: 'table',
                sql: primaryQuery.sqlText,
                width: graph?.width ? String(graph.width) : '50',
                graphId: row.graphId,
                graphType: normalizeGraphType(row.graphType ?? graph?.graphType),
                queryId: primaryQuery.id,
                queryName: primaryQuery.name,
                categoryId: row.categoryId!,
                variants: sortedQueries.map((item) => ({
                    queryId: item.id,
                    queryName: item.name,
                    sql: item.sqlText,
                })),
            };
            setEditChartTarget({
                projectId,
                dashboardId: row.dashboardId,
                categoryId: row.categoryId!,
                chart,
                defaultWebsiteId: extractWebsiteId(primaryQuery.sqlText),
            });
        } catch (err: unknown) {
            setChartMutationError(err instanceof Error ? err.message : 'Kunne ikke hente grafdata');
        }
    };

    const openDeleteChart = (projectId: number, row: FileTableRow) => {
        if (!row.graphId || !row.categoryId) return;
        setChartMutationError(null);
        setDeleteChartTarget({
            projectId,
            dashboardId: row.dashboardId,
            categoryId: row.categoryId,
            graphId: row.graphId,
            name: row.name,
        });
    };

    const openCopyChart = async (projectId: number, row: FileTableRow) => {
        if (!row.graphId || !row.categoryId) return;
        setCopyChartError(null);
        let sourceWebsiteId: string | undefined;
        try {
            const sourceQueries = await api.fetchQueries(projectId, row.dashboardId, row.categoryId, row.graphId);
            const sourceSql = sourceQueries[0]?.sqlText;
            sourceWebsiteId = sourceSql ? extractWebsiteId(sourceSql) : undefined;
        } catch {
            sourceWebsiteId = undefined;
        }

        setCopyChartTarget({
            projectId,
            dashboardId: row.dashboardId,
            categoryId: row.categoryId,
            graphId: row.graphId,
            name: row.name,
            sourceWebsiteId,
        });
    };

    const openMoveChart = (projectId: number, projectName: string, row: FileTableRow) => {
        if (!row.graphId || !row.categoryId) return;
        setMoveChartError(null);
        setMoveChartTargetProjectId(projectId);
        setMoveChartTargetDashboardId(row.dashboardId);
        setMoveChartTargetCategoryId(row.categoryId);
        setMoveChartTarget({
            projectId,
            projectName,
            dashboardId: row.dashboardId,
            dashboardName: row.dashboardName,
            categoryId: row.categoryId,
            graphId: row.graphId,
            name: row.name,
        });
    };

    const handleSaveChart = async (params: {
        name: string;
        graphType: GraphType;
        sqlText: string;
        width: number;
        websiteId?: string;
        dashboardId?: number;
        newVariants?: Array<{ name: string; sqlText: string }>;
        targetQueryId?: number;
        targetQueryName?: string;
    }) => {
        if (!editChartTarget) return;
        setChartMutationError(null);
        const result = await editChart(editChartTarget.projectId, editChartTarget.dashboardId, editChartTarget.categoryId, editChartTarget.chart.graphId, {
            name: params.name,
            graphType: params.graphType,
            width: params.width,
            sqlText: params.sqlText,
            queryId: params.targetQueryId,
            queryName: params.targetQueryName,
            newVariants: params.newVariants,
            websiteId: params.websiteId,
            targetDashboardId: params.dashboardId,
        });
        if (!result.ok) {
            setChartMutationError(result.error);
            return;
        }
        setEditChartTarget(null);
    };

    const handleDeleteChart = async () => {
        if (!deleteChartTarget) return;
        setChartMutationError(null);
        await deleteChart(deleteChartTarget.projectId, deleteChartTarget.dashboardId, deleteChartTarget.categoryId, deleteChartTarget.graphId);
        setDeleteChartTarget(null);
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
        setCopyChartError(null);

        // Resolve a target category (use selected if valid, else first existing or create a default)
        let targetCategoryId: number;
        try {
            const categories = await api.fetchCategories(params.projectId, params.dashboardId);
            if (params.categoryId && categories.some((category) => category.id === params.categoryId)) {
                targetCategoryId = params.categoryId;
            } else if (categories.length > 0) {
                targetCategoryId = categories[0].id;
            } else {
                const created = await api.createCategory(params.projectId, params.dashboardId, 'Standard');
                targetCategoryId = created.id;
            }
        } catch (err: unknown) {
            setCopyChartError(err instanceof Error ? err.message : 'Kunne ikke hente eller opprette kategori');
            return;
        }

        const result = await copyChart({
            sourceProjectId: copyChartTarget.projectId,
            sourceDashboardId: copyChartTarget.dashboardId,
            sourceCategoryId: copyChartTarget.categoryId,
            sourceGraphId: copyChartTarget.graphId,
            targetProjectId: params.projectId,
            targetDashboardId: params.dashboardId,
            targetCategoryId,
            chartName: params.chartName,
            websiteId: params.websiteId,
        });
        if (!result.ok) {
            setCopyChartError(result.error);
            return;
        }
        setCopyChartTarget(null);
    };

    const moveChartTargetProjectSummary = useMemo(() => {
        if (!moveChartTargetProjectId) return null;
        return projectSummaries.find((item) => item.project.id === moveChartTargetProjectId) ?? null;
    }, [projectSummaries, moveChartTargetProjectId]);

    const moveChartDashboardOptions = useMemo(() => {
        if (!moveChartTargetProjectSummary) return [];
        return moveChartTargetProjectSummary.dashboards.map((dashboard) => ({
            id: dashboard.id,
            name: dashboard.name,
        }));
    }, [moveChartTargetProjectSummary]);

    const moveChartTargetDashboardSummary = useMemo(() => {
        if (!moveChartTargetProjectSummary || !moveChartTargetDashboardId) return null;
        return moveChartTargetProjectSummary.dashboards.find((dashboard) => dashboard.id === moveChartTargetDashboardId) ?? null;
    }, [moveChartTargetProjectSummary, moveChartTargetDashboardId]);

    const moveChartCategoryOptions = useMemo(() => {
        if (!moveChartTargetDashboardSummary) return [];
        return moveChartTargetDashboardSummary.categories.map((category) => ({
            id: category.id,
            name: getCategoryDisplayName(category.name),
        }));
    }, [moveChartTargetDashboardSummary]);

    useEffect(() => {
        if (!moveChartTarget) return;
        if (!moveChartTargetProjectId) {
            setMoveChartTargetDashboardId(0);
            setMoveChartTargetCategoryId(0);
            return;
        }

        const targetProject = projectSummaries.find((item) => item.project.id === moveChartTargetProjectId);
        const dashboards = targetProject?.dashboards ?? [];
        if (dashboards.length === 0) {
            setMoveChartTargetDashboardId(0);
            setMoveChartTargetCategoryId(0);
            return;
        }

        setMoveChartTargetDashboardId((prev) => {
            if (prev && dashboards.some((dashboard) => dashboard.id === prev)) return prev;
            const sameNameDashboard = dashboards.find(
                (dashboard) => dashboard.name.trim().toLowerCase() === moveChartTarget.dashboardName.trim().toLowerCase(),
            );
            return sameNameDashboard?.id ?? dashboards[0].id;
        });
    }, [projectSummaries, moveChartTarget, moveChartTargetProjectId]);

    useEffect(() => {
        if (!moveChartTargetDashboardSummary) {
            setMoveChartTargetCategoryId(0);
            return;
        }
        const categories = moveChartTargetDashboardSummary.categories;
        if (categories.length === 0) {
            setMoveChartTargetCategoryId(0);
            return;
        }
        setMoveChartTargetCategoryId((prev) => {
            if (prev && categories.some((category) => category.id === prev)) return prev;
            const sameCategory = moveChartTarget
                ? categories.find((category) => category.id === moveChartTarget.categoryId)
                : null;
            return sameCategory?.id ?? categories[0].id;
        });
    }, [moveChartTargetDashboardSummary, moveChartTarget]);

    const handleMoveChart = async () => {
        if (!moveChartTarget) return;
        if (!moveChartTargetProjectId) {
            setMoveChartError('Velg team');
            return;
        }
        if (!moveChartTargetDashboardId) {
            setMoveChartError('Velg dashboard');
            return;
        }
        if (!moveChartTargetCategoryId && (moveChartTargetDashboardSummary?.categories.length ?? 0) > 1) {
            setMoveChartError('Velg fane');
            return;
        }
        if (
            moveChartTargetProjectId === moveChartTarget.projectId
            && moveChartTargetDashboardId === moveChartTarget.dashboardId
            && moveChartTargetCategoryId === moveChartTarget.categoryId
        ) {
            setMoveChartError('Velg en annen fane, dashboard eller team for flytting');
            return;
        }

        setMoveChartError(null);

        let targetCategoryId: number;
        try {
            const categories = await api.fetchCategories(moveChartTargetProjectId, moveChartTargetDashboardId);
            if (moveChartTargetCategoryId && categories.some((category) => category.id === moveChartTargetCategoryId)) {
                targetCategoryId = moveChartTargetCategoryId;
            } else if (categories.length > 0) {
                targetCategoryId = categories[0].id;
            } else {
                const created = await api.createCategory(moveChartTargetProjectId, moveChartTargetDashboardId, 'Fane 1');
                targetCategoryId = created.id;
            }
        } catch (err: unknown) {
            setMoveChartError(err instanceof Error ? err.message : 'Kunne ikke hente eller opprette kategori');
            return;
        }

        const result = await moveChart({
            sourceProjectId: moveChartTarget.projectId,
            sourceDashboardId: moveChartTarget.dashboardId,
            sourceCategoryId: moveChartTarget.categoryId,
            sourceGraphId: moveChartTarget.graphId,
            targetProjectId: moveChartTargetProjectId,
            targetDashboardId: moveChartTargetDashboardId,
            targetCategoryId,
        });
        if (!result.ok) {
            setMoveChartError(result.error);
            return;
        }

        setMoveChartTarget(null);
        setMoveChartTargetProjectId(0);
        setMoveChartTargetDashboardId(0);
        setMoveChartTargetCategoryId(0);
    };

    const projectOptions: ProjectDto[] = useMemo(
        () => projectSummaries.map((summary) => summary.project),
        [projectSummaries],
    );

    const selectedDashboardHasCharts = useMemo(() => {
        if (!deleteDashboardTarget) return false;
        const project = projectSummaries.find((item) => item.project.id === deleteDashboardTarget.projectId);
        if (!project) return false;
        const dashboard = project.dashboards.find((item) => item.id === deleteDashboardTarget.id);
        return (dashboard?.charts.length ?? 0) > 0;
    }, [projectSummaries, deleteDashboardTarget]);

    const selectedProjectDashboardOptions = useMemo(() => {
        if (!selectedProject) return [];
        return selectedProject.dashboards.map((dashboard) => ({
            id: dashboard.id,
            name: dashboard.name,
        }));
    }, [selectedProject]);

    const isInitialLoading = loading && projectSummaries.length === 0 && !error;
    const categoryRowKeys = useMemo(() => {
        const keys = new Set<string>();
        fileRows.forEach((row) => {
            if (row.type === 'category' && row.categoryId) keys.add(`${row.dashboardId}-${row.categoryId}`);
        });
        return keys;
    }, [fileRows]);
    const visibleFileRows = useMemo(
        () =>
            fileRows.filter((row) => {
                if (row.type === 'dashboard') return true;
                if (!expandedDashboards.has(row.dashboardId)) return false;
                if (row.type === 'category') return true;
                if (!row.categoryId) return true;
                const categoryKey = `${row.dashboardId}-${row.categoryId}`;
                if (categoryRowKeys.has(categoryKey)) return expandedCategories.has(categoryKey);
                return true;
            }),
        [fileRows, expandedDashboards, expandedCategories, categoryRowKeys],
    );
    const renderAddMenu = (dashboardId: number) => (
            <ActionMenu>
                <ActionMenu.Trigger>
                    <Button size="xsmall" variant="secondary">
                    Legg til
                    </Button>
                </ActionMenu.Trigger>
            <ActionMenu.Content align="start">
                <ActionMenu.Item as="a" href="/grafbygger">
                    Legg til graf
                </ActionMenu.Item>
                <ActionMenu.Item onClick={() => openImportChart(dashboardId)}>
                    Importer graf
                </ActionMenu.Item>
                <ActionMenu.Item onClick={() => openCreateDashboardTab(dashboardId)}>
                    Legg til fane
                </ActionMenu.Item>
            </ActionMenu.Content>
        </ActionMenu>
    );

    return (
        <>
            <ProjectManagerLayout
                title="Dashboard"
                description="Oversikt over dashboard og grafer."
                sidebar={
                    <div className="space-y-2">
                        <form role="search" className="mb-3 flex items-end gap-2">
                            <div className="flex-1">
                                <Search
                                    label="Finn team"
                                    variant="simple"
                                    hideLabel={false}
                                    value={projectSearch}
                                    onChange={setProjectSearch}
                                    onClear={() => setProjectSearch('')}
                                    size="small"
                                />
                            </div>
                            <Tooltip content={isCreateOpen ? 'Lukk nytt team' : 'Nytt team'} describesChild>
                                <Button
                                    type="button"
                                    size="small"
                                    variant="secondary"
                                    icon={<Plus aria-hidden size={16} />}
                                    aria-label={isCreateOpen ? 'Lukk nytt team' : 'Nytt team'}
                                    onClick={toggleCreateProject}
                                />
                            </Tooltip>
                        </form>

                        {isInitialLoading && (
                            <div className="py-4 flex justify-center">
                                <Loader size="medium" title="Laster team" />
                            </div>
                        )}
                        {!isInitialLoading && projectSummaries.length === 0 && showNoProjectsAlert && (
                            <Alert variant="info" size="small" closeButton onClose={() => setShowNoProjectsAlert(false)}>
                                Ingen team funnet.
                            </Alert>
                        )}
                        {!isInitialLoading && projectSummaries.length > 0 && filteredProjectSummaries.length === 0 && showNoSearchResultsAlert && (
                            <Alert variant="info" size="small" closeButton onClose={() => setShowNoSearchResultsAlert(false)}>
                                Ingen treff for sok.
                            </Alert>
                        )}

                        {!isInitialLoading && filteredProjectSummaries.map((summary) => {
                            const isActive = summary.project.id === selectedProjectId;
                            return (
                                <div
                                    key={summary.project.id}
                                    className={`w-full text-left px-3 py-2 rounded-md border transition ${isActive
                                        ? 'bg-[var(--ax-bg-accent-moderate)] border-[var(--ax-border-accent)]'
                                        : 'bg-[var(--ax-bg-default)] border-[var(--ax-border-neutral-subtle)] hover:bg-[var(--ax-bg-neutral-moderate)]'
                                        }`}
                                >
                                    <button
                                        type="button"
                                        className="w-full text-left px-0.5"
                                        onClick={() => setSelectedProjectId(summary.project.id)}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="font-medium text-sm truncate">{summary.project.name}</div>
                                            <div className="flex items-center gap-3 text-xs text-[var(--ax-text-subtle)] shrink-0">
                                                <span
                                                    className="inline-flex items-center gap-1"
                                                    title={`${summary.dashboardCount} dashboard`}
                                                >
                                                    <SquareGridIcon aria-hidden fontSize="0.9rem" />
                                                    {summary.dashboardCount}
                                                    <span className="sr-only"> dashboard</span>
                                                </span>
                                                <span
                                                    className="inline-flex items-center gap-1"
                                                    title={`${summary.chartCount} grafer`}
                                                >
                                                    <BarChartIcon aria-hidden fontSize="0.9rem" />
                                                    {summary.chartCount}
                                                    <span className="sr-only"> grafer</span>
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            );
                        })}

                        {!isInitialLoading && (
                            <div className="pt-2">
                            <Button
                                type="button"
                                size="small"
                                variant="secondary"
                                icon={<Plus aria-hidden size={16} />}
                                onClick={toggleCreateProject}
                            >
                                Nytt team
                            </Button>
                            </div>
                        )}
                    </div>
                }
            >
                <div className="space-y-4">
                    {error && showErrorAlert && (
                        <Alert variant="error" closeButton onClose={() => setShowErrorAlert(false)}>
                            {error}
                        </Alert>
                    )}
                    {message && showMessageAlert && (
                        <Alert variant="success" closeButton onClose={() => setShowMessageAlert(false)}>
                            {message}
                        </Alert>
                    )}
                    {chartMutationError && !editChartTarget && !deleteChartTarget && !moveChartTarget && (
                        <Alert variant="error" closeButton onClose={() => setChartMutationError(null)}>
                            {chartMutationError}
                        </Alert>
                    )}

                    {isInitialLoading && (
                        <div className="py-8 flex justify-center">
                            <Loader size="xlarge" title="Laster team og dashboard" />
                        </div>
                    )}

                    {!isInitialLoading && !selectedProject && showNoSelectedProjectAlert && (
                        <Alert variant="info" size="small" closeButton onClose={() => setShowNoSelectedProjectAlert(false)}>
                            Velg et team for a se dashboard og grafer.
                        </Alert>
                    )}

                    {!isInitialLoading && selectedProject && (
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                                <Heading level="2" size="small">{selectedProject.project.name}</Heading>
                                {selectedProject.project.description && (
                                    <BodyShort size="small" className="text-[var(--ax-text-default)] opacity-80">
                                        {selectedProject.project.description}
                                    </BodyShort>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <ActionMenu>
                                    <Tooltip content="Legg til dashboard eller graf" describesChild>
                                        <ActionMenu.Trigger>
                                            <Button type="button" size="xsmall" variant="secondary">
                                                + legg til
                                            </Button>
                                        </ActionMenu.Trigger>
                                    </Tooltip>
                                    <ActionMenu.Content align="end">
                                        <ActionMenu.Item onClick={openCreateDashboard}>
                                            Legg til dashboard
                                        </ActionMenu.Item>
                                        <ActionMenu.Item as="a" href="/grafbygger">
                                            Legg til graf
                                        </ActionMenu.Item>
                                        <ActionMenu.Item
                                            onClick={() => openImportChart()}
                                            disabled={selectedProjectDashboardOptions.length === 0}
                                        >
                                            Importer graf
                                        </ActionMenu.Item>
                                    </ActionMenu.Content>
                                </ActionMenu>
                                <ActionMenu>
                                    <Tooltip content="Flere valg" describesChild>
                                        <ActionMenu.Trigger>
                                            <Button
                                                variant="tertiary"
                                                size="xsmall"
                                                icon={<MoreVertical aria-hidden />}
                                                aria-label={`Flere valg for ${selectedProject.project.name}`}
                                            />
                                        </ActionMenu.Trigger>
                                    </Tooltip>
                                    <ActionMenu.Content align="end">
                                        <ActionMenu.Item onClick={() => openEdit(selectedProject)}>
                                            Rediger team
                                        </ActionMenu.Item>
                                        <ActionMenu.Item onClick={() => openDelete(selectedProject)}>
                                            Slett team
                                        </ActionMenu.Item>
                                    </ActionMenu.Content>
                                </ActionMenu>
                            </div>
                        </div>
                    )}

                    {!isInitialLoading && selectedProject && fileRows.length === 0 && (
                        <div className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-[var(--ax-text-default)]">Teamet er tomt</span>
                                <Button size="xsmall" variant="secondary" onClick={openCreateDashboard}>
                                    Lag nytt dashboard
                                </Button>
                            </div>
                        </div>
                    )}

                    {!isInitialLoading && selectedProject && fileRows.length > 0 && (
                        <Table size="small" className="w-full">
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell scope="col">Dashboard</Table.HeaderCell>
                                    <Table.HeaderCell scope="col" className="w-12 sm:w-14 text-right">
                                        <span className="sr-only">Handlinger</span>
                                    </Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {visibleFileRows.map((row, index) => {
                                    const paddingClass = row.indentLevel === 2 ? 'pl-6 sm:pl-12' : row.indentLevel === 1 ? 'pl-3 sm:pl-6' : '';
                                    const overviewHref = `/oversikt?projectId=${selectedProject.project.id}&dashboardId=${row.dashboardId}${row.categoryId ? `&categoryId=${row.categoryId}` : ''}`;
                                    const isDashboardExpanded = expandedDashboards.has(row.dashboardId);
                                    const nextRow = visibleFileRows[index + 1];
                                    const isLastRowInDashboard = !nextRow || nextRow.dashboardId !== row.dashboardId;
                                    const categoryKey = row.categoryId ? `${row.dashboardId}-${row.categoryId}` : '';
                                    const isCategoryExpanded = row.type === 'category' && expandedCategories.has(categoryKey);
                                    const isRowCategoryExpanded = !!row.categoryId && expandedCategories.has(categoryKey);
                                    const hasCategoryRow = !!row.categoryId && categoryRowKeys.has(categoryKey);
                                    const isLastRowInCategory = hasCategoryRow
                                        && !nextRow
                                        ? true
                                        : hasCategoryRow && !!row.categoryId && !!nextRow && (
                                            nextRow.dashboardId !== row.dashboardId || nextRow.categoryId !== row.categoryId
                                        );
                                    return (
                                        <Fragment key={row.id}>
                                            <Table.Row>
                                                <Table.HeaderCell scope="row" className="w-full min-w-0">
                                                    <span className={`flex w-full min-w-0 items-center gap-2 overflow-hidden ${paddingClass}`}>
                                                        <span className="shrink-0 text-[var(--ax-text-subtle)]">
                                                            {row.type === 'dashboard' ? (
                                                                <button
                                                                    type="button"
                                                                    aria-label={`${isDashboardExpanded ? 'Skjul' : 'Vis'} innhold i ${row.name}`}
                                                                    aria-expanded={isDashboardExpanded}
                                                                    onClick={() => {
                                                                        setExpandedDashboards((prev) => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(row.dashboardId)) {
                                                                                next.delete(row.dashboardId);
                                                                            } else {
                                                                                next.add(row.dashboardId);
                                                                            }
                                                                            return next;
                                                                        });
                                                                    }}
                                                                    className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent hover:border-[var(--ax-border-neutral)] hover:bg-[var(--ax-bg-neutral-moderate)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
                                                                >
                                                                    {isDashboardExpanded ? <ChevronUp aria-hidden size={14} /> : <ChevronDown aria-hidden size={14} />}
                                                                </button>
                                                            ) : row.type === 'category' ? (
                                                                <button
                                                                    type="button"
                                                                    aria-label={`${isCategoryExpanded ? 'Skjul' : 'Vis'} grafer i ${getCategoryDisplayName(row.name)}`}
                                                                    aria-expanded={isCategoryExpanded}
                                                                    onClick={() => {
                                                                        if (!row.categoryId) return;
                                                                        setExpandedCategories((prev) => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(categoryKey)) {
                                                                                next.delete(categoryKey);
                                                                            } else {
                                                                                next.add(categoryKey);
                                                                            }
                                                                            return next;
                                                                        });
                                                                    }}
                                                                    className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent hover:border-[var(--ax-border-neutral)] hover:bg-[var(--ax-bg-neutral-moderate)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
                                                                >
                                                                    {isCategoryExpanded ? <ChevronUp aria-hidden size={14} /> : <ChevronDown aria-hidden size={14} />}
                                                                </button>
                                                            ) : (
                                                                <Tooltip content={getChartTypeLabel(row.graphType)}>
                                                                    <span
                                                                        className="inline-flex items-center"
                                                                        role="img"
                                                                        aria-label={getChartTypeLabel(row.graphType)}
                                                                    >
                                                                        {getChartIcon(row.graphType)}
                                                                    </span>
                                                                </Tooltip>
                                                            )}
                                                        </span>
                                                        <Link as={RouterLink} to={overviewHref} className="block min-w-0 flex-1 truncate">
                                                            {row.type === 'category'
                                                                ? getCategoryDisplayName(row.name)
                                                                : row.type === 'chart'
                                                                    ? `${row.name} ${getVariantCountLabel(row.variantCount) ?? ''}`.trim()
                                                                    : row.name}
                                                        </Link>
                                                    </span>
                                                </Table.HeaderCell>
                                                <Table.DataCell className="w-12 sm:w-14 text-right">
                                                    <div className="flex justify-end">
                                                        {row.type === 'chart' ? (
                                                            <ActionMenu>
                                                                <Tooltip content="Flere valg" describesChild>
                                                                    <ActionMenu.Trigger>
                                                                        <Button
                                                                            variant="tertiary"
                                                                            size="xsmall"
                                                                            icon={<MoreVertical aria-hidden />}
                                                                            aria-label={`Flere valg for ${row.name}`}
                                                                        />
                                                                    </ActionMenu.Trigger>
                                                                </Tooltip>
                                                                <ActionMenu.Content align="end">
                                                                    <ActionMenu.Item as={RouterLink} to={overviewHref}>
                                                                        Åpne i dashboard
                                                                    </ActionMenu.Item>
                                                                    {selectedProject && (
                                                                        <ActionMenu.Item
                                                                            onClick={() => void openEditChart(selectedProject.project.id, row)}
                                                                        >
                                                                            Rediger graf
                                                                        </ActionMenu.Item>
                                                                    )}
                                                                    {selectedProject && (
                                                                        <ActionMenu.Item
                                                                            onClick={() => void openCopyChart(selectedProject.project.id, row)}
                                                                        >
                                                                            Kopier graf
                                                                        </ActionMenu.Item>
                                                                    )}
                                                                    {selectedProject && (
                                                                        <ActionMenu.Item
                                                                            onClick={() => openMoveChart(selectedProject.project.id, selectedProject.project.name, row)}
                                                                        >
                                                                            Flytt graf
                                                                        </ActionMenu.Item>
                                                                    )}
                                                                    {selectedProject && (
                                                                        <ActionMenu.Item
                                                                            onClick={() => openDeleteChart(selectedProject.project.id, row)}
                                                                        >
                                                                            Slett graf
                                                                        </ActionMenu.Item>
                                                                    )}
                                                                </ActionMenu.Content>
                                                            </ActionMenu>
                                                        ) : row.type === 'dashboard' ? (
                                                            <ActionMenu>
                                                                <Tooltip content="Flere valg" describesChild>
                                                                    <ActionMenu.Trigger>
                                                                        <Button
                                                                            variant="tertiary"
                                                                            size="xsmall"
                                                                            icon={<MoreVertical aria-hidden />}
                                                                            aria-label={`Flere valg for ${row.name}`}
                                                                        />
                                                                    </ActionMenu.Trigger>
                                                                </Tooltip>
                                                                <ActionMenu.Content align="end">
                                                                    {selectedProject && (
                                                                        <ActionMenu.Item
                                                                            onClick={() => openCreateDashboardTab(row.dashboardId)}
                                                                        >
                                                                            Legg til fane
                                                                        </ActionMenu.Item>
                                                                    )}
                                                                    {selectedProject && (
                                                                        <ActionMenu.Item
                                                                            onClick={() => openEditDashboard(selectedProject.project.id, row.dashboardId, row.name)}
                                                                        >
                                                                            Endre info
                                                                        </ActionMenu.Item>
                                                                    )}
                                                                    {selectedProject && (
                                                                        <ActionMenu.Item
                                                                            onClick={() => openDeleteDashboard(selectedProject.project.id, row.dashboardId, row.name)}
                                                                        >
                                                                            Slett dashboard
                                                                        </ActionMenu.Item>
                                                                    )}
                                                                </ActionMenu.Content>
                                                            </ActionMenu>
                                                        ) : row.type === 'category' ? (
                                                            <ActionMenu>
                                                                <Tooltip content="Flere valg" describesChild>
                                                                    <ActionMenu.Trigger>
                                                                        <Button
                                                                            variant="tertiary"
                                                                            size="xsmall"
                                                                            icon={<MoreVertical aria-hidden />}
                                                                            aria-label={`Flere valg for ${getCategoryDisplayName(row.name)}`}
                                                                        />
                                                                    </ActionMenu.Trigger>
                                                                </Tooltip>
                                                                <ActionMenu.Content align="end">
                                                                    <ActionMenu.Item as={RouterLink} to={overviewHref}>
                                                                        Åpne fane i dashboard
                                                                    </ActionMenu.Item>
                                                                    <ActionMenu.Item onClick={() => openRenameDashboardTab(row)}>
                                                                        Gi nytt navn til fane
                                                                    </ActionMenu.Item>
                                                                    <ActionMenu.Item onClick={() => openDeleteDashboardTab(row)}>
                                                                        Slett fane
                                                                    </ActionMenu.Item>
                                                                </ActionMenu.Content>
                                                            </ActionMenu>
                                                        ) : null}
                                                    </div>
                                                </Table.DataCell>
                                            </Table.Row>
                                            {isRowCategoryExpanded && isLastRowInCategory && (
                                                <Table.Row>
                                                    <Table.HeaderCell scope="row">
                                                        <div className="inline-flex items-center gap-2 pl-6 sm:pl-12">
                                                            <span className="text-[var(--ax-text-subtle)]">
                                                                <Plus aria-hidden size={14} />
                                                            </span>
                                                            {renderAddMenu(row.dashboardId)}
                                                        </div>
                                                    </Table.HeaderCell>
                                                    <Table.DataCell />
                                                </Table.Row>
                                            )}
                                            {isDashboardExpanded && isLastRowInDashboard && (
                                                <Table.Row>
                                                    <Table.HeaderCell scope="row">
                                                        <div className="inline-flex items-center gap-2 pl-3 sm:pl-6">
                                                            <span className="text-[var(--ax-text-subtle)]">
                                                                <Plus aria-hidden size={14} />
                                                            </span>
                                                            {renderAddMenu(row.dashboardId)}
                                                        </div>
                                                    </Table.HeaderCell>
                                                    <Table.DataCell />
                                                </Table.Row>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </Table.Body>
                        </Table>
                    )}
                </div>
            </ProjectManagerLayout>

            <Modal
                open={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                header={{ heading: 'Nytt team' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-3">
                        <TextField
                            label="Navn"
                            size="small"
                            ref={projectNameInputRef}
                            value={newProjectName}
                            onChange={(event) => setNewProjectName(event.target.value)}
                        />
                        <TextField
                            label="Beskrivelse (valgfri)"
                            size="small"
                            value={newProjectDescription}
                            onChange={(event) => setNewProjectDescription(event.target.value)}
                        />
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button size="small" onClick={() => void handleCreateProject()} loading={loading}>
                        Opprett
                    </Button>
                    <Button size="small" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={!!editTarget}
                onClose={() => {
                    setEditTarget(null);
                    setLocalError(null);
                }}
                header={{ heading: 'Rediger team' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-4 pt-2">
                        {localError && <Alert variant="error" size="small">{localError}</Alert>}
                        <TextField
                            label="Teamnavn"
                            size="small"
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                        />
                        <TextField
                            label="Beskrivelse (valgfri)"
                            size="small"
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                        />
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleEditSave()} loading={loading}>
                        Lagre
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setEditTarget(null);
                            setLocalError(null);
                        }}
                        disabled={loading}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <EditDashboardDialog
                key={editDashboardTarget ? `edit-dashboard-${editDashboardTarget.id}-${editDashboardTarget.projectId}` : 'edit-dashboard-dialog'}
                open={!!editDashboardTarget}
                dashboard={editDashboardTarget}
                loading={loading}
                error={dashboardMutationError}
                onClose={() => {
                    setEditDashboardTarget(null);
                    setDashboardMutationError(null);
                }}
                onSave={handleSaveDashboard}
            />

            <Modal
                open={!!createTabTarget}
                onClose={() => {
                    setCreateTabTarget(null);
                    setCreateTabError(null);
                }}
                header={{ heading: 'Legg til fane' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        {createTabError && <Alert variant="error" size="small">{createTabError}</Alert>}
                        {createTabTarget && (
                            <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                                Dashboard: <strong>{createTabTarget.dashboardName}</strong>
                            </BodyShort>
                        )}
                        <div className="pt-2">
                            <TextField
                                label="Fanenavn"
                                size="small"
                                value={newTabName}
                                onChange={(event) => setNewTabName(event.target.value)}
                            />
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleCreateDashboardTab()} loading={loading}>
                        Opprett fane
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setCreateTabTarget(null);
                            setCreateTabError(null);
                        }}
                        disabled={loading}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={!!renameTabTarget}
                onClose={() => {
                    setRenameTabTarget(null);
                    setRenameTabName('');
                    setRenameTabError(null);
                }}
                header={{ heading: 'Gi nytt navn til fane' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        {renameTabError && <Alert variant="error" size="small">{renameTabError}</Alert>}
                        {renameTabTarget && (
                            <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                                Dashboard: <strong>{renameTabTarget.dashboardName}</strong>
                            </BodyShort>
                        )}
                        <TextField
                            label="Fanenavn"
                            size="small"
                            value={renameTabName}
                            onChange={(event) => setRenameTabName(event.target.value)}
                        />
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleRenameDashboardTab()} loading={loading}>
                        Lagre navn
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setRenameTabTarget(null);
                            setRenameTabName('');
                            setRenameTabError(null);
                        }}
                        disabled={loading}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={!!deleteTabTarget}
                onClose={() => {
                    setDeleteTabTarget(null);
                    setDeleteTabError(null);
                }}
                header={{ heading: 'Slett fane' }}
                width="small"
            >
                <Modal.Body>
                    <div className="flex flex-col gap-4">
                        {deleteTabError && <Alert variant="error">{deleteTabError}</Alert>}
                        <BodyShort>
                            Er du sikker på at du vil slette fanen <strong>{deleteTabTarget?.tabName}</strong>?
                        </BodyShort>
                        {deleteTabTarget && (deleteTabTarget.chartCount > 0 || deleteTabTarget.categoryCount <= 1) ? (
                            <Alert variant="warning" size="small">
                                {deleteTabTarget.chartCount > 0
                                    ? `Fanen inneholder ${deleteTabTarget.chartCount} graf(er) og kan ikke slettes. Flytt eller slett grafene først.`
                                    : 'Siste fane kan ikke slettes. Opprett en ny fane først.'}
                            </Alert>
                        ) : (
                            <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                                Denne handlingen kan ikke angres.
                            </BodyShort>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    {!deleteTabTarget || ((deleteTabTarget.chartCount ?? 0) <= 0 && (deleteTabTarget.categoryCount ?? 0) > 1) ? (
                        <Button
                            variant="danger"
                            onClick={() => void handleDeleteDashboardTab()}
                            loading={loading}
                            disabled={loading}
                        >
                            Slett fane
                        </Button>
                    ) : null}
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setDeleteTabTarget(null);
                            setDeleteTabError(null);
                        }}
                        disabled={loading}
                    >
                        Lukk
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={isCreateDashboardOpen}
                onClose={() => {
                    setIsCreateDashboardOpen(false);
                    setCreateDashboardError(null);
                }}
                header={{ heading: 'Nytt dashboard' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        {createDashboardError && <Alert variant="error" size="small">{createDashboardError}</Alert>}
                        <TextField
                            label="Dashboardnavn"
                            size="small"
                            value={newDashboardName}
                            onChange={(event) => setNewDashboardName(event.target.value)}
                        />
                        <TextField
                            label="Beskrivelse (valgfri)"
                            size="small"
                            value={newDashboardDescription}
                            onChange={(event) => setNewDashboardDescription(event.target.value)}
                        />
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleCreateDashboard()} loading={loading}>
                        Opprett
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setIsCreateDashboardOpen(false);
                            setCreateDashboardError(null);
                        }}
                        disabled={loading}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            {isImportChartOpen && (
                <ImportChartDialog
                    open={isImportChartOpen}
                    loading={loading}
                    error={importChartError}
                    dashboardOptions={selectedProjectDashboardOptions}
                    defaultDashboardId={importChartDefaultDashboardId ?? selectedProjectDashboardOptions[0]?.id ?? null}
                    onClose={() => {
                        setIsImportChartOpen(false);
                        setImportChartError(null);
                        setImportChartDefaultDashboardId(null);
                    }}
                    onImport={handleImportChart}
                />
            )}

            <CopyChartDialog
                open={!!copyChartTarget}
                chart={copyChartTarget ? { title: copyChartTarget.name } : null}
                projects={projectOptions}
                selectedProjectId={selectedProjectId}
                selectedDashboardId={copyChartTarget?.dashboardId ?? null}
                sourceWebsiteId={copyChartTarget?.sourceWebsiteId}
                loading={loading}
                error={copyChartError}
                onClose={() => {
                    setCopyChartTarget(null);
                    setCopyChartError(null);
                }}
                loadDashboards={api.fetchDashboards}
                loadCategories={api.fetchCategories}
                onCopy={handleCopyChart}
            />

            <Modal
                open={!!moveChartTarget}
                onClose={() => {
                    setMoveChartTarget(null);
                    setMoveChartTargetProjectId(0);
                    setMoveChartTargetDashboardId(0);
                    setMoveChartTargetCategoryId(0);
                    setMoveChartError(null);
                }}
                header={{ heading: 'Flytt graf' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        {moveChartError && <Alert variant="error" size="small">{moveChartError}</Alert>}
                        {moveChartTarget && (
                            <div className="pb-2">
                                <BodyShort size="small">
                                    Graf: <strong>{moveChartTarget.name}</strong>
                                </BodyShort>
                            </div>
                        )}
                        <Select
                            label="Team"
                            value={moveChartTargetProjectId ? String(moveChartTargetProjectId) : ''}
                            onChange={(event) => {
                                setMoveChartTargetProjectId(Number(event.target.value));
                                setMoveChartError(null);
                            }}
                            size="small"
                        >
                            <option value="">Velg team</option>
                            {projectOptions.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>
                        <Select
                            label="Dashboard"
                            value={moveChartTargetDashboardId ? String(moveChartTargetDashboardId) : ''}
                            onChange={(event) => {
                                setMoveChartTargetDashboardId(Number(event.target.value));
                                setMoveChartError(null);
                            }}
                            size="small"
                            disabled={!moveChartTargetProjectId || moveChartDashboardOptions.length === 0}
                        >
                            <option value="">Velg dashboard</option>
                            {moveChartDashboardOptions.map((dashboard) => (
                                <option key={dashboard.id} value={dashboard.id}>
                                    {dashboard.name}
                                </option>
                            ))}
                        </Select>
                        {moveChartCategoryOptions.length > 1 && (
                            <Select
                                label="Fane"
                                value={moveChartTargetCategoryId ? String(moveChartTargetCategoryId) : ''}
                                onChange={(event) => {
                                    setMoveChartTargetCategoryId(Number(event.target.value));
                                    setMoveChartError(null);
                                }}
                                size="small"
                                disabled={!moveChartTargetDashboardId}
                            >
                                <option value="">Velg fane</option>
                                {moveChartCategoryOptions.map((category) => (
                                    <option key={category.id} value={category.id}>
                                        {category.name}
                                    </option>
                                ))}
                            </Select>
                        )}
                        {moveChartTargetProjectId > 0 && moveChartDashboardOptions.length === 0 && (
                            <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                                Valgt team har ingen dashboard.
                            </BodyShort>
                        )}
                        {moveChartTargetDashboardId > 0 && moveChartCategoryOptions.length === 0 && (
                            <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                                Valgt dashboard har ingen faner ennå. Det opprettes en fane automatisk ved flytting.
                            </BodyShort>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleMoveChart()} loading={loading}>
                        Flytt graf
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setMoveChartTarget(null);
                            setMoveChartTargetProjectId(0);
                            setMoveChartTargetDashboardId(0);
                            setMoveChartTargetCategoryId(0);
                            setMoveChartError(null);
                        }}
                        disabled={loading}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <DeleteDashboardDialog
                open={!!deleteDashboardTarget}
                dashboard={deleteDashboardTarget}
                hasCharts={selectedDashboardHasCharts}
                loading={loading}
                error={dashboardMutationError}
                onClose={() => {
                    setDeleteDashboardTarget(null);
                    setDashboardMutationError(null);
                }}
                onConfirm={handleDeleteDashboard}
            />

            <EditChartDialog
                key={editChartTarget ? `edit-chart-${editChartTarget.chart.graphId}` : 'edit-chart-dialog'}
                open={!!editChartTarget}
                chart={editChartTarget?.chart ?? null}
                defaultWebsiteId={editChartTarget?.defaultWebsiteId}
                dashboardOptions={selectedProjectDashboardOptions}
                defaultDashboardId={editChartTarget?.dashboardId ?? null}
                loading={loading}
                error={chartMutationError}
                onClose={() => {
                    setEditChartTarget(null);
                    setChartMutationError(null);
                }}
                onSave={handleSaveChart}
            />

            <Modal
                open={!!deleteChartTarget}
                onClose={() => {
                    setDeleteChartTarget(null);
                    setChartMutationError(null);
                }}
                header={{ heading: 'Slett graf' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        {chartMutationError && <Alert variant="error" size="small">{chartMutationError}</Alert>}
                        <BodyShort>
                            Er du sikker på at du vil slette grafen <strong>{deleteChartTarget?.name}</strong>?
                        </BodyShort>
                        <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                            Denne handlingen kan ikke angres.
                        </BodyShort>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="danger" onClick={() => void handleDeleteChart()} loading={loading}>
                        Slett graf
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setDeleteChartTarget(null);
                            setChartMutationError(null);
                        }}
                        disabled={loading}
                    >
                        Avbryt
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                open={!!deleteTarget}
                onClose={() => {
                    setDeleteTarget(null);
                    setLocalError(null);
                }}
                header={{ heading: 'Slett team' }}
                width="small"
            >
                <Modal.Body>
                    <div className="space-y-4">
                        {localError && <Alert variant="error" size="small">{localError}</Alert>}
                        <BodyShort>
                            Er du sikker på at du vil slette teamet <strong>{deleteTarget?.project.name}</strong>?
                        </BodyShort>
                        {(deleteTarget?.dashboardCount ?? 0) > 0 || (deleteTarget?.chartCount ?? 0) > 0 ? (
                            <Alert variant="warning" size="small">
                                Team med dashboard eller grafer kan ikke slettes.
                            </Alert>
                        ) : (
                            <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                                Denne handlingen kan ikke angres.
                            </BodyShort>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    {(deleteTarget?.dashboardCount ?? 0) === 0 && (deleteTarget?.chartCount ?? 0) === 0 && (
                        <Button variant="danger" onClick={() => void handleDeleteConfirm()} loading={loading}>
                            Slett team
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setDeleteTarget(null);
                            setLocalError(null);
                        }}
                        disabled={loading}
                    >
                        Lukk
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default ProjectManager;
