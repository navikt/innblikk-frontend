import React from 'react';
import type { TrafficStatsProps } from '../../model/types.ts';
import { computeTrafficStats, formatMetricValue } from '../../utils/trafficStats.ts';

const TrafficStats: React.FC<TrafficStatsProps> = ({ data, metricType, totalOverride, granularity = 'day' }) => {
    const stats = computeTrafficStats(data, metricType, totalOverride, granularity);
    if (!stats) return null;

    const { box1Label, box1Value, box2Label, box2Value, box2Suffix, box3Label, box3Value, box3Subtext, valueSuffix } = stats;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
                <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">{box1Label}</div>
                <div className="text-2xl font-bold text-[var(--ax-text-default)] flex items-baseline gap-2">
                    {formatMetricValue(box1Value, metricType)}
                    {valueSuffix && (
                        <span className="text-sm font-normal text-[var(--ax-text-neutral-subtle)]">
                            {valueSuffix}
                        </span>
                    )}
                </div>
            </div>
            <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
                <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">{box2Label}</div>
                <div className="text-2xl font-bold text-[var(--ax-text-default)] flex items-baseline flex-wrap gap-2">
                    {formatMetricValue(box2Value, metricType)}
                    {box2Suffix && (
                        <span className="text-sm font-normal text-[var(--ax-text-neutral-subtle)]">
                            {box2Suffix}
                        </span>
                    )}
                </div>
            </div>
            <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
                <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">{box3Label}</div>
                <div className="text-2xl font-bold text-[var(--ax-text-default)] flex items-baseline flex-wrap gap-2">
                    {formatMetricValue(box3Value, metricType)}
                    {(valueSuffix || box3Subtext) && (
                        <span className="text-sm font-normal text-[var(--ax-text-neutral-subtle)] inline-flex flex-wrap gap-1">
                            {valueSuffix && <span>{valueSuffix}</span>}
                            {box3Subtext && <span>{box3Subtext}</span>}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrafficStats;
