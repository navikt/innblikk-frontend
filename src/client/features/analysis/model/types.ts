import type { ComponentType } from 'react';
import type { ILineChartProps } from '@fluentui/react-charting';
import type { QueryStats } from '../../../shared/types/queryStats';

// ===== BrokenLinks types =====

export interface BrokenLink {
    id: number;
    url: string;
    checking_now: boolean;
    last_checked: string;
    first_detected: string;
    pages: number;
}

export interface PageWithBrokenLinks {
    id: number;
    url: string;
    broken_links: number;
}

export interface PageBrokenLink {
    url: string;
    link_text?: string;
}

export interface BrokenLinkPage {
    url: string;
    title?: string;
}

export interface CrawlData {
    last_crawl: string;
    next_crawl: string;
    is_crawl_enabled: boolean;
    is_crawl_running: boolean;
    permission: string;
}

export type SiteimproveListResponse<T> = { items?: T[] };

export type TeamData = {
    teamDomain?: string;
    teamSiteimproveSite?: string | number | boolean;
    [key: string]: unknown;
};

// ===== Diagnosis types =====

export interface DiagnosisData {
    website_id: string;
    website_name: string;
    domain: string | null;
    pageviews: number;
    custom_events: number;
    last_event_at: string | null;
}

export interface HistoryData {
    month: string;
    pageviews: number;
    custom_events: number;
}

export type { QueryStats };

export type DiagnosisResponse = {
    error?: string;
    data?: DiagnosisData[];
    queryStats?: QueryStats;
};

export type DiagnosisHistoryResponse = {
    history?: HistoryData[];
    lastEventAt?: string | null;
    queryStats?: QueryStats;
};

// ===== PrivacyCheck types =====

export type PrivacyRow = {
    match_type: string;
    examples?: string[];
    count: number;
    unique_count?: number;
    nav_count?: number;
    unique_nav_count?: number;
    unique_other_count?: number;
    website_id?: string;
    website_name?: string;
    table_name: string;
    column_name: string;
};

// ===== WebsitePicker types =====

export interface EventProperty {
    eventName: string;
    propertyName: string;
    total: number;
    type?: 'string' | 'number';
}

export interface ApiCache {
    [websiteId: string]: {
        properties?: EventProperty[];
    }
}

import type { Website } from '../../../shared/types/chart.ts';
import type { SavedChart } from '../../../../data/dashboard';

export interface WebsiteApiResponse {
    data: Website[];
}

// ===== Spellings types =====

export interface SpellingIssue {
    id: number;
    word: string;
    suggestions?: string[];
    context?: string;
}

export interface QualityAssuranceCheck {
    id: number;
    check_date: string;
    misspellings: number;
    potential_misspellings: number;
}

export interface QualityAssuranceHistoryResponse {
    items: QualityAssuranceCheck[];
    total_items: number;
}

export interface SpellingCrawlData {
    last_crawl?: string;
    next_crawl?: string;
    is_crawl_running?: boolean;
}

export interface SiteimprovePageItem {
    id: number;
    url: string;
}

export interface SiteimprovePageResponse {
    items?: SiteimprovePageItem[];
}

export interface SiteimproveSpellingResponse {
    items?: SpellingIssue[];
}

export type SpellingsTeamDataEntry = {
    teamDomain?: string;
    teamSiteimproveSite?: string | number;
};

// ===== AnalysisActionModal types =====

export type AnalysisActionModalWebsite = {
    id: string;
    domain?: string;
    name?: string;
};

export type AnalysisActionModalWebsitesResponse = {
    data: AnalysisActionModalWebsite[];
};

export interface AnalysisActionModalProps {
    open: boolean;
    onClose: () => void;
    urlPath: string | null;
    websiteId?: string;
    period?: string;
    domain?: string;
    websiteName?: string;
}

// ===== ChartActionModal types =====

export interface ChartActionModalFilters {
    urlFilters: string[];
    dateRange: string;
    pathOperator: string;
    metricType: 'visitors' | 'pageviews' | 'proportion' | 'visits';
    customStartDate?: Date;
    customEndDate?: Date;
}

