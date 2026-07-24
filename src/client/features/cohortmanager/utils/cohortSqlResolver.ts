import type { CohortConditionNode, CohortGroupNode, CohortNode } from '../model/types.ts'

// ─── Datetime value handling ──────────────────────────────────────────────────

interface RelativeDateTimeValue {
  mode: 'relative'
  anchor: string
  offset: number
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
}

function isRelativeDateTimeValue(value: unknown): value is RelativeDateTimeValue {
  return typeof value === 'object' && value !== null && (value as RelativeDateTimeValue).mode === 'relative'
}

const BQ_DATE_UNIT: Record<RelativeDateTimeValue['unit'], string> = {
  minute: 'MINUTE',
  hour: 'HOUR',
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
}

const BQ_ANCHOR: Record<string, string> = {
  now: 'CURRENT_TIMESTAMP()',
  startOfDay: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)',
  endOfDay: 'TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 1 DAY)',
  startOfWeek: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), WEEK)',
  endOfWeek: 'TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), WEEK), INTERVAL 1 WEEK)',
  startOfMonth: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)',
  endOfMonth: 'TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH), INTERVAL 1 MONTH)',
  startOfYear: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), YEAR)',
  endOfYear: 'TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), YEAR), INTERVAL 1 YEAR)',
}

/**
 * Converts a stored created_at value to a BigQuery SQL expression, injected
 * verbatim by conditionToSqlFragment.
 *
 * Absolute ISO string → TIMESTAMP('2024-01-01T00:00:00')
 * RelativeDateTimeValue JSON → TIMESTAMP_SUB/ADD(anchor, INTERVAL N unit)
 */
export function dateValueToBigQuery(rawValue: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    parsed = rawValue
  }

  if (isRelativeDateTimeValue(parsed)) {
    const anchor = BQ_ANCHOR[parsed.anchor] ?? 'CURRENT_TIMESTAMP()'
    const unit = BQ_DATE_UNIT[parsed.unit] ?? 'DAY'
    if (parsed.offset === 0) return anchor
    const fn = parsed.offset < 0 ? 'TIMESTAMP_SUB' : 'TIMESTAMP_ADD'
    return `${fn}(${anchor}, INTERVAL ${Math.abs(parsed.offset)} ${unit})`
  }

  // Absolute ISO string — wrap in TIMESTAMP() so BQ parses it correctly
  const isoString = typeof parsed === 'string' ? parsed : rawValue
  return `TIMESTAMP('${isoString.replace(/'/g, "''")}')`
}

/**
 * Resolves a cohort's CohortNode tree into a single BigQuery boolean SQL
 * expression that tests whether the *outer* query's current visitor
 * (identified by `ctx.outerAlias.<visitorIdColumn>`) belongs to the cohort.
 *
 * Design: each GROUP node's direct CONDITION children are merged into ONE
 * correlated EXISTS subquery (they must all match on the SAME event row —
 * see CONTEXT.md's "single event row" decision). Direct child nodes that are
 * themselves GROUP / COHORT_REF / SEQUENCE nodes are resolved independently
 * and combined with the parent group's combinator (AND/OR), each wrapped in
 * NOT(...) when negated. COHORT_REF inlines the referenced cohort's own tree
 * (via ctx.resolveCohortRef) rather than leaving it unresolved. SEQUENCE
 * produces a correlated anchor/target EXISTS pair comparing created_at.
 */

export type CohortLookup = (cohortId: number) => CohortGroupNode

/** Identifies a table joined into a correlated subquery to resolve a field not present on eventsTable itself. */
export interface JoinedTable {
  /** Fully-qualified table reference. */
  table: string
  /** Column shared between eventsTable and this table, used to correlate them (e.g. 'session_id'). */
  joinColumn: string
}

export interface ResolveContext {
  /** Alias of the outer query's row whose visitor we're testing cohort membership for. */
  outerAlias: string
  /** Fully-qualified BigQuery events table reference. */
  eventsTable: string
  /** Column name identifying a visitor, shared between the outer query and eventsTable. */
  visitorIdColumn: string
  /** Looks up another cohort's root node by id, for COHORT_REF inlining. */
  resolveCohortRef: CohortLookup
  /**
   * Optional extra SQL condition ANDed into every generated correlated
   * subquery's WHERE, given the subquery's row alias. Used e.g. to scope
   * subqueries to a specific website_id when eventsTable isn't already
   * scoped to one website.
   */
  extraConditionFn?: (rowAlias: string) => string
  /**
   * Resolves which table a CONDITION field actually lives on, when it isn't
   * a column of eventsTable itself. Returns undefined for fields that ARE
   * columns of eventsTable. Each generated correlated subquery LEFT JOINs
   * the returned table (once per distinct table needed by that subquery's
   * conditions) and references the field via the joined alias instead.
   */
  resolveFieldTable?: (field: string) => JoinedTable | undefined
}

export function resolveNodeToSql(node: CohortNode, ctx: ResolveContext): string {
  rowAliasCounter = 0
  return resolveWithAlias(node, ctx, ctx.outerAlias, ctx.visitorIdColumn)
}

