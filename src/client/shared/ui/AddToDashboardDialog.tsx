import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Select, TextField } from '@navikt/ds-react';
import type { DashboardDto, GraphCategoryDto, ProjectDto } from '../types/backend.ts';
import type { Website } from '../types/website.ts';
import {
    fetchProjects,
    fetchDashboards,
    fetchCategories,
    saveChartToBackend,
} from '../../features/chartbuilder/api/chartStorageApi.ts';
import { fetchWebsites } from '../api/websiteApi.ts';

const getHostPrefix = (): string => {
    if (typeof window === 'undefined') return 'server';
    return window.location.hostname.replace(/\./g, '_');
};

const LAST_PROJECT_KEY = `add_to_dashboard_last_project_id_${getHostPrefix()}`;
const LAST_DASHBOARD_KEY = `add_to_dashboard_last_dashboard_id_${getHostPrefix()}`;
const LAST_CATEGORY_KEY = `add_to_dashboard_last_category_id_${getHostPrefix()}`;
const LAST_WEBSITE_KEY = `add_to_dashboard_last_website_id_${getHostPrefix()}`;

const parseStoredId = (value: string | null): number | null => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const getStoredProjectId = (): number | null => (typeof window === 'undefined' ? null : parseStoredId(window.localStorage.getItem(LAST_PROJECT_KEY)));
const getStoredDashboardId = (): number | null => (typeof window === 'undefined' ? null : parseStoredId(window.localStorage.getItem(LAST_DASHBOARD_KEY)));
const getStoredCategoryId = (): number | null => (typeof window === 'undefined' ? null : parseStoredId(window.localStorage.getItem(LAST_CATEGORY_KEY)));
const getStoredWebsiteId = (): string => (typeof window === 'undefined' ? '' : (window.localStorage.getItem(LAST_WEBSITE_KEY) ?? ''));

const saveStoredProjectId = (value: number) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAST_PROJECT_KEY, String(value));
};

const saveStoredDashboardId = (value: number) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAST_DASHBOARD_KEY, String(value));
};

const saveStoredCategoryId = (value: number) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAST_CATEGORY_KEY, String(value));
};

const saveStoredWebsiteId = (value: string) => {
    if (typeof window === 'undefined') return;
    if (value) window.localStorage.setItem(LAST_WEBSITE_KEY, value);
    else window.localStorage.removeItem(LAST_WEBSITE_KEY);
};

type AddToDashboardDialogProps = {
    open: boolean;
    onClose: () => void;
    graphName: string;
    sqlText: string;
    graphType?: 'TABLE' | 'LINE' | 'BAR' | 'PIE';
    sourceWebsiteId?: string;
};

