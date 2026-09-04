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
  /** Only valid on the `created_at` field — value is a JSON `{from, to}` pair. See CohortDateTimeEditor.tsx. */
  | 'BETWEEN'
  /**
   * Key-only existence check for the «Sjekk bare at detaljen finnes» toggle:
   * a paramKey condition whose value is irrelevant — matches when the event
   * has ANY entry with that data_key (the UNNEST join row existing at all).
   */
  | 'EXISTS'

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

/**
 * A single field predicate — a leaf. Exactly one of `field`/`paramKey` is set:
 * `field` for a real event/session column, `paramKey` for an event-data detail
 * (key/value entries on the event, e.g. which button was clicked) — see
 * cohortSqlResolver.ts for how these resolve to UNNEST joins differently from
 * plain columns.
 *
 * `value` encoding by conditionType:
 * - plain comparisons: the literal string
 * - IN_SET/NOT_IN_SET: JSON string array ('["a","b"]'), from the multi-select combobox
 * - EXISTS: ignored (empty string) — key-only detail check
 */
export interface CohortConditionNode {
  nodeType: 'CONDITION'
  field?: string
  paramKey?: string
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