/**
 * Resolves a GROUP node's direct children.
 * - when combinator is AND: direct CONDITION children are merged into one
 *   correlated EXISTS (a valid "same row" optimization — they must all hold
 *   simultaneously anyway, so one EXISTS is equivalent to N and cheaper)
 * - when combinator is OR (or anything else): each CONDITION gets its own
 *   independent EXISTS, since they represent separate alternatives, not
 *   constraints on the same row. (Merging them here regardless of combinator
 *   was a real bug — it silently ANDed bare sibling conditions together even
 *   under an OR group, e.g. "(A OR B OR (C AND D))" built with A and B as
 *   direct children collapsed into "(A AND B) OR (C AND D)".)
 * - direct GROUP/COHORT_REF/SEQUENCE children are always resolved independently
 * All resulting expressions are combined with the group's combinator and
 * wrapped in NOT(...) if the group itself is negated.
 */
function resolveGroup(node: CohortGroupNode, ctx: ResolveContext, alias: string, visitorCol: string): string {
  const conditionChildren = node.children.filter(
    (child): child is CohortConditionNode => child.nodeType === 'CONDITION',
  )
  const otherChildren = node.children.filter((child) => child.nodeType !== 'CONDITION')

  const expressions: string[] = []

  if (conditionChildren.length > 0) {
    if (node.combinator === 'AND') {
      expressions.push(buildConditionsExists(conditionChildren, ctx, alias, visitorCol))
    } else {
      for (const condition of conditionChildren) {
        expressions.push(buildConditionsExists([condition], ctx, alias, visitorCol))
      }
    }
  }

  for (const child of otherChildren) {
    expressions.push(resolveWithAlias(child, ctx, alias, visitorCol))
  }

  const combined = combineExpressions(expressions, node.combinator)
  return node.negated ? `NOT (${combined})` : combined
}

function combineExpressions(expressions: string[], combinator: CohortGroupNode['combinator']): string {
  if (expressions.length === 0) return 'TRUE'
  if (expressions.length === 1) return expressions[0]
  const joiner = combinator === 'OR' ? ' OR ' : ' AND '
  return `(${expressions.join(joiner)})`
}

/**
 * Resolves each condition's SQL fragment, LEFT JOINing whatever external
 * table(s) ctx.resolveFieldTable says a field lives on (once per distinct
 * table needed within this one subquery, not once per condition).
 */
function resolveConditionFragments(
  conditions: CohortConditionNode[],
  ctx: ResolveContext,
  rowAlias: string,
): { fragments: string[]; joinClauses: string[] } {
  const joinClauses: string[] = []
  const joinAliasByTable = new Map<string, string>()
  let joinCounter = 0

  const fragments = conditions.map((condition) => {
    const joined = ctx.resolveFieldTable?.(condition.field)
    if (!joined) return conditionToSqlFragment(condition, rowAlias)

    let joinAlias = joinAliasByTable.get(joined.table)
    if (!joinAlias) {
      joinAlias = `${rowAlias}j${joinCounter++}`
      joinAliasByTable.set(joined.table, joinAlias)
      joinClauses.push(
        `LEFT JOIN ${joined.table} ${joinAlias} ON ${rowAlias}.${joined.joinColumn} = ${joinAlias}.${joined.joinColumn}`,
      )
    }
    return conditionToSqlFragment(condition, joinAlias)
  })

  return { fragments, joinClauses }
}

function formatJoinClauses(joinClauses: string[]): string {
  return joinClauses.length > 0 ? `\n  ${joinClauses.join('\n  ')}` : ''
}

/** Merges direct CONDITION children into a single correlated EXISTS subquery (row-level AND). */
function buildConditionsExists(
  conditions: CohortConditionNode[],
  ctx: ResolveContext,
  outerAlias: string,
  outerVisitorCol: string,
): string {
  const rowAlias = nextRowAlias()
  const correlation = `${rowAlias}.${ctx.visitorIdColumn} = ${outerAlias}.${outerVisitorCol}`
  const extra = ctx.extraConditionFn?.(rowAlias)
  const { fragments, joinClauses } = resolveConditionFragments(conditions, ctx, rowAlias)
  const where = [correlation, ...(extra ? [extra] : []), ...fragments].join('\n    AND ')
  return `EXISTS (\n  SELECT 1 FROM ${ctx.eventsTable} ${rowAlias}${formatJoinClauses(joinClauses)}\n  WHERE ${where}\n)`
}

let rowAliasCounter = 0
function nextRowAlias(): string {
  const aliases = ['e', 'x', 'y', 'z']
  const alias = aliases[rowAliasCounter % aliases.length]
  rowAliasCounter += 1
  return alias
}