const AddToDashboardDialog = ({
    open,
    onClose,
    graphName,
    sqlText,
    graphType = 'TABLE',
    sourceWebsiteId,
}: AddToDashboardDialogProps) => {
    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [dashboards, setDashboards] = useState<DashboardDto[]>([]);
    const [categories, setCategories] = useState<GraphCategoryDto[]>([]);
    const [websites, setWebsites] = useState<Website[]>([]);

    const [projectId, setProjectId] = useState<number>(0);
    const [dashboardId, setDashboardId] = useState<number>(0);
    const [categoryId, setCategoryId] = useState<number>(0);
    const [chartName, setChartName] = useState(graphName);
    const [websiteId, setWebsiteId] = useState<string>('');

    const [loadingProjects, setLoadingProjects] = useState(false);
    const [loadingDashboards, setLoadingDashboards] = useState(false);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [loadingWebsites, setLoadingWebsites] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSaveSuccessModal, setShowSaveSuccessModal] = useState(false);
    const [savedLocation, setSavedLocation] = useState<{
        projectId: number;
        dashboardId: number;
        dashboardName: string;
    } | null>(null);

    useEffect(() => {
        if (!open) return;
        setChartName(graphName);
        setError(null);
        setShowSaveSuccessModal(false);
        setSavedLocation(null);
        const rememberedWebsiteId = getStoredWebsiteId();
        setWebsiteId(sourceWebsiteId || rememberedWebsiteId || '');
    }, [open, graphName, sourceWebsiteId]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        const run = async () => {
            setLoadingWebsites(true);
            try {
                const items = await fetchWebsites();
                if (cancelled) return;
                setWebsites(items);
                const rememberedWebsiteId = sourceWebsiteId || getStoredWebsiteId();
                if (rememberedWebsiteId && items.some((item) => item.id === rememberedWebsiteId)) {
                    setWebsiteId(rememberedWebsiteId);
                } else {
                    setWebsiteId('');
                }
            } catch {
                if (cancelled) return;
                setWebsites([]);
                setWebsiteId('');
            } finally {
                if (!cancelled) setLoadingWebsites(false);
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [open, sourceWebsiteId]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        const run = async () => {
            setLoadingProjects(true);
            try {
                const items = await fetchProjects();
                if (cancelled) return;
                setProjects(items);
                const storedProjectId = getStoredProjectId();
                const nextProjectId = (storedProjectId && items.some((item) => item.id === storedProjectId))
                    ? storedProjectId
                    : (items[0]?.id ?? 0);
                setProjectId(nextProjectId);
            } catch (err: unknown) {
                if (cancelled) return;
                setProjects([]);
                setProjectId(0);
                setError(err instanceof Error ? err.message : 'Kunne ikke laste arbeidsområder');
            } finally {
                if (!cancelled) setLoadingProjects(false);
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open || !projectId) {
            setDashboards([]);
            setDashboardId(0);
            return;
        }

        let cancelled = false;
        const run = async () => {
            setLoadingDashboards(true);
            try {
                const items = await fetchDashboards(projectId);
                if (cancelled) return;
                setDashboards(items);
                const storedDashboardId = getStoredDashboardId();
                setDashboardId((prev) => {
                    if (prev && items.some((item) => item.id === prev)) return prev;
                    if (storedDashboardId && items.some((item) => item.id === storedDashboardId)) return storedDashboardId;
                    return items[0]?.id ?? 0;
                });
            } catch (err: unknown) {
                if (cancelled) return;
                setDashboards([]);
                setDashboardId(0);
                setError(err instanceof Error ? err.message : 'Kunne ikke laste dashboards');
            } finally {
                if (!cancelled) setLoadingDashboards(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [open, projectId]);

    useEffect(() => {
        if (!open || !projectId || !dashboardId) {
            setCategories([]);
            setCategoryId(0);
            return;
        }

        let cancelled = false;
        const run = async () => {
            setLoadingCategories(true);
            try {
                const items = await fetchCategories(projectId, dashboardId);
                if (cancelled) return;
                setCategories(items);
                const storedCategoryId = getStoredCategoryId();
                setCategoryId((prev) => {
                    if (prev && items.some((item) => item.id === prev)) return prev;
                    if (storedCategoryId && items.some((item) => item.id === storedCategoryId)) return storedCategoryId;
                    return items[0]?.id ?? 0;
                });
            } catch (err: unknown) {
                if (cancelled) return;
                setCategories([]);
                setCategoryId(0);
                setError(err instanceof Error ? err.message : 'Kunne ikke laste faner');
            } finally {
                if (!cancelled) setLoadingCategories(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [open, projectId, dashboardId]);

    const getCategoryDisplayName = (name?: string) => {
        const trimmed = name?.trim() ?? '';
        if (!trimmed) return 'Fane 1';
        if (trimmed.toLowerCase() === 'general') return 'Fane 1';
        return trimmed;
    };

    const handleSave = async () => {
        if (!projectId) {
            setError('Velg arbeidsområde');
            return;
        }
        if (!dashboardId) {
            setError('Velg dashboard');
            return;
        }
        if (categories.length > 1 && !categoryId) {
            setError('Velg fane');
            return;
        }
        if (!chartName.trim()) {
            setError('Velg grafnavn');
            return;
        }
        if (!sqlText.trim()) {
            setError('Ingen data å lagre');
            return;
        }

        const project = projects.find((item) => item.id === projectId);
        const dashboard = dashboards.find((item) => item.id === dashboardId);
        if (!project || !dashboard) {
            setError('Ugyldig valg av dashboard');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const sqlToSave = websiteId
                ? sqlText.replace(/\{\{\s*website_id\s*\}\}/g, websiteId)
                : sqlText;
            const saved = await saveChartToBackend({
                projectName: project.name,
                dashboardName: dashboard.name,
                graphName: chartName.trim(),
                queryName: chartName.trim(),
                graphType,
                sqlText: sqlToSave,
                categoryId: categoryId || undefined,
            });
            saveStoredProjectId(projectId);
            saveStoredDashboardId(dashboardId);
            if (categoryId) saveStoredCategoryId(categoryId);
            saveStoredWebsiteId(websiteId);
            setSavedLocation({
                projectId: saved.project.id,
                dashboardId: saved.dashboard.id,
                dashboardName: saved.dashboard.name,
            });
            setShowSaveSuccessModal(true);
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Kunne ikke lagre graf');
        } finally {
            setSaving(false);
        }
    };

    const savedDashboardUrl = savedLocation
        ? `/oversikt?projectId=${savedLocation.projectId}&dashboardId=${savedLocation.dashboardId}`
        : '';

    const handleGoToSavedDashboard = () => {
        if (!savedDashboardUrl || typeof window === 'undefined') return;
        window.location.href = savedDashboardUrl;
    };

    return (
        <>
            <Modal open={open} onClose={onClose} header={{ heading: 'Legg til i dashboard' }} width="small">
                <Modal.Body>
                    <div className="flex flex-col gap-4">
                        <p className="text-sm text-[var(--ax-text-subtle)]">
                            {graphName}
                        </p>
                        {error && <Alert variant="error">{error}</Alert>}

                        <Select
                            label="Arbeidsområde"
                            value={projectId ? String(projectId) : ''}
                            onChange={(event) => {
                                const nextProjectId = Number(event.target.value);
                                setProjectId(nextProjectId);
                                if (nextProjectId) saveStoredProjectId(nextProjectId);
                                setError(null);
                            }}
                            size="small"
                            disabled={loadingProjects || saving}
                        >
                            <option value="">Velg arbeidsområde</option>
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>

                        <Select
                            label="Dashboard"
                            value={dashboardId ? String(dashboardId) : ''}
                            onChange={(event) => {
                                const nextDashboardId = Number(event.target.value);
                                setDashboardId(nextDashboardId);
                                if (nextDashboardId) saveStoredDashboardId(nextDashboardId);
                                setCategoryId(0);
                                setError(null);
                            }}
                            size="small"
                            disabled={!projectId || loadingDashboards || saving}
                        >
                            <option value="">Velg dashboard</option>
                            {dashboards.map((dashboard) => (
                                <option key={dashboard.id} value={dashboard.id}>
                                    {dashboard.name}
                                </option>
                            ))}
                        </Select>

                        {categories.length > 1 && (
                            <Select
                                label="Fane"
                                value={categoryId ? String(categoryId) : ''}
                                onChange={(event) => {
                                    const nextCategoryId = Number(event.target.value);
                                    setCategoryId(nextCategoryId);
                                    if (nextCategoryId) saveStoredCategoryId(nextCategoryId);
                                    setError(null);
                                }}
                                size="small"
                                disabled={!dashboardId || loadingCategories || saving}
                            >
                                <option value="">Velg fane</option>
                                {categories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                        {getCategoryDisplayName(category.name)}
                                    </option>
                                ))}
                            </Select>
                        )}

                        <TextField
                            label="Grafnavn"
                            value={chartName}
                            onChange={(event) => setChartName(event.target.value)}
                            size="small"
                            disabled={saving}
                        />

                        <Select
                            label="Vis resultatet for nettsiden..."
                            value={websiteId}
                            onChange={(event) => {
                                const nextWebsiteId = event.target.value;
                                setWebsiteId(nextWebsiteId);
                                saveStoredWebsiteId(nextWebsiteId);
                            }}
                            size="small"
                            disabled={loadingWebsites || saving}
                        >
                            <option value="">Bruk dashboard-filter</option>
                            {websites.map((website) => (
                                <option key={website.id} value={website.id}>
                                    {website.name}
                                </option>
                            ))}
                        </Select>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => void handleSave()} loading={saving}>
                        Legg til i dashboard
                    </Button>
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
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
        </>
    );
};

export default AddToDashboardDialog;
