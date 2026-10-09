import type {
  CohortConditionNode,
  CohortGroupNode,
  CohortNode,
  ComparisonOperator,
  LogicalOperator,
  SequenceRelation,
  SequenceTimeUnit,
} from '../../cohortmanager/model/types.ts'

export type FieldKey =
  'url_path' | 'event_name' | 'detail' | 'referrer_domain' | 'device' | 'browser' | 'os' | 'country'

export const FIELD_OPTIONS: { key: FieldKey; label: string; phrase: string; placeholder: string }[] = [
  { key: 'url_path', label: 'URL-sti', phrase: 'URL-sti', placeholder: 'f.eks. /soknad' },
  { key: 'event_name', label: 'Hendelse', phrase: 'hendelsen', placeholder: 'f.eks. knapp_klikket' },
  { key: 'detail', label: 'Detalj om hendelsen', phrase: 'detaljen', placeholder: 'Velg verdi' },
  { key: 'referrer_domain', label: 'Kom fra (domene)', phrase: 'kom fra', placeholder: 'f.eks. google.com' },
  { key: 'device', label: 'Enhet', phrase: 'enhet', placeholder: 'f.eks. mobile' },
  { key: 'browser', label: 'Nettleser', phrase: 'nettleser', placeholder: 'f.eks. chrome' },
  { key: 'os', label: 'Operativsystem', phrase: 'operativsystem', placeholder: 'f.eks. iOS' },
  { key: 'country', label: 'Land', phrase: 'land', placeholder: 'f.eks. NO' },
]

const KNOWN_FIELDS = new Set<string>(FIELD_OPTIONS.map((f) => f.key))

/** Operators offered in the picker. Negative operators are deliberately absent: negation belongs on the card («Har ikke gjort»). */
export const BASE_OPERATORS: { value: ComparisonOperator; label: string }[] = [
  { value: 'EQUALS', label: 'er' },
  { value: 'CONTAINS', label: 'inneholder' },
  { value: 'STARTS_WITH', label: 'starter med' },
  { value: 'IN_SET', label: 'er en av' },
]

const EXISTS_OPERATOR = { value: 'EXISTS' as ComparisonOperator, label: 'finnes' }

/** Operators from older cohorts: shown if already used, never offered for new conditions. */
export const LEGACY_OPERATOR_LABELS: Partial<Record<ComparisonOperator, string>> = {
  NOT_EQUALS: 'er ikke',
  NOT_CONTAINS: 'inneholder ikke',
  NOT_IN_SET: 'er ikke en av',
  ENDS_WITH: 'slutter med',
  GREATER_THAN_OR_EQUAL: 'er etter eller lik',
  LESS_THAN_OR_EQUAL: 'er før eller lik',
}

export function operatorsFor(field: FieldKey, current?: ComparisonOperator) {
  const options = field === 'detail' ? [...BASE_OPERATORS, EXISTS_OPERATOR] : [...BASE_OPERATORS]
  const legacyLabel = current ? LEGACY_OPERATOR_LABELS[current] : undefined
  if (current && legacyLabel) options.push({ value: current, label: legacyLabel })
  return options
}

export function operatorLabel(operator: ComparisonOperator): string {
  return (
    BASE_OPERATORS.find((o) => o.value === operator)?.label ??
    (operator === 'EXISTS' ? EXISTS_OPERATOR.label : undefined) ??
    LEGACY_OPERATOR_LABELS[operator] ??
    operator
  )
}

export function fieldLabel(field: FieldKey): string {
  return FIELD_OPTIONS.find((f) => f.key === field)?.label ?? field
}

export interface ConditionDraft {
  id: string
  field: FieldKey
  /** Only used when field is 'detail'. */
  detailKey: string
  operator: ComparisonOperator
  /** IN_SET stores a JSON string-array, like the backend does. */
  value: string
}

/** A set of conditions that must all hold on one and the same event, optionally within a time range. */
export interface StepDraft {
  conditions: ConditionDraft[]
  /** JSON `{from, to}` string (see CohortDateRangeValue), or null for «når som helst». */
  time: string | null
}

