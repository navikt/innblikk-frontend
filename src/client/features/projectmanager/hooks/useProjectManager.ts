import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectDto } from '../model/types.ts';
import * as api from '../api/backendApi.ts';
import { applyWebsiteIdOnly, replaceHardcodedWebsiteId } from '../../sql/utils/sqlProcessing.ts';

const COLUMN_TOO_LONG_RE = /too long for the column/i;
const stripTrailingSemicolon = (sql: string): string => sql.trim().replace(/;+\s*$/, '').trim();
const compactSqlForStorage = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

type ProjectSummary = {
    project: ProjectDto;
    dashboardCount: number;
    chartCount: number;
    dashboards: Array<{
        id: number;
        name: string;
        categories: Array<{
            id: number;
            name: string;
            charts: Array<{
                id: number;
                name: string;
                graphType?: string;
                categoryId: number;
            }>;
        }>;
        charts: Array<{
            id: number;
            name: string;
            graphType?: string;
            categoryId: number;
        }>;
    }>;
};

export const useProjectManager = () => {
    const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDescription, setNewProjectDescription] = useState('');

    const run = useCallback(async <T>(task: () => Promise<T>): Promise<T | undefined> => {
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            return await task();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Ukjent feil');
            return undefined;
        } finally {
            setLoading(false);
        }
    }, []);

    const loadProjectSummaries = useCallback(async () => {
        const projectItems = await api.fetchProjects();

        const summaryItems = await Promise.all(projectItems.map(async (project) => {
            const dashboards = await api.fetchDashboards(project.id);
            const dashboardData = await Promise.all(dashboards.map(async (dashboard) => {
                const categories = await api.fetchCategories(project.id, dashboard.id);
                const categoryData = await Promise.all(categories.map(async (category) => {
                    const graphs = await api.fetchGraphs(project.id, dashboard.id, category.id);
                    return {
                        id: category.id,
                        name: category.name,
                        charts: graphs.map((graph) => ({
                            id: graph.id,
                            name: graph.name,
                            graphType: graph.graphType,
                            categoryId: category.id,
                        })),
                    };
                }));
                const allCharts = categoryData.flatMap((cat) => cat.charts);
                return {
                    id: dashboard.id,
                    name: dashboard.name,
                    categories: categoryData,
                    charts: allCharts,
                };
            }));
            const chartCount = dashboardData.reduce((sum, dashboard) => sum + dashboard.charts.length, 0);

            return {
                project,
                dashboardCount: dashboards.length,
                chartCount,
                dashboards: dashboardData,
            };
        }));

        setProjectSummaries(summaryItems);
    }, []);

    useEffect(() => {
        void run(async () => {
            await loadProjectSummaries();
        });
    }, [run, loadProjectSummaries]);

    const createProject = useCallback(
        () =>
            run(async () => {
                if (!newProjectName.trim()) throw new Error('Prosjektnavn er påkrevd');
                const createdProject = await api.createProject(newProjectName.trim(), newProjectDescription.trim() || undefined);
                setNewProjectName('');
                setNewProjectDescription('');
                await loadProjectSummaries();
                setMessage('Prosjekt opprettet');
                return createdProject.id;
            }),
        [run, newProjectName, newProjectDescription, loadProjectSummaries],
    );

    const editProject = useCallback(
        (projectId: number, name: string, description?: string) =>
            run(async () => {
                if (!name.trim()) throw new Error('Prosjektnavn er påkrevd');
                await api.updateProject(projectId, name.trim(), description?.trim() || undefined);
                await loadProjectSummaries();
                setMessage('Prosjekt oppdatert');
            }),
        [run, loadProjectSummaries],
    );

    const deleteProject = useCallback(
        (projectId: number) =>
            run(async () => {
                await api.deleteProject(projectId);
                await loadProjectSummaries();
                setMessage('Prosjekt slettet');
            }),
        [run, loadProjectSummaries],
    );

    const editDashboard = useCallback(
        (projectId: number, dashboardId: number, params: { name: string; projectId: number }) =>
            run(async () => {
                if (!params.name.trim()) throw new Error('Dashboardnavn er påkrevd');
                if (!params.projectId) throw new Error('Velg prosjekt');
                await api.updateDashboard(projectId, dashboardId, { name: params.name.trim(), projectId: params.projectId });
                await loadProjectSummaries();
                setMessage('Dashboard oppdatert');
            }),
        [run, loadProjectSummaries],
    );

    const createDashboard = useCallback(
        (projectId: number, name: string, description?: string) =>
            run(async () => {
                if (!projectId) throw new Error('Velg prosjekt');
                if (!name.trim()) throw new Error('Dashboardnavn er påkrevd');
                await api.createDashboard(projectId, name.trim(), description?.trim() || undefined);
                await loadProjectSummaries();
                setMessage('Dashboard opprettet');
            }),
        [run, loadProjectSummaries],
    );

    const createCategory = useCallback(
        (projectId: number, dashboardId: number, name: string) =>
            run(async () => {
                if (!projectId) throw new Error('Velg prosjekt');
                if (!dashboardId) throw new Error('Velg dashboard');
                if (!name.trim()) throw new Error('Fanenavn er påkrevd');
                await api.createCategory(projectId, dashboardId, name.trim());
                await loadProjectSummaries();
                setMessage('Fane opprettet');
            }),
        [run, loadProjectSummaries],
    );

    const updateCategory = useCallback(
        (projectId: number, dashboardId: number, categoryId: number, name: string) =>
            run(async () => {
                if (!projectId) throw new Error('Velg prosjekt');
                if (!dashboardId) throw new Error('Velg dashboard');
                if (!categoryId) throw new Error('Velg fane');
                if (!name.trim()) throw new Error('Fanenavn er påkrevd');
                await api.updateCategory(projectId, dashboardId, categoryId, { name: name.trim() });
                await loadProjectSummaries();
                setMessage('Fane oppdatert');
            }),
        [run, loadProjectSummaries],
    );

    const deleteCategory = useCallback(
        (projectId: number, dashboardId: number, categoryId: number) =>
            run(async () => {
                if (!projectId) throw new Error('Velg prosjekt');
                if (!dashboardId) throw new Error('Velg dashboard');
                if (!categoryId) throw new Error('Velg fane');
                await api.deleteCategory(projectId, dashboardId, categoryId);
                await loadProjectSummaries();
                setMessage('Fane slettet');
            }),
        [run, loadProjectSummaries],
    );

    const deleteDashboard = useCallback(
        (projectId: number, dashboardId: number) =>
            run(async () => {
                await api.deleteDashboard(projectId, dashboardId);
                await loadProjectSummaries();
                setMessage('Dashboard slettet');
            }),
        [run, loadProjectSummaries],
    );

    const deleteChart = useCallback(
        (projectId: number, dashboardId: number, categoryId: number, graphId: number) =>
            run(async () => {
                await api.deleteGraph(projectId, dashboardId, categoryId, graphId);
                await loadProjectSummaries();
                setMessage('Graf slettet');
            }),
        [run, loadProjectSummaries],
    );

    const importChart = useCallback(
        (
            projectId: number,
            dashboardId: number,
            categoryId: number,
            params: { name: string; graphType: string; width: number; sqlText: string },
        ): Promise<{ ok: true } | { ok: false; error: string }> =>
            (async () => {
                setLoading(true);
                setError(null);
                setMessage(null);
                let createdGraphId: number | null = null;
                try {
                    if (!params.name.trim()) {
                        return { ok: false, error: 'Grafnavn er påkrevd' };
                    }
                    if (!params.sqlText.trim()) {
                        return { ok: false, error: 'SQL-kode er påkrevd' };
                    }
                    const normalizedSqlText = stripTrailingSemicolon(params.sqlText);
                    const createdGraph = await api.createGraph(projectId, dashboardId, categoryId, {
                        name: params.name.trim(),
                        graphType: params.graphType,
                        width: params.width,
                    });
                    createdGraphId = createdGraph.id;
                    const sqlCandidates = Array.from(new Set([
                        normalizedSqlText,
                        compactSqlForStorage(normalizedSqlText),
                    ])).filter(Boolean);

                    let queryCreated = false;
                    for (const sqlText of sqlCandidates) {
                        try {
                            await api.createQuery(
                                projectId,
                                dashboardId,
                                categoryId,
                                createdGraph.id,
                                `${params.name.trim()} - query`,
                                sqlText,
                            );
                            queryCreated = true;
                            break;
                        } catch (candidateErr: unknown) {
                            const candidateMessage = candidateErr instanceof Error ? candidateErr.message : '';
                            if (!COLUMN_TOO_LONG_RE.test(candidateMessage)) {
                                throw candidateErr;
                            }
                        }
                    }

                    if (!queryCreated) {
                        throw new Error(
                            `Backend avviste SQL-lengde (${normalizedSqlText.length} tegn; komprimert ${compactSqlForStorage(normalizedSqlText).length} tegn).`,
                        );
                    }
                    await loadProjectSummaries();
                    setMessage('Graf importert');
                    return { ok: true };
                } catch (err: unknown) {
                    const rawMessage = err instanceof Error ? err.message.trim() : '';
                    const isGenericStatusError = /^Forespørsel feilet \(\d+\)$/.test(rawMessage);
                    const isBadRequest = /\bBAD_REQUEST\b/i.test(rawMessage);
                    let rollbackFailed = false;
                    if (createdGraphId != null) {
                        try {
                            await api.deleteGraph(projectId, dashboardId, categoryId, createdGraphId);
                            await loadProjectSummaries();
                        } catch {
                            rollbackFailed = true;
                        }
                    }

                    const baseMessage = isBadRequest
                        ? 'Import feilet: SQL-spørringen ble avvist (BAD_REQUEST). Sjekk syntaks, tabell-/feltnavn og at SQL returnerer gyldige resultater.'
                        : rawMessage && !isGenericStatusError
                            ? `Import feilet: ${rawMessage}`
                            : 'Import feilet. Sjekk at SQL-spørringen er gyldig, og at dashboardet fortsatt finnes.';
                    const rollbackMessage = rollbackFailed
                        ? ' Grafen ble opprettet uten SQL. Slett grafen manuelt eller legg til query via redigering.'
                        : '';
                    return { ok: false, error: `${baseMessage}${rollbackMessage}` };
                } finally {
                    setLoading(false);
                }
            })(),
        [loadProjectSummaries],
    );

    const rewriteSqlWebsiteId = useCallback((sql: string, targetWebsiteId?: string): string => {
        if (!targetWebsiteId) return sql;
        const withPlaceholderApplied = applyWebsiteIdOnly(sql, targetWebsiteId);
        return replaceHardcodedWebsiteId(withPlaceholderApplied, targetWebsiteId);
    }, []);

    const copyChart = useCallback(
        async (params: {
            sourceProjectId: number;
            sourceDashboardId: number;
            sourceCategoryId: number;
            sourceGraphId: number;
            targetProjectId: number;
            targetDashboardId: number;
            targetCategoryId: number;
            chartName: string;
            websiteId?: string;
        }): Promise<{ ok: true } | { ok: false; error: string }> => {
            setLoading(true);
            setError(null);
            setMessage(null);
            try {
                const sourceGraphs = await api.fetchGraphs(params.sourceProjectId, params.sourceDashboardId, params.sourceCategoryId);
                const sourceGraph = sourceGraphs.find((item) => item.id === params.sourceGraphId);
                if (!sourceGraph) {
                    return { ok: false, error: 'Fant ikke grafen som skal kopieres' };
                }

                const sourceQueries = await api.fetchQueries(
                    params.sourceProjectId,
                    params.sourceDashboardId,
                    params.sourceCategoryId,
                    params.sourceGraphId,
                );
                const sourceQueryVariants = sourceQueries
                    .map((query, index) => {
                        const sqlText = query.sqlText?.trim() ?? '';
                        if (!sqlText) return null;
                        return {
                            name: query.name?.trim() || `${params.chartName.trim()} - query ${index + 1}`,
                            sqlText: rewriteSqlWebsiteId(sqlText, params.websiteId),
                        };
                    })
                    .filter((query): query is { name: string; sqlText: string } => Boolean(query));
                if (sourceQueryVariants.length === 0) {
                    return { ok: false, error: 'Grafen mangler SQL og kan ikke kopieres' };
                }

                const targetName = params.chartName.trim();
                if (!targetName) {
                    return { ok: false, error: 'Grafnavn er påkrevd' };
                }

                const targetGraphs = await api.fetchGraphs(params.targetProjectId, params.targetDashboardId, params.targetCategoryId);
                const targetNameLower = targetName.toLowerCase();
                const isSameDashboard =
                    params.sourceProjectId === params.targetProjectId
                    && params.sourceDashboardId === params.targetDashboardId
                    && params.sourceCategoryId === params.targetCategoryId;
                const existingTarget = targetGraphs.find((graph) => {
                    if (isSameDashboard && graph.id === params.sourceGraphId) return false;
                    return graph.name.trim().toLowerCase() === targetNameLower;
                });

                const sourceGraphType = sourceGraph.graphType ?? 'TABLE';
                const sourceWidth = sourceGraph.width;

                if (existingTarget) {
                    await api.updateGraph(
                        params.targetProjectId,
                        params.targetDashboardId,
                        params.targetCategoryId,
                        existingTarget.id,
                        { name: targetName, graphType: sourceGraphType, width: sourceWidth },
                    );

                    const existingQueries = await api.fetchQueries(
                        params.targetProjectId,
                        params.targetDashboardId,
                        params.targetCategoryId,
                        existingTarget.id,
                    );
                    for (let index = 0; index < sourceQueryVariants.length; index += 1) {
                        const sourceVariant = sourceQueryVariants[index];
                        const existingQuery = existingQueries[index];
                        if (existingQuery) {
                            await api.updateQuery(
                                params.targetProjectId,
                                params.targetDashboardId,
                                params.targetCategoryId,
                                existingTarget.id,
                                existingQuery.id,
                                sourceVariant.name,
                                sourceVariant.sqlText,
                            );
                        } else {
                            await api.createQuery(
                                params.targetProjectId,
                                params.targetDashboardId,
                                params.targetCategoryId,
                                existingTarget.id,
                                sourceVariant.name,
                                sourceVariant.sqlText,
                            );
                        }
                    }
                } else {
                    const createdGraph = await api.createGraph(
                        params.targetProjectId,
                        params.targetDashboardId,
                        params.targetCategoryId,
                        { name: targetName, graphType: sourceGraphType, width: sourceWidth },
                    );
                    for (const sourceVariant of sourceQueryVariants) {
                        await api.createQuery(
                            params.targetProjectId,
                            params.targetDashboardId,
                            params.targetCategoryId,
                            createdGraph.id,
                            sourceVariant.name,
                            sourceVariant.sqlText,
                        );
                    }
                }

                await loadProjectSummaries();
                setMessage('Graf kopiert');
                return { ok: true };
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Kunne ikke kopiere graf';
                setError(errorMessage);
                return { ok: false, error: errorMessage };
            } finally {
                setLoading(false);
            }
        },
        [loadProjectSummaries, rewriteSqlWebsiteId],
    );

    const moveChart = useCallback(
        async (params: {
            sourceProjectId: number;
            sourceDashboardId: number;
            sourceCategoryId: number;
            sourceGraphId: number;
            targetProjectId: number;
            targetDashboardId: number;
            targetCategoryId: number;
        }): Promise<{ ok: true } | { ok: false; error: string }> => {
            setLoading(true);
            setError(null);
            setMessage(null);
            try {
                const sourceGraphs = await api.fetchGraphs(params.sourceProjectId, params.sourceDashboardId, params.sourceCategoryId);
                const sourceGraph = sourceGraphs.find((item) => item.id === params.sourceGraphId);
                if (!sourceGraph) {
                    return { ok: false, error: 'Fant ikke grafen som skal flyttes' };
                }

                const sourceQueries = await api.fetchQueries(
                    params.sourceProjectId,
                    params.sourceDashboardId,
                    params.sourceCategoryId,
                    params.sourceGraphId,
                );
                const sourceQuery = sourceQueries[0];
                if (!sourceQuery?.sqlText?.trim()) {
                    return { ok: false, error: 'Grafen mangler SQL og kan ikke flyttes' };
                }

                const targetName = sourceGraph.name.trim();
                if (!targetName) {
                    return { ok: false, error: 'Grafnavn mangler og grafen kan ikke flyttes' };
                }

                const targetGraphs = await api.fetchGraphs(params.targetProjectId, params.targetDashboardId, params.targetCategoryId);
                const targetNameLower = targetName.toLowerCase();
                const isSameDashboard =
                    params.sourceProjectId === params.targetProjectId
                    && params.sourceDashboardId === params.targetDashboardId
                    && params.sourceCategoryId === params.targetCategoryId;
                const existingTarget = targetGraphs.find((graph) => {
                    if (isSameDashboard && graph.id === params.sourceGraphId) return false;
                    return graph.name.trim().toLowerCase() === targetNameLower;
                });

                const sourceGraphType = sourceGraph.graphType ?? 'TABLE';
                const sourceWidth = sourceGraph.width;
                const queryName = sourceQuery.name?.trim() || `${targetName} - query`;
                const sqlForMove = sourceQuery.sqlText.trim();

                if (existingTarget) {
                    await api.updateGraph(
                        params.targetProjectId,
                        params.targetDashboardId,
                        params.targetCategoryId,
                        existingTarget.id,
                        { name: targetName, graphType: sourceGraphType, width: sourceWidth },
                    );

                    const existingQueries = await api.fetchQueries(
                        params.targetProjectId,
                        params.targetDashboardId,
                        params.targetCategoryId,
                        existingTarget.id,
                    );
                    const firstTargetQuery = existingQueries[0];
                    if (firstTargetQuery) {
                        await api.updateQuery(
                            params.targetProjectId,
                            params.targetDashboardId,
                            params.targetCategoryId,
                            existingTarget.id,
                            firstTargetQuery.id,
                            queryName,
                            sqlForMove,
                        );
                    } else {
                        await api.createQuery(
                            params.targetProjectId,
                            params.targetDashboardId,
                            params.targetCategoryId,
                            existingTarget.id,
                            queryName,
                            sqlForMove,
                        );
                    }
                } else {
                    const createdGraph = await api.createGraph(
                        params.targetProjectId,
                        params.targetDashboardId,
                        params.targetCategoryId,
                        { name: targetName, graphType: sourceGraphType, width: sourceWidth },
                    );
                    await api.createQuery(
                        params.targetProjectId,
                        params.targetDashboardId,
                        params.targetCategoryId,
                        createdGraph.id,
                        queryName,
                        sqlForMove,
                    );
                }

                await api.deleteGraph(params.sourceProjectId, params.sourceDashboardId, params.sourceCategoryId, params.sourceGraphId);
                await loadProjectSummaries();
                setMessage('Graf flyttet');
                return { ok: true };
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Kunne ikke flytte graf';
                setError(errorMessage);
                return { ok: false, error: errorMessage };
            } finally {
                setLoading(false);
            }
        },
        [loadProjectSummaries],
    );

    const editChart = useCallback(
        async (
            projectId: number,
            dashboardId: number,
            categoryId: number,
            graphId: number,
            params: {
                name: string;
                graphType: string;
                width: number;
                sqlText: string;
                queryId?: number;
                queryName?: string;
                newVariants?: Array<{ name: string; sqlText: string }>;
                websiteId?: string;
                targetDashboardId?: number;
                targetCategoryId?: number;
            },
        ): Promise<{ ok: true } | { ok: false; error: string }> => {
            setLoading(true);
            setError(null);
            setMessage(null);
            try {
                if (!params.name.trim()) {
                    return { ok: false, error: 'Grafnavn er påkrevd' };
                }
                if (!params.sqlText.trim()) {
                    return { ok: false, error: 'SQL-kode er påkrevd' };
                }
                const sqlForSave = rewriteSqlWebsiteId(params.sqlText, params.websiteId);
                const pendingNewVariants = (params.newVariants ?? [])
                    .map((variant) => ({
                        name: variant.name.trim(),
                        sqlText: variant.sqlText.trim(),
                    }))
                    .filter((variant) => variant.name && variant.sqlText);
                const hasTargetQuery = typeof params.queryId === 'number' && params.queryId > 0;
                const resolvedQueryName = params.queryName?.trim() || `${params.name.trim()} - query`;
                const targetDashboardId = params.targetDashboardId;
                const targetCategoryId = params.targetCategoryId ?? categoryId;
                const shouldMove = (targetDashboardId != null && targetDashboardId !== dashboardId)
                    || (targetCategoryId !== categoryId);
                if (shouldMove) {
                    const moveDashboardId = targetDashboardId ?? dashboardId;
                    const createdGraph = await api.createGraph(projectId, moveDashboardId, targetCategoryId, {
                        name: params.name.trim(),
                        graphType: params.graphType,
                        width: params.width,
                    });
                    if (hasTargetQuery || pendingNewVariants.length === 0) {
                        await api.createQuery(
                            projectId,
                            moveDashboardId,
                            targetCategoryId,
                            createdGraph.id,
                            resolvedQueryName,
                            sqlForSave,
                        );
                    }
                    for (const variant of pendingNewVariants) {
                        await api.createQuery(
                            projectId,
                            moveDashboardId,
                            targetCategoryId,
                            createdGraph.id,
                            variant.name,
                            rewriteSqlWebsiteId(variant.sqlText, params.websiteId),
                        );
                    }
                    await api.deleteGraph(projectId, dashboardId, categoryId, graphId);
                } else {
                    await api.updateGraph(projectId, dashboardId, categoryId, graphId, {
                        name: params.name.trim(),
                        graphType: params.graphType,
                        width: params.width,
                    });
                    if (hasTargetQuery) {
                        await api.updateQuery(
                            projectId,
                            dashboardId,
                            categoryId,
                            graphId,
                            params.queryId as number,
                            resolvedQueryName,
                            sqlForSave,
                        );
                    }
                    for (const variant of pendingNewVariants) {
                        await api.createQuery(
                            projectId,
                            dashboardId,
                            categoryId,
                            graphId,
                            variant.name,
                            rewriteSqlWebsiteId(variant.sqlText, params.websiteId),
                        );
                    }
                }
                await loadProjectSummaries();
                setMessage('Graf oppdatert');
                return { ok: true };
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Kunne ikke oppdatere graf';
                setError(errorMessage);
                return { ok: false, error: errorMessage };
            } finally {
                setLoading(false);
            }
        },
        [loadProjectSummaries, rewriteSqlWebsiteId],
    );

    const projectSummaryById = useMemo(() => {
        return new Map(projectSummaries.map((item) => [item.project.id, item]));
    }, [projectSummaries]);

    return {
        projectSummaries,
        projectSummaryById,
        loading,
        error,
        message,
        newProjectName,
        setNewProjectName,
        newProjectDescription,
        setNewProjectDescription,
        createProject,
        editProject,
        deleteProject,
        editDashboard,
        createDashboard,
        createCategory,
        updateCategory,
        deleteCategory,
        deleteDashboard,
        deleteChart,
        editChart,
        importChart,
        copyChart,
        moveChart,
    };
};

export type { ProjectSummary };