export interface ChartActionModalProps {
    open: boolean;
    onClose: () => void;
    chart: SavedChart;
    websiteId: string;
    filters: ChartActionModalFilters;
    domain?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any[];
    dashboardTitle?: string;
    onEditChart?: () => void;
    onDeleteChart?: () => void;
    onCopyChart?: () => void;
    onMoveChart?: () => void;
    hideUsageActions?: boolean;
}

// ===== ChartLayout types =====

export const SHARED_PARAMS = ['urlPath', 'pagePath', 'period', 'startDate', 'endDate', 'from', 'to', 'websiteId', 'domain', 'pathOperator'];

// ===== CookieMixNotice types =====

export type CookieMixNoticeProps = {
    websiteName?: string | null;
    cookieStartDate?: Date | null;
    variant?: 'mix' | 'pre';
};

// ===== PeriodPicker types =====

export interface PeriodPickerProps {
    period: string;
    onPeriodChange: (period: string) => void;
    startDate: Date | undefined;
    onStartDateChange: (date: Date | undefined) => void;
    endDate: Date | undefined;
    onEndDateChange: (date: Date | undefined) => void;
    lastMonthLabel?: string;
    currentMonthLabel?: string;
    showShortPeriods?: boolean;
}

// ===== UrlPathFilter types =====

export interface UrlPathFilterProps {
    urlPaths: string[];
    onUrlPathsChange: (paths: string[]) => void;
    pathOperator: string;
    onPathOperatorChange: (operator: string) => void;
    selectedWebsiteDomain?: string;
    label?: string;
    placeholder?: string;
    size?: 'small' | 'medium';
    hideLabel?: boolean;
    showOperator?: boolean;
    showSuggestions?: boolean;
    className?: string;
}

export interface PendingSwitchData {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    website: any;
    path: string;
    originalUrl: string;
}

// ===== Traffic / InnOgUtganger types =====


export type EntranceRow = {
    name: string;
    count: number;
    type: 'external' | 'internal';
    isDomainInternal?: boolean;
};

export type SummaryRow = {
    name: string;
    count: number;
};

export type CombinedEntrancesTableProps = {
    title: string;
    data: EntranceRow[];
    onRowClick?: (name: string) => void;
    selectedWebsite: Website | null;
    metricLabel: string;
};

export type ExternalTrafficTableProps = {
    title: string;
    data: SummaryRow[];
    metricLabel: string;
    websiteDomain?: string;
};

export type TrafficTableProps = {
    title: string;
    data: { name: string; count: number; previousCount?: number; deltaCount?: number }[];
    onRowClick?: (name: string) => void;
    selectedWebsite: Website | null;
    metricLabel: string;
    showCompare?: boolean;
};

export type InnOgUtgangerTabContentProps = {
    hasAttemptedFetch: boolean;
    isLoadingExternalReferrers: boolean;
    hasFetchedExternalReferrers: boolean;
    isLoadingBreakdown: boolean;
    hasFetchedBreakdown: boolean;
    combinedEntrances: EntranceRow[];
    entranceSummaryWithUnknown: SummaryRow[];
    exits: { name: string; count: number }[];
    selectedWebsite: Website | null;
    metricLabel: string;
    onSelectInternalUrl: (name: string) => void;
    onNavigateToJourney: () => void;
    CombinedEntrancesTableComponent: ComponentType<CombinedEntrancesTableProps>;
    ExternalTrafficTableComponent: ComponentType<ExternalTrafficTableProps>;
    TrafficTableComponent: ComponentType<TrafficTableProps>;
};

// ===== OversiktTabContent types =====


export type Granularity = 'day' | 'week' | 'month' | 'hour';

export type ComparisonSummary = {
    currentValue: number;
    previousValue: number;
    deltaValue: number;
    deltaPercent: number | null;
};

export type ComparisonRangeLabel = {
    current: string;
    previous: string;
};

export type SeriesPoint = {
    time: string;
    count: number;
};

export type IncludedPageRow = {
    name: string;
    count: number;
    previousCount?: number;
    deltaCount?: number;
};

