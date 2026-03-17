import type { SavedChart } from '../../../shared/types/savedChart';

type JsonPrimitive = string | number | boolean | null;
interface JsonObject {
    [key: string]: JsonValue;
}
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type DashboardRow = Record<string, unknown>;

export const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export const getErrorMessage = (value: unknown, fallback: string): string => {
    if (isRecord(value) && typeof value.error === 'string') {
        return value.error;
    }
    return fallback;
};

export const parseDashboardResponse = (value: unknown): { data: DashboardRow[]; totalBytesProcessed?: number } => {
    if (!isRecord(value)) return { data: [] };
    const data = Array.isArray(value.data) ? value.data.filter(isRecord) : [];
    const totalBytesProcessed = isRecord(value.queryStats) && typeof value.queryStats.totalBytesProcessed === 'number'
        ? value.queryStats.totalBytesProcessed
        : undefined;
    return { data, totalBytesProcessed };
};

export const getSpanClass = (width?: SavedChart['width']): string => {
    let span = 10; // Default half (50%) => 10/20

    if (width === 'full') span = 20;
    else if (width === 'half') span = 10;
    else if (width) {
        const val = parseInt(width);
        if (!isNaN(val)) {
            span = Math.round(val * 0.2);
        }
    }

    span = Math.max(1, span);

    const SPAN_CLASSES: Record<number, string> = {
        1: 'md:col-span-1',
        2: 'md:col-span-2',
        3: 'md:col-span-3',
        4: 'md:col-span-4',
        5: 'md:col-span-5',
        6: 'md:col-span-6',
        7: 'md:col-span-7',
        8: 'md:col-span-8',
        9: 'md:col-span-9',
        10: 'md:col-span-10',
        11: 'md:col-span-11',
        12: 'md:col-span-12',
        13: 'md:col-span-13',
        14: 'md:col-span-14',
        15: 'md:col-span-15',
        16: 'md:col-span-16',
        17: 'md:col-span-17',
        18: 'md:col-span-18',
        19: 'md:col-span-19',
        20: 'md:col-span-20',
    };

    return `col-span-full ${SPAN_CLASSES[span] || 'md:col-span-10'}`;
};

export const isClickablePath = (val: unknown): val is string => {
    return typeof val === 'string' && val.startsWith('/') && val !== '/';
};

export const formatTableValue = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    try {
        return JSON.stringify(val);
    } catch {
        return '';
    }
};

export const extractJsonValue = (value: unknown): unknown => {
    if (value && typeof value === 'object' && 'value' in (value as JsonObject)) {
        return (value as JsonObject).value;
    }
    return value;
};
