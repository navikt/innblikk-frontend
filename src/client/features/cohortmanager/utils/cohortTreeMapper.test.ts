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

const paramCondition = (paramKey = 'tekst', value = 'X'): CohortConditionNode => ({
  nodeType: 'CONDITION',
  paramKey,
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

  it('round-trips a custom event parameter condition (paramKey, not field)', () => {
    const node = group({ children: [paramCondition('tekst', 'Vedtak alderspensjon')] })

    const rule = nodeToRule(node)
    expect(ruleToNode(rule)).toEqual(node)
  })

  it('round-trips two different paramKey conditions AND-ed in one group (query 4/5 shape)', () => {
    const node = group({ children: [paramCondition('text', 'Født før 1963'), paramCondition('data', 'Ja')] })

    const rule = nodeToRule(node)
    expect(ruleToNode(rule)).toEqual(node)
  })

  it('round-trips a sequence whose anchor/target use paramKey conditions (query 6 shape)', () => {
    const sequence: CohortSequenceNode = {
      nodeType: 'SEQUENCE',
      anchor: group({ children: [condition('event_name', 'info'), paramCondition('tekst', 'Vedtak alderspensjon')] }),
      target: group({ children: [condition('event_name', 'info'), paramCondition('tekst', 'Fremtidig vedtak')] }),
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

  it('encodes a paramKey condition as field=__detail__ with a JSON blob carrying {paramKey, value, existsOnly}', () => {
    const node = group({ children: [paramCondition('tekst', 'Vedtak alderspensjon')] })

    const rule = nodeToRule(node) as RuleGroupType
    const ruleForCondition = rule.rules[0] as RuleType

    expect(ruleForCondition.field).toBe('__detail__')
    expect(ruleForCondition.operator).toBe('EQUALS')
    const parsed = JSON.parse(ruleForCondition.value as string)
    expect(parsed).toEqual({ paramKey: 'tekst', value: 'Vedtak alderspensjon', existsOnly: false })
  })

  it('encodes an EXISTS condition as a plain operator + existsOnly flag (RQB has no EXISTS in its operator list)', () => {
    const node = group({
      children: [{ nodeType: 'CONDITION', paramKey: 'skjemaId', conditionType: 'EXISTS', value: '' }],
    })

    const rule = nodeToRule(node) as RuleGroupType
    const ruleForCondition = rule.rules[0] as RuleType

    expect(ruleForCondition.field).toBe('__detail__')
    expect(ruleForCondition.operator).toBe('EQUALS')
    const parsed = JSON.parse(ruleForCondition.value as string)
    expect(parsed).toEqual({ paramKey: 'skjemaId', value: '', existsOnly: true })
    expect(ruleToNode(rule)).toEqual(node)
  })
})

describe('ruleToNode robustness against RQB default values (regression: crashed the whole page)', () => {
  it('does not throw for a freshly-added __sequence__ rule whose value is still the RQB default empty string', () => {
    const rule: RuleType = { field: '__sequence__', operator: 'sequence', value: '' }
    expect(() => ruleToNode(rule)).not.toThrow()
  })

  it('does not throw for a freshly-added __detail__ rule whose value is still the RQB default empty string', () => {
    const rule: RuleType = { field: '__detail__', operator: 'EQUALS', value: '' }
    expect(() => ruleToNode(rule)).not.toThrow()
  })

  it('does not throw for a __sequence__ rule with malformed (non-JSON) value', () => {
    const rule: RuleType = { field: '__sequence__', operator: 'sequence', value: 'not json' }
    expect(() => ruleToNode(rule)).not.toThrow()
  })

  it('does not throw for a __detail__ rule with malformed (non-JSON) value', () => {
    const rule: RuleType = { field: '__detail__', operator: 'EQUALS', value: 'not json' }
    expect(() => ruleToNode(rule)).not.toThrow()
  })
})
