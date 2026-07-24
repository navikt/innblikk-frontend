export type CohortConditionType =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'IN_SET'
  | 'NOT_IN_SET'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL'

export type CohortLogicalOperator = 'AND' | 'OR'
export type CohortSequenceRelation = 'FOLLOWED_BY' | 'NOT_FOLLOWED_BY'
export type CohortSequenceTimeUnit = 'MINUTE' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

// ─── Recursive criteria tree (mirrors backend CohortNodeDto / cohortmanager/model/types.ts) ──

export interface CohortGroupNode {
  nodeType: 'GROUP'
  combinator: CohortLogicalOperator
  negated: boolean
  children: CohortNode[]
}

export interface CohortConditionNode {
  nodeType: 'CONDITION'
  field: string
  conditionType: CohortConditionType
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
  relation: CohortSequenceRelation
  windowValue: number
  windowUnit: CohortSequenceTimeUnit
}

export type CohortNode = CohortGroupNode | CohortConditionNode | CohortRefNode | CohortSequenceNode

export interface CohortDetailDto {
  id: string
  websiteId: string
  name: string
  /** Root of the criteria tree, or null if no criteria have been saved yet. */
  root: CohortNode | null
}

export interface CohortDto {
  id: string
  websiteId: string
  name: string
  description?: string
}
