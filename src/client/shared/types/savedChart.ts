export interface SavedChart {
  id?: string;
  title: string;
  type: 'line' | 'bar' | 'pie' | 'table' | 'title' | 'siteimprove' | 'text';
  sql?: string;
  width?: 'full' | 'half' | string;
  description?: string;
  config?: any;
  filters?: any[];
  isStandardWidget?: boolean;
  siteimprove_id?: string;
  siteimprove_portal_id?: string;
  showTotal?: boolean;
}

