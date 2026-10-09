import { useState } from 'react'
import { Alert, BodyShort, Button, HStack, Select, VStack } from '@navikt/ds-react'
import { XMarkIcon } from '@navikt/aksel-icons'
import { SuggestingValueEditor } from '../../cohortmanager/ui/SuggestingValueEditor.tsx'
import type { SuggestibleColumn } from '../../cohortmanager/api/columnValuesApi.ts'
import { FIELD_OPTIONS, fieldLabel, operatorsFor, type ConditionDraft, type FieldKey } from '../model/draft.ts'
import { anchorFor, conditionError } from '../utils/validate.ts'

interface ConditionRowProps {
  condition: ConditionDraft
  websiteId: string | undefined
  /** Event name from a sibling «Hendelse er …» condition, used to narrow detail suggestions. */
  eventName?: string
  showErrors: boolean
  conflict: boolean
  onChange: (next: ConditionDraft) => void
  onRemove: () => void
  onSplit?: () => void
}

const fieldOption = (field: FieldKey) => FIELD_OPTIONS.find((f) => f.key === field)

export function ConditionRow({
  condition,
  websiteId,
  eventName,
  showErrors,
  conflict,
  onChange,
  onRemove,
  onSplit,
}: ConditionRowProps) {
  const [allEvents, setAllEvents] = useState(false)
  const isDetail = condition.field === 'detail'
  const isSet = condition.operator === 'IN_SET' || condition.operator === 'NOT_IN_SET'
  const scopedEvent = isDetail && !allEvents ? eventName : undefined
  const error = showErrors ? conditionError(condition) : undefined
  const keyMissing = isDetail && !condition.detailKey.trim()

  return (
    <VStack gap="space-8" id={anchorFor(condition.id)}>
      <HStack gap="space-8" align="start" wrap>
        <div style={{ flex: '0 0 12rem' }}>
          <Select
            label="Egenskap"
            hideLabel
            size="small"
            value={condition.field}
            onChange={(e) =>
              onChange({
                ...condition,
                field: e.target.value as FieldKey,
                detailKey: '',
                operator: 'EQUALS',
                value: '',
              })
            }
          >
            {FIELD_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>

        {isDetail && (
          <div style={{ flex: '1 1 12rem', minWidth: '12rem' }}>
            <SuggestingValueEditor
              websiteId={websiteId}
              column="event_data_key"
              hideFailureNote
              eventName={scopedEvent}
              label="Detalj"
              hideLabel
              placeholder="Velg detalj, f.eks. skjemaId"
              value={condition.detailKey}
              error={showErrors && keyMissing ? 'Velg hvilken detalj det gjelder' : undefined}
              onChange={(detailKey) => onChange({ ...condition, detailKey, value: '' })}
            />
          </div>
        )}

        <div style={{ flex: '0 0 9rem' }}>
          <Select
            label="Sammenligning"
            hideLabel
            size="small"
            value={condition.operator}
            onChange={(e) => {
              const operator = e.target.value as ConditionDraft['operator']
              const wasSet = isSet
              const willBeSet = operator === 'IN_SET'
              onChange({
                ...condition,
                operator,
                value: wasSet !== willBeSet || operator === 'EXISTS' ? '' : condition.value,
              })
            }}
          >
            {operatorsFor(condition.field, condition.operator).map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </Select>
        </div>

        {condition.operator !== 'EXISTS' && (
          <div style={{ flex: '1 1 14rem', minWidth: '12rem' }}>
            <SuggestingValueEditor
              websiteId={websiteId}
              column={(isDetail ? 'event_data_value' : condition.field) as SuggestibleColumn}
              suggestionKey={isDetail && !keyMissing ? condition.detailKey : undefined}
              eventName={scopedEvent}
              label="Verdi"
              hideLabel
              hideFailureNote
              multi={isSet}
              disabled={isDetail && keyMissing}
              placeholder={isDetail && keyMissing ? 'Velg en detalj først' : fieldOption(condition.field)?.placeholder}
              value={condition.value}
              error={error && !(isDetail && keyMissing) ? error : undefined}
              onChange={(value) => onChange({ ...condition, value })}
            />
          </div>
        )}

        <Button
          type="button"
          variant="tertiary"
          size="small"
          data-color="neutral"
          icon={<XMarkIcon aria-hidden />}
          onClick={onRemove}
        >
          <span className="sr-only">Fjern vilkår</span>
        </Button>
      </HStack>

      {isDetail && eventName && (
        <div>
          <Button type="button" variant="tertiary" size="xsmall" onClick={() => setAllEvents((v) => !v)}>
            {allEvents ? `Vis bare forslag fra «${eventName}»` : 'Vis forslag fra alle hendelser'}
          </Button>
        </div>
      )}

      {conflict && (
        <Alert variant="warning" size="small" inline>
          <BodyShort size="small">
            Én aktivitet kan ikke ha to ulike «{fieldLabel(condition.field)}». Mente du to kriterier?
          </BodyShort>
          {onSplit && (
            <Button type="button" size="xsmall" variant="secondary" onClick={onSplit}>
              Flytt til eget kriterium
            </Button>
          )}
        </Alert>
      )}
    </VStack>
  )
}
