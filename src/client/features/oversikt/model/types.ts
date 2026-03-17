import type { SavedChart } from '../../../shared/types/savedChart';
import type { GraphDto, QueryDto } from '../../../shared/types/backend';

export type {
    ProjectDto,
    DashboardDto,
    GraphCategoryDto,
    GraphCategoryOrderingEntry,
    GraphDto,
    GraphOrderingEntry,
    QueryDto,
    QueryOrderingEntry,
} from '../../../shared/types/backend';

export type GraphWithQueries = {
    graph: GraphDto;
    queries: QueryDto[];
    categoryId: number;
};

export type GraphType = 'LINE' | 'BAR' | 'PIE' | 'TABLE' | 'TEXT';

export type MetricType = 'visitors' | 'pageviews' | 'proportion' | 'visits';

export type FilterState = {
    urlFilters: string[];
    dateRange: string;
    pathOperator: string;
    metricType: MetricType;
    customStartDate?: Date;
    customEndDate?: Date;
};

export type OversiktSelectOption = {
    label: string;
    value: string;
};

export type OversiktChart = SavedChart & {
    graphId: number;
    graphType: GraphType;
    queryId: number;
    queryName: string;
    categoryId: number;
    variants?: Array<{
        queryId: number;
        queryName: string;
        sql: string;
    }>;
};

export type { SavedChart };
