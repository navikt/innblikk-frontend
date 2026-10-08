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
  /**
   * The chart's own created_at lower bound (a raw BigQuery TIMESTAMP
   * expression, e.g. `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)`).
   * Cohort subqueries reuse it as their partition filter instead of
   * defaulting to a wide fixed window — the user always picks a time range,
   * and scoping cohort lookups to that same range is both cheaper (partition
   * pruning actually bites) and more correct (a 7-day chart shouldn't match
   * sessions/events older than the window). Falls back to a wide window when
   * absent (interactive Metabase mode, where bounds live outside the SQL).
   */
  dateLowerBound?: string
}

/** Retention-wide fallback used only when no chart date bound is available (interactive Metabase mode). */
const WIDE_FALLBACK_WINDOW = 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 400 DAY)'

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
    // umami_views.event is partition-filter-enforced — a cohort with no
    // Tidspunkt/SEQUENCE criteria would otherwise emit an unbounded EXISTS
    // and BigQuery would reject the whole chart query. Scope it to the chart's
    // own date window when we have one; only fall back to the retention-wide
    // 400-day window when bounds live outside the SQL (interactive Metabase).
    eventsPartitionFallbackFn: (alias) => `${alias}.created_at >= ${ctx.dateLowerBound ?? WIDE_FALLBACK_WINDOW}`,
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
            // instead of after. The created_at bound is required for the
            // same reason — public_session enforces partition filters. Use the
            // chart's own window so this is as tight as the query allows.
            extraJoinConditionFn: (joinAlias) =>
              `${joinAlias}.website_id = '${escapeSqlLiteral(ctx.websiteId)}'` +
              ` AND ${joinAlias}.created_at >= ${ctx.dateLowerBound ?? WIDE_FALLBACK_WINDOW}`,
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
      return resolveNodeToSql(cohort.root, resolveCtx)
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
