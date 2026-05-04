export type { Website } from '../../../shared/types/website'

export interface EventProperty {
  eventName: string
  propertyName: string
  total: number
  type?: 'string' | 'number'
}

export interface EventParam {
  key: string
  type: 'string'
}
