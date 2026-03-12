import type { ILineChartDataPoint } from '@fluentui/react-charting';
import { LineChart, ResponsiveContainer } from '@fluentui/react-charting';
import { format } from 'date-fns';
import type { DashboardRow } from '../../utils/widgetUtils.ts';
import { extractJsonValue } from '../../utils/widgetUtils.ts';

interface DashboardWidgetLineChartProps {
    data: DashboardRow[];
    title: string;
}

const DashboardWidgetLineChart = ({ data, title }: DashboardWidgetLineChartProps) => {
    const keys = Object.keys(data[0] ?? {});

    const toChartX = (xVal: unknown, fallbackIndex: number): Date | number => {
        const xAsString = (() => {
            if (xVal === null || xVal === undefined) return '';
            if (typeof xVal === 'string' || typeof xVal === 'number' || typeof xVal === 'boolean') return String(xVal);
            if (xVal instanceof Date) return xVal.toISOString();
            return '';
        })();
        const xAsNumber = Number(xVal);
        const isNumericX = xAsString.trim() !== '' && Number.isFinite(xAsNumber);
        const likelyDateString = typeof xVal === 'string' && /[-/:T]/.test(xVal);
        const parsedDate = new Date(xAsString);
        const isDateX = xVal instanceof Date || (likelyDateString && !Number.isNaN(parsedDate.getTime()));

        if (isDateX) return xVal instanceof Date ? xVal : parsedDate;
        if (isNumericX) return xAsNumber;
        return fallbackIndex;
    };

    // Multi-series mode: x, series, y
    if (keys.length >= 3) {
        const xKey = keys[0];
        const seriesKey = keys[1];
        const yKey = keys[2];
        const colors = ['#0067c5', '#ff9100', '#06893a', '#c30000', '#634689', '#a8874c', '#005b82'];
        const seriesMap = new Map<string, ILineChartDataPoint[]>();

        data.forEach((row, index) => {
            const rawX = (row as Record<string, unknown>)[xKey];
            const xVal = extractJsonValue(rawX);
            const rawY = (row as Record<string, unknown>)[yKey];
            const yVal = typeof rawY === 'number' ? rawY : parseFloat(String(rawY)) || 0;
            const seriesName = String((row as Record<string, unknown>)[seriesKey] ?? 'Ukjent');

            const x = toChartX(xVal, index);
            const xLabel = x instanceof Date ? format(x, 'dd.MM') : String(xVal ?? index);

            if (!seriesMap.has(seriesName)) {
                seriesMap.set(seriesName, []);
            }

            seriesMap.get(seriesName)!.push({
                x,
                y: yVal,
                legend: xLabel,
                xAxisCalloutData: xLabel,
                yAxisCalloutData: String(yVal),
            });
        });

        const lines = Array.from(seriesMap.entries()).map(([name, points], index) => ({
            legend: name,
            data: points,
            color: colors[index % colors.length],
        }));

        return (
            <div style={{ width: '100%', height: '350px' }}>
                <ResponsiveContainer>
                    <LineChart
                        key={`line-multi-${lines.length}-${data.length}`}
                        data={{ lineChartData: lines }}
                        yAxisTickFormat={(d: number) => d.toLocaleString('nb-NO')}
                        margins={{ left: 60, right: 40, top: 20, bottom: 40 }}
                        styles={{
                            xAxis: { text: { fill: 'var(--ax-text-subtle)' } },
                            yAxis: { text: { fill: 'var(--ax-text-subtle)' } },
                        }}
                        legendProps={{
                            styles: {
                                text: { color: 'var(--ax-text-subtle)' },
                            },
                        }}
                    />
                </ResponsiveContainer>
            </div>
        );
    }

    const points: ILineChartDataPoint[] = data.map((row, index) => {
        const xKey = keys[0];
        const yKey = keys[1];
        const rawX = (row as Record<string, unknown>)[xKey];
        const xVal = extractJsonValue(rawX);
        const rawY = (row as Record<string, unknown>)[yKey];
        const yVal = typeof rawY === 'number' ? rawY : parseFloat(String(rawY)) || 0;
        const x = toChartX(xVal, index);
        const xLabel = x instanceof Date ? format(x, 'dd.MM') : String(xVal ?? index);
        return {
            x,
            y: yVal,
            legend: xLabel,
            xAxisCalloutData: xLabel,
            yAxisCalloutData: String(yVal),
        };
    });

    const lines = [{
        legend: title,
        data: points,
        color: '#0067c5',
    }];

    const firstX = points[0]?.x;
    const lastX = points[points.length - 1]?.x;
    const chartKey = `line-${points.length}-${firstX instanceof Date ? firstX.getTime() : firstX || 0}-${lastX instanceof Date ? lastX.getTime() : lastX || 0}`;

    return (
        <div style={{ width: '100%', height: '350px' }}>
            <ResponsiveContainer>
                <LineChart
                    key={chartKey}
                    data={{ lineChartData: lines }}
                    yAxisTickFormat={(d: number) => d.toLocaleString('nb-NO')}
                    margins={{ left: 60, right: 40, top: 20, bottom: 40 }}
                    styles={{
                        xAxis: { text: { fill: 'var(--ax-text-subtle)' } },
                        yAxis: { text: { fill: 'var(--ax-text-subtle)' } },
                    }}
                    legendProps={{
                        styles: {
                            text: { color: 'var(--ax-text-subtle)' },
                        },
                    }}
                />
            </ResponsiveContainer>
        </div>
    );
};

export default DashboardWidgetLineChart;
