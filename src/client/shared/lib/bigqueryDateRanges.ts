/**
 * Shared BigQuery date-bound SQL snippets.
 *
 * Single source of truth for the timestamp expressions used as `created_at`
 * bounds in generated SQL (grafbygger presets, URL fallbacks, dashboard
 * overrides). Keeps the "exclude the still-collecting current day" semantics
 * identical to `getDateRangeFromPeriod` in `./utils.ts` — which operates on
 * JS `Date` objects for API-param flows, while these expressions live inside
 * generated SQL and are evaluated by BigQuery at query time.
 *
 * TIMEZONE: charts group by `FORMAT_TIMESTAMP(..., 'Europe/Oslo')`, so every
 * day-boundary expression here is anchored to Europe/Oslo too. BigQuery's
 * `CURRENT_TIMESTAMP()`/`CURRENT_DATE()` are UTC — a bare
 * `TIMESTAMP('2026-09-28T23:59:59')` upper bound would include the first two
 * hours of the 29th in Oslo time (UTC+2 in summer), i.e. "i dag" leaks into
 * "siste 7 dager".
 */

const TZ = 'Europe/Oslo'

/** Right now — for presets where the current moment is the intended bound ("I dag"). */
export const BQ_NOW_SQL = 'CURRENT_TIMESTAMP()'

/** Start of today, 00:00:00 Europe/Oslo. */
export const BQ_START_OF_TODAY_SQL = `TIMESTAMP(DATE(CURRENT_TIMESTAMP(), '${TZ}'))`

/**
 * End of yesterday, 23:59:59 Europe/Oslo. The current day is still collecting
 * events, so rolling presets end here — including today makes the latest
 * bucket read as a partial dip. Mirrors `endOfYesterday` in
 * `getDateRangeFromPeriod`.
 */
export const BQ_END_OF_YESTERDAY_SQL = `TIMESTAMP_SUB(TIMESTAMP(DATE(DATE_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 DAY), '${TZ}')), INTERVAL 1 SECOND)`

/**
 * Start of the day `amount` days ago, 00:00:00 Europe/Oslo — e.g.
 * `bqLastNDaysStartSQL(7)` is the lower bound of "siste 7 dager": seven full
 * Oslo days ending yesterday when paired with {@link BQ_END_OF_YESTERDAY_SQL}.
 */
export const bqLastNDaysStartSQL = (amount: number | string): string =>
  `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), '${TZ}'), INTERVAL ${amount} DAY))`

/**
 * Rolling "last N days" preset: N full Oslo days, ending yesterday.
 * Matches `getDateRangeFromPeriod('last_7_days')` semantics.
 */
export const bqLastNDaysSQL = (amount: number | string): { fromSQL: string; toSQL: string } => ({
  fromSQL: bqLastNDaysStartSQL(amount),
  toSQL: BQ_END_OF_YESTERDAY_SQL,
})

export type BqRelativeUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'

/**
 * BigQuery bounds for a relative "last N <unit>" period.
 *
 * Sub-day units (minute/hour) end at now — freshness is the point at that
 * granularity, and sub-day windows don't align to calendar days anyway.
 * Day-and-larger units end at end-of-yesterday (Oslo) so the latest bucket
 * isn't a partial, still-collecting day.
 */
export const getBqRelativePeriodSQL = (amount: string | number, unit: string): { fromSQL: string; toSQL: string } => {
  switch (unit.toLowerCase()) {
    case 'minute':
      return {
        fromSQL: `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${amount} MINUTE)`,
        toSQL: BQ_NOW_SQL,
      }
    case 'hour':
      return {
        fromSQL: `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${amount} HOUR)`,
        toSQL: BQ_NOW_SQL,
      }
    case 'day':
      return bqLastNDaysSQL(amount)
    case 'week':
      return {
        fromSQL: `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), '${TZ}'), INTERVAL ${amount} WEEK))`,
        toSQL: BQ_END_OF_YESTERDAY_SQL,
      }
    case 'month':
      return {
        fromSQL: `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), '${TZ}'), INTERVAL ${amount} MONTH))`,
        toSQL: BQ_END_OF_YESTERDAY_SQL,
      }
    case 'quarter':
      return {
        fromSQL: `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), '${TZ}'), INTERVAL ${Number(amount) * 3} MONTH))`,
        toSQL: BQ_END_OF_YESTERDAY_SQL,
      }
    case 'year':
      return {
        fromSQL: `TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP(), '${TZ}'), INTERVAL ${amount} YEAR))`,
        toSQL: BQ_END_OF_YESTERDAY_SQL,
      }
    default:
      return bqLastNDaysSQL(amount)
  }
}
