import type { CohortNode, LogicalOperator, SequenceTimeUnit } from '../../cohortmanager/model/types.ts'
import {
  fieldLabel,
  FIELD_OPTIONS,
  operatorLabel,
  treeToDraft,
  type Card,
  type ConditionDraft,
  type Draft,
  type StepDraft,
} from '../model/draft.ts'
import { describeTime } from './time.ts'

export type CohortNames = Record<string, string>

const WINDOW_UNIT_FORMS: Record<SequenceTimeUnit, [string, string]> = {
  MINUTE: ['minutt', 'minutter'],
  HOUR: ['time', 'timer'],
  DAY: ['dag', 'dager'],
  WEEK: ['uke', 'uker'],
  MONTH: ['måned', 'måneder'],
  YEAR: ['år', 'år'],
}

export function windowUnitLabel(unit: SequenceTimeUnit, amount: number): string {
  return WINDOW_UNIT_FORMS[unit][amount === 1 ? 0 : 1]
}

/** How a bracketed group reads: «en av» for eller-groups, «alle» for og-groups, and their negations. */
export function groupPhrase(combinator: LogicalOperator, negated: boolean): string {
  if (combinator === 'OR') return negated ? 'ingen av' : 'en av'
  return negated ? 'ikke alle' : 'alle'
}

function formatValue(c: ConditionDraft): string {
  if (c.operator === 'IN_SET' || c.operator === 'NOT_IN_SET') {
    try {
      const parsed: unknown = JSON.parse(c.value || '[]')
      if (Array.isArray(parsed)) return parsed.map((v) => `«${String(v)}»`).join(', ')
    } catch {
      // fall through
    }
  }
  return c.value ? `«${c.value}»` : '…'
}

export function describeCondition(c: ConditionDraft): string {
  if (c.field === 'detail') {
    const key = `«${c.detailKey}»`
    if (c.operator === 'EXISTS') return `detaljen ${key} finnes`
    return `detaljen ${key} ${operatorLabel(c.operator)} ${formatValue(c)}`
  }
  const phrase = FIELD_OPTIONS.find((f) => f.key === c.field)?.phrase ?? fieldLabel(c.field)
  if (c.field === 'referrer_domain') return `${phrase} ${formatValue(c)}`
  return `${phrase} ${operatorLabel(c.operator)} ${formatValue(c)}`
}

function describeStep(step: StepDraft): string {
  const conditions = step.conditions.map(describeCondition).join(' og ')
  const time = describeTime(step.time)
  return [conditions || 'noe', time].filter(Boolean).join(' ')
}

export function describeCard(card: Card, names: CohortNames): string {
  switch (card.kind) {
    case 'event':
      return `${card.negated ? 'har ikke' : 'har'} gjort noe der ${describeStep(card)}`
    case 'group': {
      const word = card.combinator === 'OR' ? 'eller' : 'og'
      const inner = card.cards.map((c, i) => `${i > 0 ? `${word} ` : ''}${describeCard(c, names)}`).join(' ')
      return `${groupPhrase(card.combinator, card.negated)} (${inner || '…'})`
    }
    case 'cohort': {
      const name = card.cohortId == null ? '…' : (names[String(card.cohortId)] ?? `brukergruppe #${card.cohortId}`)
      return `${card.negated ? 'er ikke med' : 'er med'} i «${name}»`
    }
    case 'sequence': {
      const first = describeStep(card.first)
      const then = describeStep(card.then)
      const window = `innen ${card.windowValue} ${windowUnitLabel(card.windowUnit, card.windowValue)}`
      return card.relation === 'NOT_FOLLOWED_BY'
        ? `har gjort noe der ${first}, men ikke deretter noe der ${then} ${window}`
        : `har gjort noe der ${first}, og deretter noe der ${then} ${window}`
    }
  }
}

export interface DraftDescription {
  intro: string
  lines: { connector: 'og' | 'eller' | null; text: string }[]
}

export function describeDraft(draft: Draft, names: CohortNames): DraftDescription {
  return {
    intro: 'Brukere som',
    lines: draft.cards.map((card, index) => ({
      connector: index === 0 ? null : draft.combinator === 'OR' ? 'eller' : 'og',
      text: describeCard(card, names),
    })),
  }
}

/** One-line summary for lists. */
export function describeTreeInline(root: CohortNode | null, names: CohortNames): string {
  const result = treeToDraft(root)
  if (!result.ok) return 'Kriteriene kan ikke vises som kort ennå.'
  const { lines } = describeDraft(result.draft, names)
  const body = lines.map((l) => `${l.connector ? `${l.connector} ` : ''}${l.text}`).join(' ')
  return `Brukere som ${body}`
}
