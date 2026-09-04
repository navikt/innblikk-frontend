import type { RuleGroupType, RuleType } from 'react-querybuilder'
import type {
  CohortGroupNode,
  CohortNode,
  ComparisonOperator,
  LogicalOperator,
  SequenceRelation,
  SequenceTimeUnit,
} from '../model/types.ts'

/**
 * Converts a CohortNode tree to the react-querybuilder RuleGroupType/RuleType shape,
 * for use as the QueryBuilder's `query` value.
 *
 * Encoding of non-native node kinds (RQB only has RuleGroupType/RuleType):
 * - COHORT_REF -> RuleType{ field: '__cohort__', operator: 'in_cohort' | 'not_in_cohort', value: <id> }
 * - SEQUENCE   -> RuleType{ field: '__sequence__', operator: 'sequence', value: <JSON blob> }
 * - event-detail CONDITION (paramKey) -> RuleType{ field: '__detail__', operator: <comparison>, value: <JSON blob {paramKey, value, existsOnly}> }
 *   (a fixed sentinel field rather than encoding paramKey into the field name itself, so a
 *   single custom valueEditor can render the «Detalj» key combobox, the conditional
 *   «Verdi» combobox, and the «Sjekk bare at detaljen finnes» toggle together —
 *   see CohortEditor.tsx's DetailInlineEditor.)
 */
export function nodeToRule(node: CohortNode): RuleGroupType | RuleType {
  switch (node.nodeType) {
    case 'GROUP':
      return {
        combinator: node.combinator.toLowerCase(),
        not: node.negated,
        rules: node.children.map(nodeToRule),
      }

    case 'CONDITION':
      if (node.paramKey != null) {
        return {
          field: '__detail__',
          operator: node.conditionType === 'EXISTS' ? 'EQUALS' : node.conditionType,
          value: JSON.stringify({
            paramKey: node.paramKey,
            value: node.value,
            existsOnly: node.conditionType === 'EXISTS',
          } satisfies ParamValueBlob),
        }
      }
      return {
        field: node.field ?? '',
        operator: node.conditionType,
        value: node.value,
      }

    case 'COHORT_REF':
      return {
        field: '__cohort__',
        operator: node.negated ? 'not_in_cohort' : 'in_cohort',
        value: String(node.referencedCohortId),
      }

    case 'SEQUENCE':
      return {
        field: '__sequence__',
        operator: 'sequence',
        value: JSON.stringify({
          anchor: nodeToRule(node.anchor),
          target: nodeToRule(node.target),
          relation: node.relation,
          windowValue: node.windowValue,
          windowUnit: node.windowUnit,
        }),
      }
  }
}

/** Converts a root CohortGroupNode specifically (the always-a-group root). */
export function nodeToRuleGroup(node: CohortGroupNode): RuleGroupType {
  return nodeToRule(node) as RuleGroupType
}

interface SequenceValueBlob {
  anchor: RuleGroupType
  target: RuleGroupType
  relation: SequenceRelation
  windowValue: number
  windowUnit: SequenceTimeUnit
}

export type { SequenceValueBlob }

export interface ParamValueBlob {
  paramKey: string
  value: string
  /** «Sjekk bare at detaljen finnes» — maps to conditionType EXISTS (key-only, value ignored). */
  existsOnly?: boolean
  /**
   * «Uavhengig av hendelsesnavn» — by default, Detalj/Verdi suggestions are
   * scoped to a sibling «Hendelsesnavn» (event_name) condition in the same
   * rule group (if any), since without that scope a website with many custom
   * events returns every key/value ever set on ANY of them. Set true to opt
   * out and see the unscoped list again.
   */
  ignoreEventName?: boolean
}

/**
 * Converts an RQB RuleGroupType/RuleType (as produced by the QueryBuilder UI) back to
 * a CohortNode tree, inverse of nodeToRule.
 */
export function ruleToNode(rule: RuleGroupType | RuleType): CohortNode {
  if ('combinator' in rule) {
    return {
      nodeType: 'GROUP',
      combinator: rule.combinator.toUpperCase() as LogicalOperator,
      negated: Boolean(rule.not),
      children: rule.rules.map(ruleToNode),
    }
  }

  if (rule.field === '__cohort__') {
    return {
      nodeType: 'COHORT_REF',
      referencedCohortId: Number(rule.value),
      negated: rule.operator === 'not_in_cohort',
    }
  }

  if (rule.field === '__sequence__') {
    // A freshly-added rule has `value: ''` (RQB's default) until the
    // SequenceEditor's onChange fires for the first time — JSON.parse('')
    // throws synchronously, and this runs on every render via the live
    // preview (queryToHuman), so it must never throw here.
    let blob: SequenceValueBlob
    try {
      blob = JSON.parse(rule.value as string) as SequenceValueBlob
      if (!blob.anchor || !blob.target) throw new Error('incomplete sequence blob')
    } catch {
      const emptyStep: RuleGroupType = { combinator: 'and', rules: [] }
      blob = { anchor: emptyStep, target: emptyStep, relation: 'FOLLOWED_BY', windowValue: 1, windowUnit: 'DAY' }
    }
    return {
      nodeType: 'SEQUENCE',
      anchor: ruleToNode(blob.anchor) as CohortGroupNode,
      target: ruleToNode(blob.target) as CohortGroupNode,
      relation: blob.relation,
      windowValue: blob.windowValue,
      windowUnit: blob.windowUnit,
    }
  }

  if (rule.field === '__detail__') {
    // Same rationale as __sequence__ above — guard against the default '' value.
    let blob: ParamValueBlob
    try {
      blob = JSON.parse(rule.value as string) as ParamValueBlob
      if (typeof blob.paramKey !== 'string' || typeof blob.value !== 'string') {
        throw new Error('incomplete detail blob')
      }
    } catch {
      blob = { paramKey: '', value: '' }
    }
    return {
      nodeType: 'CONDITION',
      paramKey: blob.paramKey,
      conditionType: blob.existsOnly ? 'EXISTS' : (rule.operator as ComparisonOperator),
      value: blob.value,
    }
  }

  return {
    nodeType: 'CONDITION',
    field: rule.field,
    conditionType: rule.operator as ComparisonOperator,
    value: rule.value as string,
  }
}
