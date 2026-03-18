import type { DiagnosisData, HistoryData } from '../model/types.ts';
import type { ILineChartDataPoint, ILineChartProps } from '@fluentui/react-charting';
import { startOfWeek, endOfWeek, subDays } from 'date-fns';

export const isDevDomain = (domain: string | null): boolean => {
    if (!domain) return false;
    const d = domain.toLowerCase();
    return d.includes('dev') || d.includes('test') || d.includes('localhost');
};

export const getEnvironmentTitle = (environment: string): string => {
    switch (environment) {
        case 'prod': return 'Prod-miljø';
        case 'dev': return 'Dev-miljø';
        default: return 'Alle miljø';
    }
};

export interface DateRange {
    startDate: Date;
    endDate: Date;
}

export const calculateDateRange = (
    period: string,
    customStartDate?: Date,
    customEndDate?: Date,
): DateRange | null => {
    const now = new Date();

    if (period === 'today') {
        return {
            startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
            endDate: now,
        };
    }

    if (period === 'yesterday') {
        const yesterday = subDays(now, 1);
        return {
            startDate: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0),
            endDate: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999),
        };
    }

    if (period === 'this_week') {
        return {
            startDate: startOfWeek(now, { weekStartsOn: 1 }),
            endDate: now,
        };
    }

    if (period === 'last_7_days') {
        return {
            startDate: new Date(subDays(now, 6).setHours(0, 0, 0, 0)),
            endDate: now,
        };
    }

    if (period === 'last_week') {
        const previousWeek = subDays(now, 7);
        return {
            startDate: startOfWeek(previousWeek, { weekStartsOn: 1 }),
            endDate: endOfWeek(previousWeek, { weekStartsOn: 1 }),
        };
    }

    if (period === 'last_28_days') {
        return {
            startDate: new Date(subDays(now, 27).setHours(0, 0, 0, 0)),
            endDate: now,
        };
    }

    if (period === 'current_month') {
        return {
            startDate: new Date(now.getFullYear(), now.getMonth(), 1),
            endDate: now,
        };
    }

    if (period === 'last_month') {
        return {
            startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            endDate: new Date(now.getFullYear(), now.getMonth(), 0),
        };
    }

    if (period === 'custom') {
        if (!customStartDate || !customEndDate) return null;

        const startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);

        const isToday =
            customEndDate.getDate() === now.getDate() &&
            customEndDate.getMonth() === now.getMonth() &&
            customEndDate.getFullYear() === now.getFullYear();

        const endDate = isToday ? now : new Date(customEndDate);
        if (!isToday) endDate.setHours(23, 59, 59, 999);

        return { startDate, endDate };
    }

    // Default: current month
    return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: now,
    };
};

export const filterByEnvironment = (data: DiagnosisData[], environment: string): DiagnosisData[] =>
    data.filter(row => {
        if (environment === 'prod') return !isDevDomain(row.domain);
        if (environment === 'dev') return isDevDomain(row.domain);
        return true;
    });

export const filterByTab = (data: DiagnosisData[], activeTab: string): DiagnosisData[] =>
    data.filter(row => {
        if (activeTab === 'attention') return !row.last_event_at;
        return true;
    });

export interface SortState {
    orderBy: string;
    direction: 'ascending' | 'descending';
}

export const sortDiagnosisData = (data: DiagnosisData[], sort: SortState): DiagnosisData[] =>
    [...data].sort((a, b) => {
        const { orderBy, direction } = sort;
        let aValue: number;
        let bValue: number;

        if (orderBy === 'pageviews') {
            aValue = a.pageviews;
            bValue = b.pageviews;
        } else if (orderBy === 'custom_events') {
            aValue = a.custom_events;
            bValue = b.custom_events;
        } else if (orderBy === 'total') {
            aValue = a.pageviews + a.custom_events;
            bValue = b.pageviews + b.custom_events;
        } else if (orderBy === 'last_event_at') {
            aValue = a.last_event_at ? new Date(a.last_event_at).getTime() : 0;
            bValue = b.last_event_at ? new Date(b.last_event_at).getTime() : 0;
        } else {
            return 0;
        }

        if (aValue < bValue) return direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return direction === 'ascending' ? 1 : -1;
        return 0;
    });

export const buildChartData = (historyData: HistoryData[]): ILineChartProps | null => {
    if (historyData.length === 0) return null;

    const pageviewPoints: ILineChartDataPoint[] = historyData.map(item => ({
        x: new Date(item.month + '-01'),
        y: item.pageviews,
        legend: item.month,
        xAxisCalloutData: item.month,
        yAxisCalloutData: `${item.pageviews} sidevisninger`,
    }));

    const customEventPoints: ILineChartDataPoint[] = historyData.map(item => ({
        x: new Date(item.month + '-01'),
        y: item.custom_events,
        legend: item.month,
        xAxisCalloutData: item.month,
        yAxisCalloutData: `${item.custom_events} egendefinerte`,
    }));

    return {
        data: {
            lineChartData: [
                { legend: 'Sidevisninger', data: pageviewPoints, color: '#0067c5' },
                { legend: 'Egendefinerte', data: customEventPoints, color: '#c30000' },
            ],
        },
    };
};