export type ChartDataTableProps = {
    data: SeriesPoint[];
    previousData: SeriesPoint[];
    metricLabel: string;
    submittedDateRange: { startDate: Date; endDate: Date } | null;
    submittedPreviousDateRange: { startDate: Date; endDate: Date } | null;
};

export type OversiktTabContentProps = {
    hasAttemptedFetch: boolean;
    isLoadingPageMetrics: boolean;
    hasFetchedPageMetrics: boolean;
    submittedComparePreviousPeriod: boolean;
    comparisonSummary: ComparisonSummary | null;
    comparisonRangeLabel: ComparisonRangeLabel | null;
    submittedDateRange: { startDate: Date; endDate: Date } | null;
    submittedPreviousDateRange: { startDate: Date; endDate: Date } | null;
    formatComparisonValue: (value: number) => string;
    formatComparisonDelta: (value: number) => string;
    seriesData: SeriesPoint[];
    submittedMetricType: string;
    totalOverride?: number;
    submittedGranularity: Granularity;
    showAverage: boolean;
    onShowAverageChange: (checked: boolean) => void;
    comparePreviousPeriod: boolean;
    onComparePreviousPeriodChange: (checked: boolean) => void;
    granularity: Granularity;
    onGranularityChange: (value: Granularity) => void;
    chartData: ILineChartProps['data'] | null;
    chartYMax: number;
    chartYMin: number;
    chartKey: string;
    processedSeriesData: SeriesPoint[];
    processedPreviousSeriesData: SeriesPoint[];
    getMetricLabelWithCount: (type: string) => string;
    includedPagesWithCompare: IncludedPageRow[];
    onSelectInternalUrl: (name: string) => void;
    selectedWebsite: Website | null;
    getMetricLabelCapitalized: (type: string) => string;
    ChartDataTableComponent: ComponentType<ChartDataTableProps>;
    TrafficTableComponent: ComponentType<TrafficTableProps>;
};

// ===== TrafficStats types =====

export interface TrafficStatsProps {
    data: SeriesPoint[];
    metricType: string;
    totalOverride?: number;
    granularity?: Granularity;
}

// ===== UmamiTrafficView types =====

export interface UmamiNode {
    nodeId: string;
    name: string;
    color?: string;
}

export interface UmamiLink {
    source: number;
    target: number;
    value: number;
}

export interface UmamiJourneyViewProps {
    nodes: UmamiNode[];
    links: UmamiLink[];
    isFullscreen?: boolean;
    metricLabel?: string;
}

export interface StepData {
    step: number;
    items: {
        name: string;
        value: number;
        percentage: number;
        nodeId: string;
    }[];
    totalValue: number;
}

export interface ConnectionPath {
    d: string;
    opacity: number;
}

// ===== UmamiJourneyView (journey) types =====

export interface UmamiJourneyFullViewProps {
    nodes: UmamiNode[];
    links: UmamiLink[];
    isFullscreen?: boolean;
    reverseVisualOrder?: boolean;
    journeyDirection?: string;
    websiteId?: string;
    period?: string;
    customStartDate?: Date;
    customEndDate?: Date;
    domain?: string;
    onLoadMore?: (increment: number) => void;
    isLoadingMore?: boolean;
}

export interface JourneyStepData {
    step: number;
    displayStep: number;
    items: {
        name: string;
        value: number;
        percentage: number;
        nodeId: string;
    }[];
    totalValue: number;
}

export interface JourneyFunnelStep {
    nodeId: string;
    path: string;
    step: number;
}

// ===== HorizontalFunnelChart types =====

export interface HorizontalFunnelStep {
    step: number;
    count: number;
    url?: string;
    dropoff?: number;
    conversionRate?: number;
    params?: { key: string; value: string; operator: 'equals' | 'contains' }[];
}

export interface HorizontalFunnelChartProps {
    data: HorizontalFunnelStep[];
    loading?: boolean;
    websiteId?: string;
    period?: string;
}

export interface FunnelChartProps {
    data: HorizontalFunnelStep[];
    loading?: boolean;
    websiteId?: string;
    period?: string;
}

// ===== FunnelStats types =====

export interface FunnelStatsStep {
    count: number;
}

export interface FunnelStatsProps {
    data: FunnelStatsStep[];
}
