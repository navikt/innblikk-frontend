import type { SeriesPoint, Granularity } from '../model/types.ts';

export const formatMetricValue = (val: number, metricType: string): string => {
    if (metricType === 'proportion') {
        return `${(val * 100).toFixed(1)}%`;
    }
    return Math.round(val).toLocaleString('nb-NO');
};

export const getMetricLabel = (type: string): string => {
    switch (type) {
        case 'pageviews': return 'sidevisninger';
        case 'visits': return 'økter';
        default: return 'unike besøkende';
    }
};

export const getTimeUnitLabel = (granularity: Granularity): string => {
    switch (granularity) {
        case 'hour': return 'time';
        case 'week': return 'uke';
        case 'month': return 'måned';
        default: return 'dag';
    }
};

const formatMaxLabel = (time: string, granularity: Granularity): string => {
    const date = new Date(time);
    if (granularity === 'hour') {
        const timeStr = date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
        return `${date.toLocaleDateString('nb-NO')} ${timeStr}`;
    }
    if (granularity === 'month') {
        return date.toLocaleString('nb-NO', { month: 'long', year: 'numeric' });
    }
    return date.toLocaleDateString('nb-NO');
};

export interface TrafficStatsBoxes {
    box1Label: string;
    box1Value: number;
    box2Label: string;
    box2Value: number;
    box2Suffix: string;
    box3Label: string;
    box3Value: number;
    box3Subtext: string;
    valueSuffix: string;
}

export const computeTrafficStats = (
    data: SeriesPoint[],
    metricType: string,
    totalOverride: number | undefined,
    granularity: Granularity,
): TrafficStatsBoxes | null => {
    if (!data || data.length === 0) return null;

    const values = data.map(item => item.count);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    const maxItem = data.reduce(
        (prev, current) => (prev.count > current.count ? prev : current),
        data[0],
    );
    const max = maxItem.count;
    const maxLabelText = formatMaxLabel(maxItem.time, granularity);

    const sortedValues = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sortedValues.length / 2);
    const median =
        sortedValues.length % 2 !== 0
            ? sortedValues[mid]
            : (sortedValues[mid - 1] + sortedValues[mid]) / 2;

    const valueSuffix = metricType === 'proportion' ? '' : getMetricLabel(metricType);
    const timeUnitLabel = getTimeUnitLabel(granularity);

    if (metricType === 'proportion') {
        return {
            box1Label: 'Gjennomsnittlig andel',
            box1Value: avg,
            box2Label: 'Median andel',
            box2Value: median,
            box2Suffix: '',
            box3Label: 'Høyeste andel',
            box3Value: max,
            box3Subtext: maxLabelText,
            valueSuffix,
        };
    }

    let box3Label = 'Topp-periode';
    if (granularity === 'day') box3Label = 'Toppdag';
    if (granularity === 'hour') box3Label = 'Topp-time';

    return {
        box1Label: 'Totalt',
        box1Value: totalOverride !== undefined ? totalOverride : sum,
        box2Label: `Snitt per ${timeUnitLabel}`,
        box2Value: avg,
        box2Suffix: `${valueSuffix} (median: ${formatMetricValue(median, metricType)})`,
        box3Label: `${box3Label} ${maxLabelText}`,
        box3Value: max,
        box3Subtext: '',
        valueSuffix,
    };
};
