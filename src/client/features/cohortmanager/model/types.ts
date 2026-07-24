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

export interface CohortDto {
  id: number
  websiteId: string
  name: string
  description?: string
}

export interface CohortDetailDto extends CohortDto {
  /** Root of the criteria tree, or null if no criteria have been saved yet. */
  root: CohortNode | null
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

// ─── Recursive criteria tree ──────────────────────────────────────────────────

export type SequenceRelation = 'FOLLOWED_BY' | 'NOT_FOLLOWED_BY'
export type SequenceTimeUnit = 'MINUTE' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

export interface CohortGroupNode {
  nodeType: 'GROUP'
  combinator: LogicalOperator
  negated: boolean
  children: CohortNode[]
}

export interface CohortConditionNode {
  nodeType: 'CONDITION'
  field: string
  conditionType: ComparisonOperator
  value: string
}

export interface CohortRefNode {
  nodeType: 'COHORT_REF'
  referencedCohortId: number
  negated: boolean
}

export interface CohortSequenceNode {
  nodeType: 'SEQUENCE'
  anchor: CohortGroupNode
  target: CohortGroupNode
  relation: SequenceRelation
  windowValue: number
  windowUnit: SequenceTimeUnit
}

export type CohortNode = CohortGroupNode | CohortConditionNode | CohortRefNode | CohortSequenceNode
