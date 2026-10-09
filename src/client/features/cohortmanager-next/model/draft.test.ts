import { describe, it, expect } from 'vitest'
import { resolveNodeToSql, type ResolveContext } from '../../cohortmanager/utils/cohortSqlResolver.ts'
import type {
  CohortConditionNode,
  CohortGroupNode,
  CohortSequenceNode,
  CohortNode,
} from '../../cohortmanager/model/types.ts'
import {
  draftToTree,
  treeToDraft,
  emptyDraft,
  emptyCondition,
  eventToSequence,
  sequenceToEvent,
  type Draft,
  type EventCard,
} from './draft.ts'

const condition = (
  field: string,
  value: string,
  conditionType: CohortConditionNode['conditionType'] = 'EQUALS',
): CohortConditionNode => ({ nodeType: 'CONDITION', field, conditionType, value })

const group = (overrides: Partial<Omit<CohortGroupNode, 'nodeType'>> = {}): CohortGroupNode => ({
  nodeType: 'GROUP',
  combinator: 'AND',
  negated: false,
  children: [],
  ...overrides,
})

const ctx: ResolveContext = {
  outerAlias: 'b',
  eventsTable: 'events',
  visitorIdColumn: 'visitor_id',
  resolveCohortRef: () => group({ children: [condition('event_name', 'x')] }),
}

const sql = (node: CohortNode) => resolveNodeToSql(node, ctx)

function roundTrip(root: CohortGroupNode): CohortGroupNode {
  const result = treeToDraft(root)
  if (!result.ok) throw new Error(result.reason)
  return draftToTree(result.draft)
}

describe('treeToDraft / draftToTree', () => {
  it('turns an empty draft into an empty-card tree and back', () => {
    const tree = draftToTree(emptyDraft())
    expect(tree.children).toHaveLength(1)
    expect(treeToDraft(null).ok).toBe(true)
  })

  it('maps a negated child group to a «har ikke gjort» card', () => {
    const root = group({ children: [group({ negated: true, children: [condition('event_name', 'sendt')] })] })
    const result = treeToDraft(root)
    expect(result.ok && result.draft.cards[0]).toMatchObject({ kind: 'event', negated: true })
  })

  it('collapses root-level AND conditions into one card (same event)', () => {
    const root = group({ children: [condition('url_path', '/a'), condition('device', 'mobile')] })
    const result = treeToDraft(root)
    expect(result.ok && result.draft.cards).toHaveLength(1)
    expect(result.ok && (result.draft.cards[0] as EventCard).conditions).toHaveLength(2)
  })

  it('splits root-level OR conditions into one card each', () => {
    const root = group({ combinator: 'OR', children: [condition('url_path', '/a'), condition('url_path', '/b')] })
    const result = treeToDraft(root)
    expect(result.ok && result.draft.cards).toHaveLength(2)
  })

  it('extracts created_at BETWEEN into the card time', () => {
    const time = JSON.stringify({ from: 'a', to: 'b' })
    const root = group({
      children: [group({ children: [condition('url_path', '/a'), condition('created_at', time, 'BETWEEN')] })],
    })
    const result = treeToDraft(root)
    const card = result.ok ? (result.draft.cards[0] as EventCard) : undefined
    expect(card?.time).toBe(time)
    expect(card?.conditions).toHaveLength(1)
  })

  it('maps a paramKey condition to a detail condition and back', () => {
    const detail: CohortConditionNode = {
      nodeType: 'CONDITION',
      paramKey: 'skjemaId',
      conditionType: 'EXISTS',
      value: '',
    }
    const root = group({ children: [group({ children: [detail] })] })
    expect(roundTrip(root).children[0]).toEqual(group({ children: [detail] }))
  })

  it('rejects groups nested more than one level', () => {
    const root = group({ children: [group({ children: [group({ children: [condition('url_path', '/a')] })] })] })
    expect(treeToDraft(root).ok).toBe(false)
  })

  it('rejects an OR group with several conditions inside one card', () => {
    const root = group({
      children: [group({ combinator: 'OR', children: [condition('url_path', '/a'), condition('device', 'mobile')] })],
    })
    expect(treeToDraft(root).ok).toBe(false)
  })

  it('rejects a negated root and unknown fields', () => {
    expect(treeToDraft(group({ negated: true, children: [condition('url_path', '/a')] })).ok).toBe(false)
    expect(treeToDraft(group({ children: [condition('screen', '1x1')] })).ok).toBe(false)
  })

  it('round-trips a sequence node', () => {
    const sequence: CohortSequenceNode = {
      nodeType: 'SEQUENCE',
      anchor: group({ children: [condition('url_path', '/a')] }),
      target: group({ children: [condition('event_name', 'sendt')] }),
      relation: 'NOT_FOLLOWED_BY',
      windowValue: 3,
      windowUnit: 'DAY',
    }
    const root = group({ children: [sequence] })
    expect(roundTrip(root)).toEqual(root)
  })

  it('keeps a cohort reference and its negation', () => {
    const root = group({ children: [{ nodeType: 'COHORT_REF', referencedCohortId: 7, negated: true }] })
    expect(roundTrip(root)).toEqual(root)
  })

  it('keeps legacy operators on loaded conditions', () => {
    const root = group({ children: [group({ children: [condition('browser', 'Safari', 'NOT_EQUALS')] })] })
    expect(roundTrip(root)).toEqual(root)
  })
})

describe('resolved SQL is unchanged by loading an old cohort into cards', () => {
  const time = JSON.stringify({ from: 'x', to: 'y' })
  const cases: Record<string, CohortGroupNode> = {
    'root AND bare conditions': group({ children: [condition('url_path', '/a'), condition('device', 'mobile')] }),
    'root OR bare conditions': group({
      combinator: 'OR',
      children: [condition('url_path', '/a'), condition('url_path', '/b')],
    }),
    'groups with negation': group({
      children: [
        group({ children: [condition('url_path', '/a')] }),
        group({ negated: true, children: [condition('event_name', 'sendt')] }),
      ],
    }),
    'bare conditions plus group': group({
      children: [group({ negated: true, children: [condition('os', 'iOS')] }), condition('url_path', '/a')],
    }),
    'time range': group({
      children: [group({ children: [condition('url_path', '/a'), condition('created_at', time, 'BETWEEN')] })],
    }),
    cohort: group({ children: [{ nodeType: 'COHORT_REF', referencedCohortId: 1, negated: true }] }),
  }

  for (const [name, root] of Object.entries(cases)) {
    it(name, () => {
      expect(sql(roundTrip(root))).toBe(sql(root))
    })
  }
})

describe('draft sanity', () => {
  it('turns an activity into a sequence and back without losing the first step', () => {
    const card = { ...(emptyDraft().cards[0] as EventCard), time: '{"from":"a","to":"b"}' }
    const sequence = eventToSequence(card)
    expect(sequence.id).toBe(card.id)
    expect(sequence.first).toEqual({ conditions: card.conditions, time: card.time })
    expect(sequence.then.conditions).toHaveLength(1)
    expect(sequenceToEvent(sequence)).toEqual({ ...card, negated: false })
  })

  it('uses the draft combinator on the root', () => {
    const draft: Draft = {
      combinator: 'OR',
      cards: [{ ...(emptyDraft().cards[0] as EventCard), conditions: [emptyCondition()] }],
    }
    expect(draftToTree(draft).combinator).toBe('OR')
  })
})
