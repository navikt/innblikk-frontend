import type React from 'react';
import { useMemo, useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import type { UmamiNode, UmamiLink, ConnectionPath, JourneyFunnelStep, JourneyStepData } from '../model/types.ts';
import { processJourneyFullData, getJourneyConnectedNodeIds } from '../utils/umamiJourney.ts';

export const useUmamiJourney = (
    nodes: UmamiNode[],
    links: UmamiLink[],
    isFullscreen: boolean,
    reverseVisualOrder: boolean,
    journeyDirection: string,
    websiteId?: string,
    period: string = 'current_month',
    customStartDate?: Date,
    customEndDate?: Date,
) => {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
    const [paths, setPaths] = useState<ConnectionPath[]>([]);
    const [funnelSteps, setFunnelSteps] = useState<JourneyFunnelStep[]>([]);

    const contentRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    // Process data
    const { stepsData, adjacency, reverseAdjacency } = useMemo(
        () => processJourneyFullData(nodes, links, journeyDirection),
        [nodes, links, journeyDirection],
    );

    // Preselect the first node when new data loads
    useEffect(() => {
        if (!stepsData.length) {
            const t = setTimeout(() => setSelectedNodeId(null), 0);
            return () => clearTimeout(t);
        }

        const t = setTimeout(() => {
            setSelectedNodeId((prevSelectedNodeId: string | null) => {
                const hasPreviousSelection = prevSelectedNodeId
                    ? stepsData.some((step: JourneyStepData) => step.items.some((item) => item.nodeId === prevSelectedNodeId))
                    : false;

                if (hasPreviousSelection) return prevSelectedNodeId;
                return stepsData[0]?.items[0]?.nodeId ?? null;
            });
        }, 0);

        return () => clearTimeout(t);
    }, [stepsData]);

    // Determine connected nodes for highlighting
    const connectedNodeIds = useMemo(
        () => (selectedNodeId ? getJourneyConnectedNodeIds(selectedNodeId, nodes, adjacency, reverseAdjacency) : new Set<string>()),
        [selectedNodeId, nodes, adjacency, reverseAdjacency],
    );

    // Calculate SVG paths
    useLayoutEffect(() => {
        if (!selectedNodeId || !contentRef.current) {
            const t = setTimeout(() => setPaths([]), 0);
            return () => clearTimeout(t);
        }

        const rafId = requestAnimationFrame(() => {
            if (!contentRef.current) return;

            const newPaths: ConnectionPath[] = [];
            const contentRect = contentRef.current.getBoundingClientRect();

            const createPath = (sourceId: string, targetId: string): string | null => {
                const sourceEl = nodeRefs.current.get(sourceId);
                const targetEl = nodeRefs.current.get(targetId);
                if (!sourceEl || !targetEl) return null;

                const sourceRect = sourceEl.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();

                let x1: number, x2: number;

                if (reverseVisualOrder) {
                    x1 = sourceRect.left - contentRect.left;
                    x2 = targetRect.right - contentRect.left;
                } else {
                    x1 = sourceRect.right - contentRect.left;
                    x2 = targetRect.left - contentRect.left;
                }

                const y1 = sourceRect.top + sourceRect.height / 2 - contentRect.top;
                const y2 = targetRect.top + targetRect.height / 2 - contentRect.top;

                const dist = Math.abs(x2 - x1);
                const cp1x = reverseVisualOrder ? x1 - dist * 0.5 : x1 + dist * 0.5;
                const cp2x = reverseVisualOrder ? x2 + dist * 0.5 : x2 - dist * 0.5;

                return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
            };

            links.forEach(link => {
                const sourceNode = nodes[link.source];
                const targetNode = nodes[link.target];

                if (sourceNode && targetNode && connectedNodeIds.has(sourceNode.nodeId) && connectedNodeIds.has(targetNode.nodeId)) {
                    const d = createPath(sourceNode.nodeId, targetNode.nodeId);
                    if (d) newPaths.push({ d, opacity: 0.8 });
                }
            });

            setPaths(newPaths);
        });

        return () => cancelAnimationFrame(rafId);
    }, [selectedNodeId, nodes, links, stepsData, connectedNodeIds, isFullscreen, reverseVisualOrder]);

    // Handle resize
    useLayoutEffect(() => {
        const handleResize = () => setSelectedNodeId(prev => prev);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Auto-scroll to right if reversed
    useLayoutEffect(() => {
        if (reverseVisualOrder && containerRef.current) {
            containerRef.current.scrollLeft = containerRef.current.scrollWidth;
        } else if (!reverseVisualOrder && containerRef.current) {
            containerRef.current.scrollLeft = 0;
        }
    }, [reverseVisualOrder]);

    const toggleNode = useCallback((nodeId: string) => {
        setSelectedNodeId(prev => (prev === nodeId ? null : nodeId));
    }, []);

    const toggleFunnelStep = useCallback((e: React.MouseEvent, nodeId: string, path: string, step: number) => {
        e.stopPropagation();
        setFunnelSteps((prev: JourneyFunnelStep[]): JourneyFunnelStep[] => {
            const exists = prev.some((s: JourneyFunnelStep) => s.nodeId === nodeId);
            if (exists) return prev.filter((s: JourneyFunnelStep) => s.nodeId !== nodeId);
            return [...prev, { nodeId, path, step }];
        });
    }, []);

    const clearFunnelSteps = useCallback(() => {
        setFunnelSteps([]);
    }, []);

    const navigateToFunnel = useCallback(() => {
        if (funnelSteps.length < 2 || !websiteId) return;

        const sortedSteps: JourneyFunnelStep[] = [...funnelSteps].sort((a: JourneyFunnelStep, b: JourneyFunnelStep) => {
            if (journeyDirection === 'backward') return b.step - a.step;
            return a.step - b.step;
        });

        const params = new URLSearchParams();
        params.set('websiteId', websiteId);
        params.set('period', period);
        params.set('strict', 'true');

        if (period === 'custom' && customStartDate && customEndDate) {
            params.set('from', format(customStartDate, 'yyyy-MM-dd'));
            params.set('to', format(customEndDate, 'yyyy-MM-dd'));
        } else if (period === 'custom') {
            const currentParams = new URLSearchParams(window.location.search);
            const from = currentParams.get('from');
            const to = currentParams.get('to');
            if (from && to) {
                params.set('from', from);
                params.set('to', to);
            }
        }

        sortedSteps.forEach((s: JourneyFunnelStep) => {
            params.append('step', s.path);
        });

        const url = `/trakt?${params.toString()}`;
        window.open(url, '_blank');
    }, [funnelSteps, websiteId, journeyDirection, period, customStartDate, customEndDate]);

    const openActionModal = useCallback((name: string) => {
        setSelectedUrl(name);
    }, []);

    const closeActionModal = useCallback(() => {
        setSelectedUrl(null);
    }, []);

    return {
        stepsData,
        selectedNodeId,
        connectedNodeIds,
        paths,
        funnelSteps,
        selectedUrl,
        contentRef,
        containerRef,
        nodeRefs,
        toggleNode,
        toggleFunnelStep,
        clearFunnelSteps,
        navigateToFunnel,
        openActionModal,
        closeActionModal,
    };
};
