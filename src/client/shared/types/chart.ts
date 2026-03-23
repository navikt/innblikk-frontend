import type { Website } from './website';

export interface Filter {
  column: string;
  operator?: string;
  value?: string;
  customColumn?: string;
  multipleValues?: string[];
  dateRangeType?: string; // For tracking which date range type is selected
  metabaseParam?: boolean; // Add this line
  interactive?: boolean; // Add this for interactive mode filters
}

export interface SegmentPerformed {
  operator: 'IN' | '=' | '!=' | 'LIKE' | 'STARTS_WITH' | 'ENDS_WITH';
  events: string[];
}

export interface SegmentDefinition {
  id: number;
  name: string;
  filters: Filter[];
  performed?: SegmentPerformed | null;
}

export interface Parameter {
  key: string;
  type: 'string' | 'number';
  description?: string;
}

export interface Metric {
  function: string;
  column?: string;
  alias?: string;
  // New properties for count_where
  whereColumn?: string;
  whereOperator?: string;
  whereValue?: string;
  whereMultipleValues?: string[];
  showInMinutes?: boolean; // Add this new flag
}

export interface DateFormat {
  label: string;
  value: string;
  format: string;
}

export interface ColumnGroup {
  label: string;
  table: string;
  columns: ColumnOption[];
}

export interface MetricOption {
  label: string;
  value: string;
}

export interface OrderBy {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface ColumnOption {
  label: string;
  value: string;
}

export type { Website };

export interface ChartConfig {
  website: Website | null;
  filters: Filter[];
  segments?: SegmentDefinition[];
  metrics: Metric[];
  groupByFields: string[];
  orderBy: { column: string; direction: 'ASC' | 'DESC' } | null;
  columnOrderMode?: 'default' | 'metrics_first';
  dateFormat: string;
  paramAggregation: 'representative' | 'unique';
  limit: number | null; // Change from 'null' to 'number | null' to allow both values
}