export interface EventCard extends StepDraft {
  kind: 'event'
  id: string
  negated: boolean
}

export interface CohortCard {
  kind: 'cohort'
  id: string
  negated: boolean
  cohortId: number | null
}

export interface SequenceCard {
  kind: 'sequence'
  id: string
  relation: SequenceRelation
  first: StepDraft
  then: StepDraft
  windowValue: number
  windowUnit: SequenceTimeUnit
}

export type Card = EventCard | CohortCard | SequenceCard | GroupCard

/** A bracketed set of cards with its own og/eller, so «A og (B eller C)» can be built. */
export interface GroupCard {
  kind: 'group'
  id: string
  negated: boolean
  combinator: LogicalOperator
  cards: Card[]
}

export interface Draft {
  combinator: LogicalOperator
  cards: Card[]
}

let idCounter = 0
export const newId = (): string => `n${++idCounter}`

export function emptyCondition(field: FieldKey = 'url_path'): ConditionDraft {
  return { id: newId(), field, detailKey: '', operator: 'EQUALS', value: '' }
}

export function emptyStep(): StepDraft {
  return { conditions: [emptyCondition()], time: null }
}

export function emptyEventCard(): EventCard {
  return { kind: 'event', id: newId(), negated: false, ...emptyStep() }
}

export function emptyCohortCard(): CohortCard {
  return { kind: 'cohort', id: newId(), negated: false, cohortId: null }
}

/** A cohort reference belongs to one website, so switching website clears them everywhere in the draft. */
export function resetCohortRefs(cards: Card[]): Card[] {
  return cards.map((card) => {
    if (card.kind === 'cohort') return { ...card, cohortId: null }
    if (card.kind === 'group') return { ...card, cards: resetCohortRefs(card.cards) }
    return card
  })
}

/** Extends an activity with a following step; the card keeps its id so focus and anchors survive. */
export function eventToSequence(card: EventCard): SequenceCard {
  return {
    kind: 'sequence',
    id: card.id,
    relation: 'FOLLOWED_BY',
    first: { conditions: card.conditions, time: card.time },
    then: emptyStep(),
    windowValue: 1,
    windowUnit: 'DAY',
  }
}

export function sequenceToEvent(card: SequenceCard): EventCard {
  return { kind: 'event', id: card.id, negated: false, ...card.first }
}

export function emptyDraft(): Draft {
  return { combinator: 'AND', cards: [emptyEventCard()] }
}

// ─── Draft → tree ────────────────────────────────────────────────────────────

function conditionToNode(c: ConditionDraft): CohortConditionNode {
  if (c.field === 'detail') {
    return {
      nodeType: 'CONDITION',
      paramKey: c.detailKey,
      conditionType: c.operator,
      value: c.operator === 'EXISTS' ? '' : c.value,
    }
  }
  return { nodeType: 'CONDITION', field: c.field, conditionType: c.operator, value: c.value }
}

function stepToGroup(step: StepDraft, negated = false): CohortGroupNode {
  const children: CohortNode[] = step.conditions.map(conditionToNode)
  if (step.time) {
    children.push({ nodeType: 'CONDITION', field: 'created_at', conditionType: 'BETWEEN', value: step.time })
  }
  return { nodeType: 'GROUP', combinator: 'AND', negated, children }
}

function cardToNode(card: Card): CohortNode {
  switch (card.kind) {
    case 'event':
      return stepToGroup(card, card.negated)
    case 'cohort':
      return { nodeType: 'COHORT_REF', referencedCohortId: card.cohortId ?? 0, negated: card.negated }
    case 'group':
      return {
        nodeType: 'GROUP',
        combinator: card.combinator,
        negated: card.negated,
        children: card.cards.map(cardToNode),
      }
    case 'sequence':
      return {
        nodeType: 'SEQUENCE',
        anchor: stepToGroup(card.first),
        target: stepToGroup(card.then),
        relation: card.relation,
        windowValue: card.windowValue,
        windowUnit: card.windowUnit,
      }
  }
}

export function draftToTree(draft: Draft): CohortGroupNode {
  return { nodeType: 'GROUP', combinator: draft.combinator, negated: false, children: draft.cards.map(cardToNode) }
}

