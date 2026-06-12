export type LogicalOperator = 'AND' | 'OR'
export type ComparisonOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'LESS_THAN_OR_EQUAL'
  | 'GREATER_THAN_OR_EQUAL'
  | 'IN_SET'
  | 'NOT_IN_SET'
  | 'STARTS_WITH'
  | 'ENDS_WITH'

export interface CohortEntryConditionDto {
  ordering: number
  conditionType: ComparisonOperator
  field: string
  value: string
}

export interface CohortEntryDto {
  id?: number
  negated: boolean
  inCohort: boolean
  operator?: LogicalOperator
  referencedCohortId?: number
  ordering: number
  conditions: CohortEntryConditionDto[]
}

export interface CohortDto {
  id: number
  websiteId: string
  name: string
  description?: string
}

export interface CohortDetailDto extends CohortDto {
  entries: CohortEntryDto[]
}

export interface CreateCohortRequest {
  websiteId: string
  name: string
  description?: string
}

export interface UpdateCohortRequest {
  name: string
  websiteId: string
  description?: string
}

export interface CreateCohortEntryRequest {
  negated: boolean
  inCohort: boolean
  operator?: LogicalOperator
  referencedCohortId?: number
  conditions: Array<{
    ordering: number
    conditionType: ComparisonOperator
    field: string
    value: string
  }>
}
