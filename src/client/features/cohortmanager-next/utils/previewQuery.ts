import type { CohortDetailDto, CohortGroupNode, CohortNode } from '../../cohortmanager/model/types.ts'
import { resolveNodeToSql } from '../../cohortmanager/utils/cohortSqlResolver.ts'
import { treeToDraft } from '../model/draft.ts'
import { validateDraft } from './validate.ts'
import { visitorIdExpression, type VisitorBasis } from '../../tablebuilder/utils/visitorIdCoverage.ts'

export interface PreviewQueryInput {
  projectId: string
  websiteId: string
  root: CohortNode
  startDate: Date
  endDate: Date
  basis: VisitorBasis
  cohorts: Map<string, CohortDetailDto>
}

export function previewReferenceIds(root: CohortNode): string[] {
  if (root.nodeType === 'COHORT_REF') return [String(root.referencedCohortId)]
  if (root.nodeType === 'GROUP') return root.children.flatMap(previewReferenceIds)
  if (root.nodeType === 'SEQUENCE') return [...previewReferenceIds(root.anchor), ...previewReferenceIds(root.target)]
  return []
}

export function buildPreviewQuery(input: PreviewQueryInput): string {
  const { projectId, websiteId, root, startDate, endDate, basis, cohorts } = input
  if (!/^[a-zA-Z0-9-]+$/.test(projectId) || !/^[a-zA-Z0-9-]+$/.test(websiteId)) {
    throw new Error('Velg et gyldig nettsted.')
  }
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate > endDate) {
    throw new Error('Velg en gyldig periode.')
  }
  const referencedRoot = (id: number): CohortGroupNode => {
    const cohort = cohorts.get(String(id))
    if (!cohort || cohort.websiteId !== websiteId || cohort.root?.nodeType !== 'GROUP') {
      throw new Error('En brukergruppe som brukes her, finnes ikke eller kan ikke forhåndsvises.')
    }
    return cohort.root
  }
  let hasDetails = false
  const check = (node: CohortNode, ancestors: Set<string>, depth: number) => {
    if (depth > 20) throw new Error('Gruppen har for mange nivåer til å forhåndsvises.')
    const converted = treeToDraft(node)
    if (!converted.ok || validateDraft(converted.draft).length > 0) {
      throw new Error('Fullfør kriteriene før du forhåndsviser gruppen.')
    }
    for (const id of previewReferenceIds(node)) {
      if (ancestors.has(id)) throw new Error('Brukergruppene viser til hverandre i en sirkel.')
      check(referencedRoot(Number(id)), new Set([...ancestors, id]), depth + 1)
    }
    const containsDetails = (child: CohortNode): boolean => {
      if (child.nodeType === 'CONDITION') return child.paramKey != null
      if (child.nodeType === 'GROUP') return child.children.some(containsDetails)
      if (child.nodeType === 'SEQUENCE') return containsDetails(child.anchor) || containsDetails(child.target)
      return false
    }
    hasDetails ||= containsDetails(node)
  }
  check(root, new Set(), 0)
  const bounds = (alias: string) =>
    `${alias}.website_id = '${websiteId}' AND ${alias}.created_at BETWEEN TIMESTAMP('${startDate.toISOString()}') AND TIMESTAMP('${endDate.toISOString()}')`
  const expression = resolveNodeToSql(root, {
    outerAlias: 'person',
    eventsTable: 'preview_events',
    visitorIdColumn: 'preview_visitor_id',
    resolveCohortRef: referencedRoot,
    resolveEventParamsJoin: () => ({
      table: 'preview_details',
      joinOn: [
        { rowColumn: 'event_id', viewColumn: 'website_event_id' },
        { rowColumn: 'website_id', viewColumn: 'website_id' },
        { rowColumn: 'created_at', viewColumn: 'created_at' },
      ],
    }),
  })
  return `WITH preview_sessions AS (
  SELECT session.* FROM \`${projectId}.umami_views.session\` session
  WHERE ${bounds('session')}
), preview_rows AS (
  SELECT event.*, session.distinct_id AS session_distinct_id,
    session.browser, session.os, session.device, session.country
  FROM \`${projectId}.umami_views.event\` event
  LEFT JOIN preview_sessions session ON event.session_id = session.session_id AND event.website_id = session.website_id
  WHERE ${bounds('event')}
), preview_events AS (
  SELECT e.*, ${visitorIdExpression(basis)} AS preview_visitor_id FROM preview_rows e
)${
    hasDetails
      ? `, preview_details AS (
  SELECT detail.* FROM \`${projectId}.umami_views.event_data\` detail WHERE ${bounds('detail')}
)`
      : ''
  }, preview_people AS (
  SELECT DISTINCT preview_visitor_id FROM preview_events WHERE preview_visitor_id IS NOT NULL
), preview_members AS (
  SELECT person.preview_visitor_id FROM preview_people person WHERE ${expression}
)
SELECT 'summary' AS kind, (SELECT COUNT(*) FROM preview_members) AS users,
  (SELECT COUNT(*) FROM preview_people) AS total,
  (SELECT COUNT(*) FROM preview_sessions) AS coverage_total,
  (SELECT COUNTIF(NULLIF(distinct_id, '') IS NOT NULL) FROM preview_sessions) AS coverage_cookie`
}