// ─── Tree → draft ────────────────────────────────────────────────────────────

export type TreeToDraftResult = { ok: true; draft: Draft } | { ok: false; reason: string }

const UNSUPPORTED_REASON = 'Den bruker en egenskap eller en tidsangivelse som ikke kan vises i kriteriekort ennå.'

function conditionsToStep(children: CohortNode[]): StepDraft | null {
  const conditions: ConditionDraft[] = []
  let time: string | null = null
  for (const child of children) {
    if (child.nodeType !== 'CONDITION') return null
    if (child.paramKey != null) {
      conditions.push({
        id: newId(),
        field: 'detail',
        detailKey: child.paramKey,
        operator: child.conditionType,
        value: child.value,
      })
      continue
    }
    if (child.field === 'created_at') {
      if (child.conditionType !== 'BETWEEN' || time !== null) return null
      time = child.value
      continue
    }
    if (!child.field || !KNOWN_FIELDS.has(child.field)) return null
    conditions.push({
      id: newId(),
      field: child.field as FieldKey,
      detailKey: '',
      operator: child.conditionType,
      value: child.value,
    })
  }
  return { conditions, time }
}

/** A group is one card only if all its children are conditions that must hold on the same event. */
function groupToStep(group: CohortGroupNode): StepDraft | null {
  if (group.combinator === 'OR' && group.children.length > 1) return null
  return conditionsToStep(group.children)
}

export function treeToDraft(root: CohortNode | null): TreeToDraftResult {
  if (!root) return { ok: true, draft: emptyDraft() }
  if (root.nodeType !== 'GROUP') return { ok: false, reason: UNSUPPORTED_REASON }

  const cards = childrenToCards(root.children, root.combinator)
  if (!cards) return { ok: false, reason: UNSUPPORTED_REASON }
  if (cards.length === 0) return { ok: true, draft: { ...emptyDraft(), combinator: root.combinator } }

  // A negated root has no card of its own, so it becomes a negated group holding everything.
  if (root.negated) {
    const group: GroupCard = { kind: 'group', id: newId(), negated: true, combinator: root.combinator, cards }
    return { ok: true, draft: { combinator: 'AND', cards: [group] } }
  }
  return { ok: true, draft: { combinator: root.combinator, cards } }
}

/** Turns a group's children into cards; null if any child can't be shown as one. */
function childrenToCards(children: CohortNode[], combinator: LogicalOperator): Card[] | null {
  const cards: Card[] = []
  const bareConditions = children.filter((c) => c.nodeType === 'CONDITION')

  // Bare conditions come first, matching the order the SQL resolver emits them in.
  if (bareConditions.length > 0) {
    if (combinator === 'AND') {
      const step = conditionsToStep(bareConditions)
      if (!step) return null
      cards.push({ kind: 'event', id: newId(), negated: false, ...step })
    } else {
      for (const condition of bareConditions) {
        const step = conditionsToStep([condition])
        if (!step) return null
        cards.push({ kind: 'event', id: newId(), negated: false, ...step })
      }
    }
  }

  for (const child of children) {
    switch (child.nodeType) {
      case 'CONDITION':
        break
      case 'GROUP': {
        const step = groupToStep(child)
        if (step) {
          cards.push({ kind: 'event', id: newId(), negated: child.negated, ...step })
          break
        }
        const inner = childrenToCards(child.children, child.combinator)
        if (!inner) return null
        cards.push({ kind: 'group', id: newId(), negated: child.negated, combinator: child.combinator, cards: inner })
        break
      }
      case 'COHORT_REF':
        cards.push({ kind: 'cohort', id: newId(), negated: child.negated, cohortId: child.referencedCohortId })
        break
      case 'SEQUENCE': {
        if (child.anchor.negated || child.target.negated) return null
        const first = groupToStep(child.anchor)
        const then = groupToStep(child.target)
        if (!first || !then) return null
        cards.push({
          kind: 'sequence',
          id: newId(),
          relation: child.relation,
          first,
          then,
          windowValue: child.windowValue,
          windowUnit: child.windowUnit,
        })
        break
      }
    }
  }

  return cards
}
