import { BodyShort, Button, HStack, VStack } from '@navikt/ds-react'
import { PlusIcon } from '@navikt/aksel-icons'
import { emptyCondition, FIELD_OPTIONS, type ConditionDraft, type StepDraft } from '../model/draft.ts'
import { anchorFor, findConflictingConditionIds } from '../utils/validate.ts'
import { ConditionRow } from './ConditionRow.tsx'
import { TimeRangeSelect } from './TimeRangeSelect.tsx'

interface StepEditorProps {
  step: StepDraft
  /** Key for the «legg til vilkår» anchor, so the error summary can focus it. */
  anchorKey: string
  websiteId: string | undefined
  showErrors: boolean
  onChange: (next: StepDraft) => void
  onSplitCondition?: (conditionId: string) => void
}

export function StepEditor({ step, anchorKey, websiteId, showErrors, onChange, onSplitCondition }: StepEditorProps) {
  const conflicts = findConflictingConditionIds(step)
  const eventName = step.conditions.find(
    (c) => c.field === 'event_name' && c.operator === 'EQUALS' && c.value.trim(),
  )?.value

  const updateCondition = (next: ConditionDraft) =>
    onChange({ ...step, conditions: step.conditions.map((c) => (c.id === next.id ? next : c)) })

  const addCondition = () => {
    const used = new Set(step.conditions.map((c) => c.field))
    const field = FIELD_OPTIONS.find((f) => !used.has(f.key))?.key ?? 'url_path'
    onChange({ ...step, conditions: [...step.conditions, emptyCondition(field)] })
  }

  return (
    <VStack gap="space-12">
      {step.conditions.length > 1 && (
        <BodyShort size="small" textColor="subtle">
          Alle vilkårene må stemme på én og samme aktivitet.
        </BodyShort>
      )}

      <VStack gap="space-12">
        {step.conditions.map((condition, index) => (
          <HStack key={condition.id} gap="space-12" align="start" wrap={false}>
            <BodyShort size="small" weight="semibold" style={{ flex: '0 0 2.5rem', paddingTop: '0.5rem' }}>
              {index === 0 ? 'der' : 'og'}
            </BodyShort>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <ConditionRow
                condition={condition}
                websiteId={websiteId}
                eventName={eventName}
                showErrors={showErrors}
                conflict={conflicts.has(condition.id)}
                onChange={updateCondition}
                onRemove={() => onChange({ ...step, conditions: step.conditions.filter((c) => c.id !== condition.id) })}
                onSplit={onSplitCondition ? () => onSplitCondition(condition.id) : undefined}
              />
            </div>
          </HStack>
        ))}
      </VStack>

      <div id={anchorFor(anchorKey)}>
        <Button type="button" size="small" variant="tertiary" icon={<PlusIcon aria-hidden />} onClick={addCondition}>
          Legg til vilkår
        </Button>
      </div>

      <TimeRangeSelect value={step.time} onChange={(time) => onChange({ ...step, time })} />
    </VStack>
  )
}
