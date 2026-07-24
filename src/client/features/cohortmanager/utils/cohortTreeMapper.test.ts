import { describe, it, expect } from 'vitest'
import type { RuleGroupType, RuleType } from 'react-querybuilder'
import { nodeToRule, ruleToNode } from './cohortTreeMapper.ts'
import type { CohortGroupNode, CohortConditionNode, CohortRefNode, CohortSequenceNode } from '../model/types.ts'

const condition = (field = 'event_name', value = 'besok'): CohortConditionNode => ({
  nodeType: 'CONDITION',
  field,
  conditionType: 'EQUALS',
  value,
})

const group = (overrides: Partial<Omit<CohortGroupNode, 'nodeType'>> = {}): CohortGroupNode => ({
  nodeType: 'GROUP',
  combinator: 'AND',
  negated: false,
  children: [condition()],
  ...overrides,
})

const cohortRef = (referencedCohortId = 1, negated = false): CohortRefNode => ({
  nodeType: 'COHORT_REF',
  referencedCohortId,
  negated,
})

describe('nodeToRule / ruleToNode round-trip', () => {
  it('round-trips a flat AND group with one condition', () => {
    const node = group({ children: [condition('event_name', 'besok')] })

    const rule = nodeToRule(node)
    expect(ruleToNode(rule)).toEqual(node)
  })

  it('round-trips a nested OR-of-groups (group containing sub-groups)', () => {
    // (text = A AND data = Ja) OR (text = B AND data = Ja)
    const node = group({
      combinator: 'OR',
      children: [
        group({ children: [condition('text', 'A'), condition('data', 'Ja')] }),
        group({ children: [condition('text', 'B'), condition('data', 'Ja')] }),
      ],
    })

    const rule = nodeToRule(node)
    expect(ruleToNode(rule)).toEqual(node)
  })

  it('round-trips deeply nested groups (5 levels)', () => {
    let node: CohortGroupNode = group({ children: [condition()] })
    for (let i = 0; i < 4; i++) {
      node = group({ children: [node] })
    }

    const rule = nodeToRule(node)
    expect(ruleToNode(rule)).toEqual(node)
  })

  it('round-trips an OR group with multiple cohort references (bug: was silently broken before)', () => {
    const node = group({
      combinator: 'OR',
      children: [cohortRef(1), cohortRef(2), cohortRef(3)],
    })

    const rule = nodeToRule(node)
    expect(ruleToNode(rule)).toEqual(node)
  })

  it('round-trips a negated cohort reference (bug: negation was dropped before)', () => {
    const node = group({ children: [condition(), cohortRef(1, true)] })

    const rule = nodeToRule(node)
    expect(ruleToNode(rule)).toEqual(node)
  })

  it('round-trips a sequence node', () => {
    const sequence: CohortSequenceNode = {
      nodeType: 'SEQUENCE',
      anchor: group({ children: [condition('tekst', 'Vedtak alderspensjon')] }),
      target: group({ children: [condition('tekst', 'Fremtidig vedtak')] }),
      relation: 'NOT_FOLLOWED_BY',
      windowValue: 1,
      windowUnit: 'DAY',
    }
    const node = group({ children: [sequence] })

    const rule = nodeToRule(node)
    expect(ruleToNode(rule)).toEqual(node)
  })
})

describe('nodeToRule exact encoding (pins the RQB shape, not just round-trip self-consistency)', () => {
  it('encodes a positive cohort reference as field=__cohort__, operator=in_cohort', () => {
    const node = group({ children: [cohortRef(42, false)] })

    const rule = nodeToRule(node) as RuleGroupType
    const ruleForRef = rule.rules[0] as RuleType

    expect(ruleForRef.field).toBe('__cohort__')
    expect(ruleForRef.operator).toBe('in_cohort')
    expect(ruleForRef.value).toBe('42')
  })

  it('encodes a negated cohort reference as operator=not_in_cohort (not a wrapping NOT-group)', () => {
    const node = group({ children: [cohortRef(42, true)] })

    const rule = nodeToRule(node) as RuleGroupType
    const ruleForRef = rule.rules[0] as RuleType

    expect(ruleForRef.field).toBe('__cohort__')
    expect(ruleForRef.operator).toBe('not_in_cohort')
  })

  it('encodes group negation on the group itself (not) rather than the children', () => {
    const node = group({ negated: true, children: [condition()] })

    const rule = nodeToRule(node) as RuleGroupType

    expect(rule.not).toBe(true)
  })

  it('encodes group combinator in lowercase (RQB convention)', () => {
    const node = group({ combinator: 'OR', children: [condition(), condition('b', 'c')] })

    const rule = nodeToRule(node) as RuleGroupType

    expect(rule.combinator).toBe('or')
  })

  it('encodes a sequence node as a single rule with field=__sequence__', () => {
    const sequence: CohortSequenceNode = {
      nodeType: 'SEQUENCE',
      anchor: group({ children: [condition('tekst', 'Vedtak alderspensjon')] }),
      target: group({ children: [condition('tekst', 'Fremtidig vedtak')] }),
      relation: 'NOT_FOLLOWED_BY',
      windowValue: 1,
      windowUnit: 'DAY',
    }
    const node = group({ children: [sequence] })

    const rule = nodeToRule(node) as RuleGroupType
    const ruleForSequence = rule.rules[0] as RuleType

    expect(ruleForSequence.field).toBe('__sequence__')
    expect(ruleForSequence.operator).toBe('sequence')
    const parsed = JSON.parse(ruleForSequence.value as string)
    expect(parsed.relation).toBe('NOT_FOLLOWED_BY')
    expect(parsed.windowValue).toBe(1)
    expect(parsed.windowUnit).toBe('DAY')
  })
})
