import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ActionMenu, Alert, Button, Modal, Select, Switch, Tabs, Textarea, TextField } from '@navikt/ds-react';
import { GripVertical, MoreVertical } from 'lucide-react';
import type { GraphType, OversiktChart } from '../../model/types.ts';
import type { Website } from '../../../../shared/types/website.ts';
import { fetchWebsites } from '../../../../shared/api/websiteApi.ts';

type EditChartDialogProps = {
    open: boolean;
    chart: OversiktChart | null;
    defaultWebsiteId?: string;
    dashboardOptions?: Array<{ id: number; name: string }>;
    defaultDashboardId?: number | null;
    loading?: boolean;
    error?: string | null;
    defaultShowSql?: boolean;
    onClose: () => void;
    onSave: (params: {
        name: string;
        graphType: GraphType;
        sqlText: string;
        width: number;
        websiteId?: string;
        dashboardId?: number;
        addAsVariant?: boolean;
        variantName?: string;
        targetQueryId?: number;
        targetQueryName?: string;
    }) => Promise<void>;
    onRenameVariant?: (params: { queryId: number; name: string }) => Promise<void>;
    onDeleteVariant?: (params: { queryId: number }) => Promise<void>;
    onReorderVariants?: (params: { queryIds: number[] }) => Promise<void>;
};

type VariantItem = {
    queryId: number;
    queryName: string;
    sql: string;
};

const getVariantDisplayName = (name?: string, index = 0): string => {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return `Variant ${index + 1}`;
    if (trimmed.toLowerCase() === 'query') return `Variant ${index + 1}`;
    if (/\s-\squery$/i.test(trimmed)) return `Variant ${index + 1}`;
    return trimmed;
};

const widthToPercent = (width?: OversiktChart['width']): number => {
    if (width === 'full') return 100;
    if (width === 'half') return 50;
    const parsed = Number(width);
    if (!Number.isFinite(parsed) || parsed <= 0) return 50;
    return Math.round(parsed);
};

