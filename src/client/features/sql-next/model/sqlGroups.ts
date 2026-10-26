import { Parser } from 'node-sql-parser/build/bigquery'
import { format } from 'sql-formatter'
import type { Sidegroup } from '../../sidegroups/model/types'
import type { CohortDetailDto, CohortGroupNode, CohortNode } from '../../cohortmanager/model/types'
import { resolveNodeToSql } from '../../cohortmanager/utils/cohortSqlResolver'
import { SESSION_COLUMNS } from '../../chartbuilder-next/model/constants'
import { buildSidegroupSqlCondition } from '../../../shared/lib/sidegroupSql'
import { sanitizePlaceholders, restorePlaceholders } from '../../sql/utils/sqlProcessing'
import { addFiltersWithParser } from './sqlFilters'
import { addTemporaryField, removeTemporaryField } from './sqlCode'

export type SqlGroup = { kind: 'sidegroup'; group: Sidegroup } | { kind: 'cohort'; group: CohortDetailDto }

export function addGroupsToSql(
  query: string,
  projectId: string,
  groups: SqlGroup[],
  cohorts: Map<string, CohortDetailDto>,
): string {
  if (!groups.length) throw new Error('Velg minst én gruppe.')
  const parser = new Parser()
  const initial = !query.trim() || /^\s*SELECT\s*$/i.test(query)
  const { sanitized, placeholders } = sanitizePlaceholders(
    initial ? `SELECT * FROM \`${projectId}.umami_views.event\`` : query,
    'parse',
  )
  const parsed = parser.astify(addTemporaryField(sanitized))
  if (Array.isArray(parsed) && parsed.length !== 1) throw new Error('Bruk én SELECT-spørring om gangen.')
  const ast = Array.isArray(parsed) ? parsed[0] : parsed
  if (ast.type !== 'select' || ast.with || ast._next) {
    throw new Error('Bruk én SELECT-spørring uten WITH eller UNION for å legge til grupper.')
  }
  const sources = Array.isArray(ast.from) ? ast.from : []
  const source =
    sources.find((entry) => 'table' in entry && entry.table === `${projectId}.umami_views.event`) ??
    sources.find((entry) => 'table' in entry && entry.table === `${projectId}.umami_views.session`)
  if (!source || !('table' in source) || typeof source.table !== 'string') {
    throw new Error('Legg til Hendelser eller Brukerdetaljer før du legger til grupper.')
  }
  if (typeof source.as !== 'string') source.as = source.table.split('.').pop()!
  const reference = `\`${source.as}\``
  const conditions = groups.map((selection) => {
    const { group } = selection
    if (selection.kind === 'sidegroup') {
      if (source.table !== `${projectId}.umami_views.event`) {
        throw new Error('Legg til Hendelser med JOIN før du legger til en sidegruppe.')
      }
      return buildSidegroupSqlCondition(selection.group, `${reference}.url_path`)
    }
    const lookup = (id: number): CohortGroupNode => {
      const referenced = cohorts.get(String(id))
      if (referenced?.websiteId !== group.websiteId || referenced.root?.nodeType !== 'GROUP') {
        throw new Error('En tilknyttet brukergruppe mangler eller har ingen lagrede kriterier.')
      }
      return referenced.root
    }
    const check = (node: CohortNode | null, ancestors: Set<number>, depth: number) => {
      if (!node) throw new Error('Brukergruppen har ingen lagrede kriterier.')
      if (depth > 20) throw new Error('Brukergruppen har for mange nivåer.')
      if (node.nodeType === 'GROUP') {
        if (!node.children.length) throw new Error('Brukergruppen har ingen lagrede kriterier.')
        node.children.forEach((child) => check(child, ancestors, depth + 1))
      } else if (node.nodeType === 'COHORT_REF') {
        if (ancestors.has(node.referencedCohortId)) throw new Error('Brukergruppene viser til hverandre i en sirkel.')
        check(lookup(node.referencedCohortId), new Set([...ancestors, node.referencedCohortId]), depth + 1)
      } else if (node.nodeType === 'SEQUENCE') {
        check(node.anchor, ancestors, depth + 1)
        check(node.target, ancestors, depth + 1)
      }
    }
    check(selection.group.root, new Set([selection.group.id]), 0)
    const expression = resolveNodeToSql(selection.group.root!, {
      outerAlias: 'group_member',
      eventsTable: `\`${projectId}.umami_views.event\``,
      visitorIdColumn: 'session_id',
      resolveCohortRef: lookup,
      resolveFieldTable: (field) =>
        (SESSION_COLUMNS as readonly string[]).includes(field)
          ? {
              table: `\`${projectId}.umami_views.session\``,
              joinColumn: 'session_id',
            }
          : undefined,
      resolveEventParamsJoin: () => ({
        table: `\`${projectId}.umami_views.event_data\``,
        joinOn: [
          { rowColumn: 'event_id', viewColumn: 'website_event_id' },
          { rowColumn: 'website_id', viewColumn: 'website_id' },
          { rowColumn: 'created_at', viewColumn: 'created_at' },
        ],
      }),
    })
    return `${reference}.session_id IN (
      SELECT group_member.session_id FROM \`${projectId}.umami_views.event\` group_member
      WHERE ${expression}
    )`
  })
  const combined = (['cohort', 'sidegroup'] as const)
    .map((kind) => conditions.filter((_, index) => groups[index].kind === kind))
    .filter((typeConditions) => typeConditions.length > 0)
    .map((typeConditions) => `(${typeConditions.join(' OR ')})`)
    .join(' AND ')
  const conditionAst = parser.astify(`SELECT 1 WHERE ${combined}`)
  const filterStatement = Array.isArray(conditionAst) ? conditionAst[0] : conditionAst
  if (filterStatement.type !== 'select') throw new Error('Kunne ikke legge til gruppefilteret.')
  const filter = filterStatement.where
  if (ast.where && filter) {
    Object.assign(ast.where, { parentheses: true })
    Object.assign(filter, { parentheses: true })
    ast.where = { type: 'binary_expr', operator: 'AND', left: ast.where, right: filter }
  } else {
    ast.where = filter
  }
  return removeTemporaryField(restorePlaceholders(format(parser.sqlify(ast), { language: 'bigquery' }), placeholders))
}

// Group subqueries read their own copy of the tables, so each needs the same visible website and period filters.
export async function addGroupsWithFilters(
  query: string,
  projectId: string,
  groups: SqlGroup[],
  cohorts: Map<string, CohortDetailDto>,
): Promise<string> {
  return addFiltersWithParser(addGroupsToSql(query, projectId, groups, cohorts))
}
