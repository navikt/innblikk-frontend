export interface SavedChart {
    id?: string;
    title: string;
    type: 'line' | 'bar' | 'pie' | 'table' | 'title' | 'siteimprove' | 'text';
    sql?: string;
    width?: 'full' | 'half' | string;
    description?: string;
    config?: any; // ChartConfig | null
    filters?: any[]; // Filter[]
    isStandardWidget?: boolean;
    // Siteimprove specific config
    siteimprove_id?: string; // Site ID for Siteimprove (overrides team lookup)
    siteimprove_portal_id?: string; // Site ID used in Siteimprove Portal URL (if different)
    // If true, extract __TOTAL__ row from data and display as header total
    showTotal?: boolean;
}

// Configuration for which standard filters should be hidden
export interface HiddenFiltersConfig {
    website?: boolean;       // "Nettside eller app" picker
    urlPath?: boolean;       // "URL-sti" filter with operator
    dateRange?: boolean;     // "Datoperiode" filter
    metricType?: boolean;    // "Visning" filter
}

// Definition for a custom filter (e.g., Nav fylkeskontor selector)
export interface CustomFilterDefinition {
    id: string;
    label: string;
    type: 'select';
    // Options with optional slug for clean URLs and siteimprove_groupid
    options: { label: string; value: string; slug?: string; siteimprove_groupid?: string }[];
    // When selected, how should we apply the filter?
    // For now, supporting path-based filtering
    appliesTo: 'urlPath';
    pathOperator: 'equals' | 'starts-with';
    // Whether this filter is required before showing content
    required?: boolean;
    // URL parameter name for deep-linking
    urlParam?: string;
}

// Configuration for default filter values (used when filters are hidden)
export interface DefaultFilterValues {
    websiteId?: string;
    pathOperator?: 'equals' | 'starts-with';
    urlPaths?: string[];
}

export interface DashboardConfig {
    title: string;
    description?: string;
    charts: SavedChart[];
    // Filter configuration
    hiddenFilters?: HiddenFiltersConfig;
    customFilters?: CustomFilterDefinition[];
    defaultFilterValues?: DefaultFilterValues;
    // Message to show when required custom filters are not selected
    customFilterRequiredMessage?: string;
    // Which metric types to show in the "Visning" filter (defaults to all if not specified)
    metricTypeOptions?: ('visitors' | 'pageviews' | 'proportion' | 'visits')[];
    // If false, disable URL path action menu in table charts
    dashboardChartLinks?: boolean;
}
