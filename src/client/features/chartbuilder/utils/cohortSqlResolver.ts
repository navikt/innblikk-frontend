import type { CohortDetailDto, CohortGroupNode } from '../../../shared/types/cohort.ts'
import type { SegmentDefinition } from '../../../shared/types/chart.ts'
import { resolveNodeToSql } from '../../cohortmanager/utils/cohortSqlResolver.ts'
import type { ResolveContext } from '../../cohortmanager/utils/cohortSqlResolver.ts'
import { SESSION_COLUMNS } from '../model/constants.ts'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts'

/**
 * Adapts the canonical, tested per-visitor EXISTS-based resolver
 * (cohortmanager/utils/cohortSqlResolver.ts) for use in Grafbygger's segment
 * mechanism. There is only one cohort-tree-to-SQL implementation — this file
 * just wires it up with Grafbygger-specific context (the `b` row alias used
 * throughout sqlGenerator.ts, this codebase's `session_id` visitor-identity
 * column, session-table field resolution, and website scoping) and packages
 * the result as a SegmentDefinition.
 */

export interface CohortResolutionContext {
  /** Fully-qualified BigQuery events table reference (same table base_query is built from). */
  eventsTable: string
  /**
   * Fully-qualified BigQuery session table reference. SESSION_COLUMNS
   * (browser/os/device/screen/language/country/subdivision1/city) live here,
   * not on eventsTable — the resolver LEFT JOINs this table into any
   * correlated subquery that references one of them.
   */
  sessionTable: string
  websiteId: string
  /** All cohorts potentially referenced (selected + transitively COHORT_REF'd), keyed by id string. */
  cohortLookup: Map<string, CohortDetailDto>
}

const EMPTY_ROOT: CohortGroupNode = { nodeType: 'GROUP', combinator: 'AND', negated: false, children: [] }

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

export function resolveCohortToSegmentDefinition(
  cohort: CohortDetailDto,
  index: number,
  ctx: CohortResolutionContext,
): SegmentDefinition {
  if (!cohort.root) {
    return { id: index + 1, name: cohort.name, filters: [], performed: null }
  }

  const resolveCtx: ResolveContext = {
    outerAlias: 'b',
    eventsTable: ctx.eventsTable,
    // This codebase's Umami event/session tables use session_id as the identity
    // column shared across a visitor's rows (see sqlGenerator.ts's session join).
    visitorIdColumn: 'session_id',
    extraConditionFn: (alias) => `${alias}.website_id = '${escapeSqlLiteral(ctx.websiteId)}'`,
    resolveFieldTable: (field) =>
      (SESSION_COLUMNS as readonly string[]).includes(field)
        ? {
            table: ctx.sessionTable,
            joinColumn: 'session_id',
            // umami_views.session is website_id/session_id/../created_at
            // GROUP BY'd + ARRAY_AGG'd over the *full, unfiltered* (all
            // websites, 2yr) public_session_data before it can be filtered —
            // referencing it without a website_id predicate reaching that
            // GROUP BY forces BigQuery to assume it may need every website's
            // sessions (observed: ~188GB for what should be a single-site
            // check). website_id is a plain pass-through GROUP BY key in the
            // view (not aggregated), so an equality filter on it here lets
            // BigQuery push the restriction down before the join+aggregation
            // instead of after.
            extraJoinConditionFn: (joinAlias) => `${joinAlias}.website_id = '${escapeSqlLiteral(ctx.websiteId)}'`,
          }
        : undefined,
    // Custom event parameters (e.g. a form field's `tekst`/`valg`/`data`) live in
    // this view's repeated `event_parameters` record, not as plain eventsTable
    // columns — see sqlGenerator.ts's `ed_view` join for the non-cohort analog.
    resolveEventParamsJoin: () => ({
      table: `\`${getGcpProjectId()}.umami_views.event_data\``,
      joinOn: [
        { rowColumn: 'event_id', viewColumn: 'website_event_id' },
        { rowColumn: 'website_id', viewColumn: 'website_id' },
        { rowColumn: 'created_at', viewColumn: 'created_at' },
      ],
    }),
    resolveCohortRef: (referencedCohortId) => {
      const referenced = ctx.cohortLookup.get(String(referencedCohortId))
      if (!referenced?.root) {
        console.warn(
          `[cohortSqlResolver] referenced cohort ${referencedCohortId} was not found or has no criteria yet ` +
            '— treating the reference as "matches everyone" rather than breaking the whole query.',
        )
        return EMPTY_ROOT
      }
      return referenced.root as CohortGroupNode
    },
  }

  const expression = (() => {
    try {
      return resolveNodeToSql(cohort.root as CohortGroupNode, resolveCtx)
    } catch (err) {
      // Never let a malformed/unexpected cohort tree crash the whole chart
      // render (this whole function runs inside a `useMemo` during render —
      // an uncaught throw here previously escaped straight to the top-level
      // ErrorBoundary). Fail soft as "matches nobody" instead, loudly logged.
      console.error(`[cohortSqlResolver] failed to resolve cohort "${cohort.name}" (id=${cohort.id}) to SQL:`, err)
      return 'FALSE'
    }
  })()

  return {
    id: index + 1,
    name: cohort.name,
    filters: [{ column: '__cohort_expression__', rawExpression: expression }],
    performed: null,
  }
}