function resolveWithAlias(node: CohortNode, ctx: ResolveContext, outerAlias: string, outerVisitorCol: string): string {
  switch (node.nodeType) {
    case 'GROUP':
      return resolveGroup(node, ctx, outerAlias, outerVisitorCol)

    case 'CONDITION':
      // Direct top-level CONDITION (not the common path — conditions are normally
      // merged by their parent GROUP — but supported standalone for robustness).
      return buildConditionsExists([node], ctx, outerAlias, outerVisitorCol)

    case 'COHORT_REF':
      return resolveCohortRef(node, ctx, outerAlias, outerVisitorCol)

    case 'SEQUENCE':
      return resolveSequence(node, ctx, outerAlias, outerVisitorCol)
  }
}

function resolveCohortRef(
  node: Extract<CohortNode, { nodeType: 'COHORT_REF' }>,
  ctx: ResolveContext,
  outerAlias: string,
  outerVisitorCol: string,
): string {
  const referencedRoot = ctx.resolveCohortRef(node.referencedCohortId)
  const resolved = resolveWithAlias(referencedRoot, ctx, outerAlias, outerVisitorCol)
  return node.negated ? `NOT (${resolved})` : resolved
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

/** Maps a CohortConditionNode's comparison operator to a SQL infix operator string. */
function conditionOperatorToSql(conditionType: CohortConditionNode['conditionType']): string {
  switch (conditionType) {
    case 'EQUALS':
      return '='
    case 'NOT_EQUALS':
      return '!='
    case 'CONTAINS':
      return 'LIKE'
    case 'NOT_CONTAINS':
      return 'NOT LIKE'
    case 'STARTS_WITH':
      return 'LIKE'
    case 'ENDS_WITH':
      return 'LIKE'
    case 'GREATER_THAN_OR_EQUAL':
      return '>='
    case 'LESS_THAN_OR_EQUAL':
      return '<='
    case 'IN_SET':
      return 'IN'
    case 'NOT_IN_SET':
      return 'NOT IN'
  }
}

/**
 * Formats a single CONDITION leaf as a SQL fragment on the given row alias.
 * `created_at` values are converted via dateValueToBigQuery (relative-date
 * JSON or absolute ISO string, both -> a raw BigQuery TIMESTAMP expression,
 * injected verbatim); all other fields are quoted string literals.
 */
function conditionToSqlFragment(condition: CohortConditionNode, alias: string): string {
  const operator = conditionOperatorToSql(condition.conditionType)
  const column = `${alias}.${condition.field}`

  if (condition.field === 'created_at') {
    return `${column} ${operator} ${dateValueToBigQuery(condition.value)}`
  }

  return `${column} ${operator} '${escapeSqlLiteral(condition.value)}'`
}

function getDirectConditions(group: CohortGroupNode): CohortConditionNode[] {
  return group.children.filter((c): c is CohortConditionNode => c.nodeType === 'CONDITION')
}

/**
 * Resolves a SEQUENCE node: "did [anchor], then [relation] [target] within
 * [windowValue] [windowUnit] of anchor." Produces a correlated anchor row
 * plus a correlated target-row subquery comparing created_at timestamps.
 */
function resolveSequence(
  node: Extract<CohortNode, { nodeType: 'SEQUENCE' }>,
  ctx: ResolveContext,
  outerAlias: string,
  outerVisitorCol: string,
): string {
  const anchorAlias = nextRowAlias()
  const targetAlias = nextRowAlias()

  const { fragments: anchorFragments, joinClauses: anchorJoins } = resolveConditionFragments(
    getDirectConditions(node.anchor),
    ctx,
    anchorAlias,
  )
  const { fragments: targetFragments, joinClauses: targetJoins } = resolveConditionFragments(
    getDirectConditions(node.target),
    ctx,
    targetAlias,
  )

  const windowExpr = `TIMESTAMP_ADD(${anchorAlias}.created_at, INTERVAL ${node.windowValue} ${node.windowUnit})`

  const targetExtra = ctx.extraConditionFn?.(targetAlias)
  const targetWhere = [
    `${targetAlias}.${ctx.visitorIdColumn} = ${anchorAlias}.${ctx.visitorIdColumn}`,
    ...(targetExtra ? [targetExtra] : []),
    ...targetFragments,
    `${targetAlias}.created_at > ${anchorAlias}.created_at`,
    `${targetAlias}.created_at <= ${windowExpr}`,
  ].join('\n      AND ')

  const targetKeyword = node.relation === 'NOT_FOLLOWED_BY' ? 'NOT EXISTS' : 'EXISTS'
  const targetSubquery = `${targetKeyword} (\n    SELECT 1 FROM ${ctx.eventsTable} ${targetAlias}${formatJoinClauses(targetJoins)}\n    WHERE ${targetWhere}\n  )`

  const anchorExtra = ctx.extraConditionFn?.(anchorAlias)
  const anchorWhere = [
    `${anchorAlias}.${ctx.visitorIdColumn} = ${outerAlias}.${outerVisitorCol}`,
    ...(anchorExtra ? [anchorExtra] : []),
    ...anchorFragments,
    targetSubquery,
  ].join('\n    AND ')

  return `EXISTS (\n  SELECT 1 FROM ${ctx.eventsTable} ${anchorAlias}${formatJoinClauses(anchorJoins)}\n  WHERE ${anchorWhere}\n)`
}
