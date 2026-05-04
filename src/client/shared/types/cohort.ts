export type CohortConditionType =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'IN_SET'
  | 'NOT_IN_SET'
  | 'STARTS_WITH'
  | 'ENDS_WITH'

export interface CohortEntryCondition {
  field: string
  value: string
  conditionType: CohortConditionType
}

export interface CohortEntryDto {
  condition: 'PERFORMED' | 'IN_COHORT'
  negation: boolean
  operator: 'AND' | 'OR'
  referencedCohortId?: string
  conditions: CohortEntryCondition[]
}

export interface CohortDetailDto {
  id: string
  websiteId: string
  name: string
  entries: CohortEntryDto[]
}

export interface CohortDto {
  id: string
  websiteId: string
  name: string
  description?: string
}
