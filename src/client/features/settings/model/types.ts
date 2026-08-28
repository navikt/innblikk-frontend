import type { Website as BaseWebsite } from '../../../shared/types/website'

export interface Website extends BaseWebsite {
  shareId?: string
}

export interface GroupedWebsite {
  baseName: string
  prod?: Website
  dev?: Website
  domain: string
  createdAt: string
  updatedAt: string
}

export type FilterType = 'all' | 'prod-only' | 'dev-only' | 'both'

export interface SelectedWebsite {
  name: string
  id: string
  domain?: string
  createdAt?: string
  updatedAt?: string
}
