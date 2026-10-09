import type { Card, ConditionDraft, Draft, StepDraft } from '../model/draft.ts'
import { fieldLabel } from '../model/draft.ts'

export interface ValidationIssue {
  /** Element id to focus when the issue is clicked in the error summary. */
  anchorId: string
  message: string
}

export const anchorFor = (id: string) => `cohort-next-${id}`

/** Inline error for one condition, or undefined if it is complete. */
export function conditionError(c: ConditionDraft): string | undefined {
  if (c.field === 'detail' && !c.detailKey.trim()) return 'Velg hvilken detalj det gjelder'
  if (c.operator === 'EXISTS') return undefined
  if (c.operator === 'IN_SET' || c.operator === 'NOT_IN_SET') {
    try {
      const parsed: unknown = JSON.parse(c.value || '[]')
      if (Array.isArray(parsed) && parsed.length > 0) return undefined
    } catch {
      // fall through
    }
    return 'Velg minst én verdi'
  }
  return c.value.trim() ? undefined : 'Skriv eller velg en verdi'
}

/**
 * Conditions inside one step must all hold on the same event, so two different
 * exact values for the same field can never match. Returns the later condition ids.
 */
export function findConflictingConditionIds(step: StepDraft): Set<string> {
  const firstByKey = new Map<string, ConditionDraft>()
  const conflicts = new Set<string>()
  for (const c of step.conditions) {
    if (c.operator !== 'EQUALS' || !c.value.trim()) continue
    const key = c.field === 'detail' ? `detail:${c.detailKey}` : c.field
    const earlier = firstByKey.get(key)
    if (!earlier) firstByKey.set(key, c)
    else if (earlier.value !== c.value) conflicts.add(c.id)
  }
  return conflicts
}

function validateStep(step: StepDraft, label: string, addAnchorKey: string, issues: ValidationIssue[]) {
  if (step.conditions.length === 0) {
    issues.push({ anchorId: anchorFor(addAnchorKey), message: `${label}: legg til minst ett vilkår` })
  }
  for (const c of step.conditions) {
    const error = conditionError(c)
    if (error)
      issues.push({
        anchorId: anchorFor(c.id),
        message: `${label}: ${error.toLowerCase()} for «${fieldLabel(c.field)}»`,
      })
  }
  for (const id of findConflictingConditionIds(step)) {
    issues.push({
      anchorId: anchorFor(id),
      message: `${label}: en aktivitet kan ikke ha to ulike verdier for samme felt`,
    })
  }
}

function validateCard(card: Card, label: string, issues: ValidationIssue[]) {
  switch (card.kind) {
    case 'group':
      if (card.cards.length === 0) {
        issues.push({ anchorId: anchorFor(card.id), message: `${label}: gruppen må ha minst ett kriterium` })
      }
      card.cards.forEach((inner, index) => validateCard(inner, `${label}.${index + 1}`, issues))
      break
    case 'event':
      validateStep(card, label, `${card.id}-add`, issues)
      break
    case 'cohort':
      if (card.cohortId == null)
        issues.push({ anchorId: anchorFor(card.id), message: `${label}: velg en brukergruppe` })
      break
    case 'sequence':
      validateStep(card.first, `${label} (først)`, `${card.id}-first-add`, issues)
      validateStep(card.then, `${label} (deretter)`, `${card.id}-then-add`, issues)
      if (!Number.isInteger(card.windowValue) || card.windowValue < 1) {
        issues.push({
          anchorId: anchorFor(`${card.id}-window`),
          message: `${label}: tidsrommet må være et helt tall på minst 1`,
        })
      }
      break
  }
}

export function validateDraft(draft: Draft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (draft.cards.length === 0) {
    issues.push({ anchorId: anchorFor('add-card'), message: 'Legg til minst ett kriterium' })
  }
  draft.cards.forEach((card, index) => validateCard(card, `Kriterium ${index + 1}`, issues))
  return issues
}
