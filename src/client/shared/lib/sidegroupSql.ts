import type { Sidegroup } from '../../features/sidegroups/model/types.ts'

const escapeSqlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/**
 * Builds a boolean SQL expression that matches `columnExpr` against a sidegruppe's
 * include/exact/startWith/endWith rules (OR-ed together) minus its exclude rules.
 */
export const buildSidegroupSqlCondition = (sidegroup: Sidegroup, columnExpr: string): string => {
  const positive = [
    ...(sidegroup.include ?? []).map((p) => `STRPOS(LOWER(${columnExpr}), LOWER('${escapeSqlString(p)}')) > 0`),
    ...(sidegroup.exact ?? []).map((p) => `LOWER(${columnExpr}) = LOWER('${escapeSqlString(p)}')`),
    ...(sidegroup.startWith ?? []).map((p) => `STARTS_WITH(LOWER(${columnExpr}), LOWER('${escapeSqlString(p)}'))`),
    ...(sidegroup.endWith ?? []).map((p) => `ENDS_WITH(LOWER(${columnExpr}), LOWER('${escapeSqlString(p)}'))`),
  ]
  const exclude = (sidegroup.exclude ?? []).map(
    (p) => `STRPOS(LOWER(${columnExpr}), LOWER('${escapeSqlString(p)}')) = 0`,
  )
  const positiveClause = positive.length > 0 ? `(${positive.join(' OR ')})` : 'TRUE'
  return `(${[positiveClause, ...exclude].join(' AND ')})`
}