const EditChartDialog = ({
    open,
    chart,
    defaultWebsiteId,
    dashboardOptions,
    defaultDashboardId = null,
    loading = false,
    error,
    defaultShowSql = false,
    onClose,
    onSave,
    onRenameVariant,
    onDeleteVariant,
    onReorderVariants,
}: EditChartDialogProps) => {
    const initialDashboardId = dashboardOptions && dashboardOptions.length > 0
        ? (defaultDashboardId !== null
            && defaultDashboardId !== undefined
            && dashboardOptions.some((item) => item.id === defaultDashboardId)
            ? defaultDashboardId
            : dashboardOptions[0].id)
        : null;
    const [name, setName] = useState(chart?.title ?? '');
    const [graphType, setGraphType] = useState<GraphType>(chart?.graphType ?? 'TABLE');
    const [width, setWidth] = useState(String(widthToPercent(chart?.width)));
    const [sqlText, setSqlText] = useState(chart?.sql ?? '');
    const [showSql, setShowSql] = useState(false);
    const [addAsVariant, setAddAsVariant] = useState(false);
    const [variantName, setVariantName] = useState('');
    const [showAddVariantControls, setShowAddVariantControls] = useState(false);
    const [variants, setVariants] = useState<VariantItem[]>(chart?.variants ?? []);
    const [selectedVariantQueryId, setSelectedVariantQueryId] = useState<number | null>(chart?.queryId ?? null);
    const [showRenameVariantField, setShowRenameVariantField] = useState(false);
    const [renameVariantValue, setRenameVariantValue] = useState('');
    const [variantActionLoading, setVariantActionLoading] = useState(false);
    const [reorderingVariantQueryId, setReorderingVariantQueryId] = useState<number | null>(null);
    const [draggedVariantQueryId, setDraggedVariantQueryId] = useState<number | null>(null);
    const [dropTargetVariantQueryId, setDropTargetVariantQueryId] = useState<number | null>(null);
    const [reorderAnnouncement, setReorderAnnouncement] = useState('');
    const nextDraftVariantIdRef = useRef(-1);
    const [websites, setWebsites] = useState<Website[]>([]);
    const [websiteId, setWebsiteId] = useState(defaultWebsiteId ?? '');
    const [dashboardId, setDashboardId] = useState<number | null>(initialDashboardId);
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const run = async () => {
            try {
                const items = await fetchWebsites();
                setWebsites(items);
            } catch {
                setWebsites([]);
            }
        };
        void run();
    }, [open]);

    const handleSave = async () => {
        if (!chart) return;
        if (!name.trim()) {
            setLocalError('Grafnavn er påkrevd');
            return;
        }
        if (dashboardOptions && dashboardOptions.length > 0 && !dashboardId) {
            setLocalError('Velg dashboard');
            return;
        }
        if (showSql && !sqlText.trim()) {
            setLocalError('SQL-kode kan ikke være tom når SQL-visning er aktiv');
            return;
        }
        if (showSql && addAsVariant && !variantName.trim()) {
            setLocalError('Variantnavn er påkrevd når du legger til variant');
            return;
        }
        const parsedWidth = Number(width);
        if (!Number.isFinite(parsedWidth)) {
            setLocalError('Bredde må være et tall mellom 0 og 100');
            return;
        }
        const normalizedWidth = parsedWidth <= 0 ? 50 : Math.min(100, Math.max(1, Math.round(parsedWidth)));
        const selectedVariant = variants.find((variant) => variant.queryId === selectedVariantQueryId) ?? null;

        setLocalError(null);
        await onSave({
            name: name.trim(),
            graphType,
            width: normalizedWidth,
            sqlText: showSql ? sqlText : (chart.sql ?? ''),
            websiteId: websiteId || undefined,
            dashboardId: dashboardId ?? undefined,
            addAsVariant: showSql ? addAsVariant : false,
            variantName: showSql && addAsVariant ? variantName.trim() : undefined,
            targetQueryId: selectedVariant?.queryId ?? chart.queryId,
            targetQueryName: selectedVariant?.queryName ?? chart.queryName,
        });
    };

    useEffect(() => {
        if (!open) return;
        const nextVariants = chart?.variants ?? (chart ? [{
            queryId: chart.queryId,
            queryName: chart.queryName,
            sql: chart.sql ?? '',
        }] : []);
        const preferredSelectedQueryId =
            (chart?.queryId && nextVariants.some((variant) => variant.queryId === chart.queryId) ? chart.queryId : null)
            ?? nextVariants[0]?.queryId
            ?? null;

        setVariants(nextVariants);
        setSelectedVariantQueryId(preferredSelectedQueryId);
        const selectedVariant = nextVariants.find((variant) => variant.queryId === preferredSelectedQueryId) ?? nextVariants[0];
        setSqlText(selectedVariant?.sql ?? (chart?.sql ?? ''));
        setAddAsVariant(false);
        setVariantName('');
        setShowAddVariantControls(false);
        setShowSql(defaultShowSql);
        setShowRenameVariantField(false);
        setRenameVariantValue(selectedVariant?.queryName ?? '');
        setReorderingVariantQueryId(null);
        setDraggedVariantQueryId(null);
        setDropTargetVariantQueryId(null);
        setReorderAnnouncement('');
        setLocalError(null);
    }, [open, chart, defaultShowSql]);

    const selectedVariant = variants.find((variant) => variant.queryId === selectedVariantQueryId) ?? variants[0] ?? null;
    const selectedVariantIsDraft = (selectedVariant?.queryId ?? 0) < 0;
    const canDeleteSelectedVariant = variants.length > 1;
    const canReorderVariants =
        variants.length > 1
        && variants.every((variant) => variant.queryId > 0)
        && Boolean(onReorderVariants)
        && reorderingVariantQueryId === null
        && !variantActionLoading;

    const getVariantIndex = (queryId: number) => variants.findIndex((variant) => variant.queryId === queryId);

    const handleMoveVariant = async (fromIndex: number, toIndex: number): Promise<boolean> => {
        if (fromIndex === toIndex) return true;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= variants.length || toIndex >= variants.length) return false;

        const previous = variants;
        const reordered = [...variants];
        const [moved] = reordered.splice(fromIndex, 1);
        if (!moved) return false;
        reordered.splice(toIndex, 0, moved);

        setVariants(reordered);
        setReorderAnnouncement(`${getVariantDisplayName(moved.queryName, toIndex)} flyttet til plass ${toIndex + 1} av ${reordered.length}.`);

        if (!onReorderVariants) return true;

        setReorderingVariantQueryId(moved.queryId);
        setLocalError(null);
        try {
            await onReorderVariants({
                queryIds: reordered.map((variant) => variant.queryId),
            });
            return true;
        } catch (err: unknown) {
            setVariants(previous);
            setLocalError(err instanceof Error ? err.message : 'Kunne ikke endre rekkefølge på varianter');
            setReorderAnnouncement(`Kunne ikke flytte ${getVariantDisplayName(moved.queryName, fromIndex)}. Prøv igjen.`);
            return false;
        } finally {
            setReorderingVariantQueryId(null);
        }
    };

    const handleVariantDragStart = (event: DragEvent<HTMLSpanElement>, queryId: number, queryName: string) => {
        if (!canReorderVariants) return;
        setDraggedVariantQueryId(queryId);
        setDropTargetVariantQueryId(null);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(queryId));

        const index = getVariantIndex(queryId);
        if (index >= 0) {
            setReorderAnnouncement(`${getVariantDisplayName(queryName, index)} valgt for flytting. Plass ${index + 1} av ${variants.length}.`);
        }
    };

    const handleVariantDrop = async (event: DragEvent<HTMLSpanElement>, targetQueryId: number) => {
        if (!canReorderVariants) return;
        event.preventDefault();
        const sourceQueryId = draggedVariantQueryId ?? Number(event.dataTransfer.getData('text/plain'));
        if (!Number.isFinite(sourceQueryId)) return;
        const fromIndex = getVariantIndex(sourceQueryId);
        const toIndex = getVariantIndex(targetQueryId);
        if (fromIndex < 0 || toIndex < 0) return;
        await handleMoveVariant(fromIndex, toIndex);
        setDraggedVariantQueryId(null);
        setDropTargetVariantQueryId(null);
    };

    const handleSelectVariant = (value: string) => {
        const queryId = Number(value);
        if (!Number.isFinite(queryId)) return;
        const nextVariant = variants.find((variant) => variant.queryId === queryId);
        if (!nextVariant) return;
        setSelectedVariantQueryId(queryId);
        setSqlText(nextVariant.sql);
        const isDraft = nextVariant.queryId < 0;
        setAddAsVariant(isDraft);
        setVariantName(isDraft ? nextVariant.queryName : '');
        setShowAddVariantControls(false);
        setShowRenameVariantField(false);
        setRenameVariantValue(nextVariant.queryName);
        setLocalError(null);
    };

    const handleEnableAddVariant = () => {
        setShowAddVariantControls(true);
        setAddAsVariant(false);
        setShowRenameVariantField(false);
        setVariantName('');
        setLocalError(null);
    };

    const handleConfirmAddVariant = () => {
        if (!variantName.trim()) {
            setLocalError('Variantnavn er påkrevd');
            return;
        }
        const draftId = nextDraftVariantIdRef.current;
        nextDraftVariantIdRef.current -= 1;
        const draftName = variantName.trim();
        const draftSql = sqlText;

        setVariants((prev) => [
            ...prev,
            {
                queryId: draftId,
                queryName: draftName,
                sql: draftSql,
            },
        ]);
        setSelectedVariantQueryId(draftId);
        setAddAsVariant(true);
        setShowAddVariantControls(false);
        setLocalError(null);
    };

    const handleCancelAddVariant = () => {
        setShowAddVariantControls(false);
        setAddAsVariant(false);
        setVariantName('');
        setLocalError(null);
    };

    const handleRenameSelectedVariant = async () => {
        if (!selectedVariant || !onRenameVariant) return;
        const trimmed = renameVariantValue.trim();
        if (!trimmed) {
            setLocalError('Variantnavn er påkrevd');
            return;
        }

        setVariantActionLoading(true);
        setLocalError(null);
        try {
            await onRenameVariant({ queryId: selectedVariant.queryId, name: trimmed });
            setVariants((prev) => prev.map((variant) => (
                variant.queryId === selectedVariant.queryId
                    ? { ...variant, queryName: trimmed }
                    : variant
            )));
            setRenameVariantValue(trimmed);
            setShowRenameVariantField(false);
        } catch (err: unknown) {
            setLocalError(err instanceof Error ? err.message : 'Kunne ikke endre navn på variant');
        } finally {
            setVariantActionLoading(false);
        }
    };

    const handleDeleteSelectedVariant = async () => {
        if (!selectedVariant || !onDeleteVariant) return;
        if (!canDeleteSelectedVariant) {
            setLocalError('Du kan ikke slette siste variant');
            return;
        }

        setVariantActionLoading(true);
        setLocalError(null);
        try {
            await onDeleteVariant({ queryId: selectedVariant.queryId });
            setVariants((prev) => {
                const next = prev.filter((variant) => variant.queryId !== selectedVariant.queryId);
                const nextSelected = next[0] ?? null;
                setSelectedVariantQueryId(nextSelected?.queryId ?? null);
                setSqlText(nextSelected?.sql ?? '');
                setRenameVariantValue(nextSelected?.queryName ?? '');
                return next;
            });
            setShowRenameVariantField(false);
            setAddAsVariant(false);
            setShowAddVariantControls(false);
        } catch (err: unknown) {
            setLocalError(err instanceof Error ? err.message : 'Kunne ikke slette variant');
        } finally {
            setVariantActionLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} header={{ heading: 'Rediger graf' }} width="medium">
            <Modal.Body>
                <div className="flex flex-col gap-4">
                    {localError && <Alert variant="error">{localError}</Alert>}
                    {error && <Alert variant="error">{error}</Alert>}
                    <TextField
                        label="Grafnavn"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        size="small"
                    />
                    <Select
                        label="Graftype"
                        value={graphType}
                        onChange={(event) => setGraphType(event.target.value as GraphType)}
                        size="small"
                    >
                        <option value="LINE">Linjediagram</option>
                        <option value="BAR">Stolpediagram</option>
                        <option value="PIE">Sektordiagram</option>
                        <option value="TABLE">Tabell</option>
                    </Select>
                    <TextField
                        label="Bredde (%)"
                        description="Standardbredden er 50%"
                        value={width}
                        onChange={(event) => setWidth(event.target.value)}
                        size="small"
                    />
                    <Select
                        label="Nettside"
                        description="Velg hvilken nettside grafen skal bruke."
                        value={websiteId}
                        onChange={(event) => setWebsiteId(event.target.value)}
                        size="small"
                    >
                        <option value="">Velg nettside</option>
                        {websites.map((website) => (
                            <option key={website.id} value={website.id}>
                                {website.name}
                            </option>
                        ))}
                    </Select>
                    {dashboardOptions && dashboardOptions.length > 0 && (
                        <Select
                            label="Dashboard"
                            value={dashboardId ? String(dashboardId) : ''}
                            onChange={(event) => setDashboardId(Number(event.target.value))}
                            size="small"
                        >
                            <option value="">Velg dashboard</option>
                            {dashboardOptions.map((dashboard) => (
                                <option key={dashboard.id} value={dashboard.id}>
                                    {dashboard.name}
                                </option>
                            ))}
                        </Select>
                    )}
                    <Switch checked={showSql} onChange={(event) => setShowSql(event.target.checked)}>
                        Vis SQL kode / varianter
                    </Switch>
                    {variants.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <Tabs
                                        size="small"
                                        value={String(selectedVariant?.queryId ?? '')}
                                        onChange={handleSelectVariant}
                                    >
                                        <Tabs.List>
                                            {variants.map((variant, index) => (
                                                <Tabs.Tab
                                                    key={variant.queryId}
                                                    value={String(variant.queryId)}
                                                    label={(
                                                        <span
                                                            className={`inline-flex items-center gap-1 rounded ${dropTargetVariantQueryId === variant.queryId ? 'outline outline-2 outline-[var(--ax-border-accent)] outline-offset-2' : ''}`}
                                                            draggable={canReorderVariants}
                                                            onDragStart={(event) => handleVariantDragStart(event, variant.queryId, variant.queryName)}
                                                            onDragEnd={() => {
                                                                setDraggedVariantQueryId(null);
                                                                setDropTargetVariantQueryId(null);
                                                            }}
                                                            onDragOver={(event) => {
                                                                if (!canReorderVariants || draggedVariantQueryId === null) return;
                                                                event.preventDefault();
                                                                event.dataTransfer.dropEffect = 'move';
                                                            }}
                                                            onDragEnter={() => {
                                                                if (!canReorderVariants || draggedVariantQueryId === null || draggedVariantQueryId === variant.queryId) return;
                                                                setDropTargetVariantQueryId(variant.queryId);
                                                            }}
                                                            onDragLeave={() => {
                                                                if (dropTargetVariantQueryId === variant.queryId) setDropTargetVariantQueryId(null);
                                                            }}
                                                            onDrop={(event) => {
                                                                void handleVariantDrop(event, variant.queryId);
                                                            }}
                                                            style={{ opacity: draggedVariantQueryId === variant.queryId ? 0.65 : 1 }}
                                                        >
                                                            {canReorderVariants && (
                                                                <GripVertical aria-hidden size={14} />
                                                            )}
                                                            <span>{getVariantDisplayName(variant.queryName, index)}</span>
                                                        </span>
                                                    )}
                                                />
                                            ))}
                                        </Tabs.List>
                                    </Tabs>
                                </div>
                                {showSql && !showAddVariantControls && (
                                    <Button
                                        type="button"
                                        size="xsmall"
                                        variant="secondary"
                                        onClick={handleEnableAddVariant}
                                    >
                                        Legg til variant
                                    </Button>
                                )}
                                {showSql && !showAddVariantControls && selectedVariant && !selectedVariantIsDraft && (onRenameVariant || onDeleteVariant) && (
                                    <ActionMenu>
                                        <ActionMenu.Trigger>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="xsmall"
                                                icon={<MoreVertical aria-hidden />}
                                                title="Handlinger for valgt variant"
                                            />
                                        </ActionMenu.Trigger>
                                        <ActionMenu.Content align="end">
                                            {onRenameVariant && (
                                                <ActionMenu.Item
                                                    onClick={() => {
                                                        setShowRenameVariantField(true);
                                                        setRenameVariantValue(selectedVariant.queryName ?? '');
                                                        setLocalError(null);
                                                    }}
                                                >
                                                    Gi nytt navn til variant
                                                </ActionMenu.Item>
                                            )}
                                            {onDeleteVariant && (
                                                <ActionMenu.Item
                                                    onClick={() => void handleDeleteSelectedVariant()}
                                                    disabled={!canDeleteSelectedVariant || variantActionLoading}
                                                >
                                                    Slett variant
                                                </ActionMenu.Item>
                                            )}
                                        </ActionMenu.Content>
                                    </ActionMenu>
                                )}
                            </div>
                            <p className="sr-only" aria-live="polite" aria-atomic="true">
                                {reorderAnnouncement}
                            </p>
                        </div>
                    )}
                    {showSql && showAddVariantControls && (
                        <div className="rounded-md border border-[var(--ax-border-neutral-subtle)] p-3">
                            <div className="flex flex-col gap-2">
                                <TextField
                                    label="Variantnavn"
                                    value={variantName}
                                    onChange={(event) => setVariantName(event.target.value)}
                                    size="small"
                                />
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        size="xsmall"
                                        onClick={handleConfirmAddVariant}
                                    >
                                        Legg til
                                    </Button>
                                    <Button
                                        type="button"
                                        size="xsmall"
                                        variant="secondary"
                                        onClick={handleCancelAddVariant}
                                    >
                                        Avbryt
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    {showSql && (
                        <div className="flex flex-col gap-3">
                            {showRenameVariantField && !showAddVariantControls && (
                                <div className="flex flex-col gap-2 rounded-md border border-[var(--ax-border-neutral-subtle)] p-3">
                                    <TextField
                                        label="Nytt variantnavn"
                                        value={renameVariantValue}
                                        onChange={(event) => setRenameVariantValue(event.target.value)}
                                        size="small"
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="xsmall"
                                            onClick={() => void handleRenameSelectedVariant()}
                                            loading={variantActionLoading}
                                        >
                                            Lagre navn
                                        </Button>
                                        <Button
                                            type="button"
                                            size="xsmall"
                                            variant="secondary"
                                            onClick={() => setShowRenameVariantField(false)}
                                            disabled={variantActionLoading}
                                        >
                                            Avbryt
                                        </Button>
                                    </div>
                                </div>
                            )}
                            <Textarea
                                label="SQL-kode"
                                minRows={8}
                                value={sqlText}
                                onChange={(event) => {
                                    const nextSql = event.target.value;
                                    setSqlText(nextSql);
                                    if ((selectedVariant?.queryId ?? 0) < 0) {
                                        setVariants((prev) => prev.map((variant) => (
                                            variant.queryId === selectedVariant?.queryId
                                                ? { ...variant, sql: nextSql }
                                                : variant
                                        )));
                                    }
                                }}
                            />
                        </div>
                    )}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={() => void handleSave()} loading={loading}>
                    Lagre endringer
                </Button>
                <Button variant="secondary" onClick={onClose} disabled={loading}>
                    Avbryt
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default EditChartDialog;
