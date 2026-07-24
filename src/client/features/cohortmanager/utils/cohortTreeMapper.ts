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
      return {
        field: node.field,
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
    const blob = JSON.parse(rule.value as string) as SequenceValueBlob
    return {
      nodeType: 'SEQUENCE',
      anchor: ruleToNode(blob.anchor) as CohortGroupNode,
      target: ruleToNode(blob.target) as CohortGroupNode,
      relation: blob.relation,
      windowValue: blob.windowValue,
      windowUnit: blob.windowUnit,
    }
  }

  return {
    nodeType: 'CONDITION',
    field: rule.field,
    conditionType: rule.operator as ComparisonOperator,
    value: rule.value as string,
  }
}
