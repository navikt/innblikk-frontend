import { createContext, useContext } from 'react'
import { BodyShort, Box, Button, HStack, Select, TextField, ToggleGroup, VStack } from '@navikt/ds-react'
import { TrashIcon, XMarkIcon } from '@navikt/aksel-icons'
import type { CohortDto, SequenceRelation, SequenceTimeUnit } from '../../cohortmanager/model/types.ts'
import type { Card, CohortCard, EventCard, SequenceCard } from '../model/draft.ts'
import { sequenceToEvent } from '../model/draft.ts'
import { windowUnitLabel } from '../utils/describe.ts'
import { anchorFor } from '../utils/validate.ts'
import { StepEditor } from './StepEditor.tsx'

interface CriterionCardProps {
  card: Card
  index: number
  /** Number of cards in the draft; the number badge only helps when there are several. */
  total: number
  websiteId: string | undefined
  cohorts: CohortDto[]
  showErrors: boolean
  onChange: (next: Card) => void
  onRemove: () => void
  onSplitCondition: (conditionId: string) => void
}

const WINDOW_UNITS: SequenceTimeUnit[] = ['MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']

const ShowNumberContext = createContext(false)

function CardShell({
  card,
  index,
  title,
  onRemove,
  children,
}: {
  card: Card
  index: number
  title: React.ReactNode
  onRemove: () => void
  children: React.ReactNode
}) {
  const showNumber = useContext(ShowNumberContext)
  return (
    <Box
      id={anchorFor(card.id)}
      borderWidth="1"
      borderColor="neutral-subtle"
      borderRadius="8"
      padding="space-16"
      background="default"
      as="section"
      aria-label={`Kriterium ${index + 1}`}
    >
      <VStack gap="space-16">
        <HStack justify="space-between" align="center" gap="space-12" wrap>
          <HStack gap="space-12" align="center" wrap>
            {showNumber && (
              <Box
                background="accent-soft"
                borderRadius="full"
                style={{ width: '1.75rem', height: '1.75rem', display: 'grid', placeItems: 'center' }}
              >
                <BodyShort size="small" weight="semibold" as="span">
                  {index + 1}
                </BodyShort>
              </Box>
            )}
            {index === 0 && (
              <BodyShort size="small" as="span">
                Brukere som
              </BodyShort>
            )}
            {title}
          </HStack>
          <Button
            type="button"
            size="small"
            variant="tertiary"
            data-color="neutral"
            icon={<TrashIcon aria-hidden />}
            onClick={onRemove}
          >
            Fjern kriterium
          </Button>
        </HStack>
        {children}
      </VStack>
    </Box>
  )
}

function NegationToggle({
  negated,
  onChange,
  yes,
  no,
  label,
}: {
  negated: boolean
  onChange: (negated: boolean) => void
  yes: string
  no: string
  label: string
}) {
  return (
    <ToggleGroup size="small" aria-label={label} value={negated ? 'no' : 'yes'} onChange={(v) => onChange(v === 'no')}>
      <ToggleGroup.Item value="yes" label={yes} />
      <ToggleGroup.Item value="no" label={no} />
    </ToggleGroup>
  )
}

function EventCardBody({
  card,
  index,
  websiteId,
  showErrors,
  onChange,
  onRemove,
  onSplitCondition,
}: CriterionCardProps & { card: EventCard }) {
  return (
    <CardShell
      card={card}
      index={index}
      onRemove={onRemove}
      title={
        <HStack gap="space-8" align="center" wrap>
          <NegationToggle
            negated={card.negated}
            onChange={(negated) => onChange({ ...card, negated })}
            yes="har gjort"
            no="har ikke gjort"
            label="Skal brukeren ha gjort dette eller ikke?"
          />
          <BodyShort as="span" size="small">
            noe på nettstedet
          </BodyShort>
        </HStack>
      }
    >
      <StepEditor
        step={card}
        anchorKey={`${card.id}-add`}
        websiteId={websiteId}
        showErrors={showErrors}
        onChange={(step) => onChange({ ...card, ...step })}
        onSplitCondition={onSplitCondition}
      />
    </CardShell>
  )
}

function CohortCardBody({
  card,
  index,
  cohorts,
  showErrors,
  onChange,
  onRemove,
}: CriterionCardProps & { card: CohortCard }) {
  return (
    <CardShell
      card={card}
      index={index}
      onRemove={onRemove}
      title={
        <NegationToggle
          negated={card.negated}
          onChange={(negated) => onChange({ ...card, negated })}
          yes="er med i"
          no="er ikke med i"
          label="Skal brukeren være med i en annen brukergruppe eller ikke?"
        />
      }
    >
      <div style={{ maxWidth: '24rem' }}>
        <Select
          label="Brukergruppe"
          size="small"
          value={card.cohortId == null ? '' : String(card.cohortId)}
          error={showErrors && card.cohortId == null ? 'Velg en brukergruppe' : undefined}
          onChange={(e) => onChange({ ...card, cohortId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Velg brukergruppe …</option>
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
    </CardShell>
  )
}

function SequenceCardBody({
  card,
  index,
  websiteId,
  showErrors,
  onChange,
  onRemove,
}: CriterionCardProps & { card: SequenceCard }) {
  return (
    <CardShell
      card={card}
      index={index}
      onRemove={onRemove}
      title={
        <BodyShort as="span" weight="semibold">
          gjorde noe først, og deretter noe annet
        </BodyShort>
      }
    >
      <VStack gap="space-16">
        <VStack gap="space-8">
          <BodyShort weight="semibold">Først gjorde brukeren noe</BodyShort>
          <StepEditor
            step={card.first}
            anchorKey={`${card.id}-first-add`}
            websiteId={websiteId}
            showErrors={showErrors}
            onChange={(first) => onChange({ ...card, first })}
          />
        </VStack>

        <div style={{ maxWidth: '20rem' }}>
          <Select
            label="Hva skjedde etterpå?"
            size="small"
            value={card.relation}
            onChange={(e) => onChange({ ...card, relation: e.target.value as SequenceRelation })}
          >
            <option value="FOLLOWED_BY">Deretter gjorde brukeren</option>
            <option value="NOT_FOLLOWED_BY">Deretter gjorde brukeren IKKE</option>
          </Select>
        </div>

        <VStack gap="space-8">
          <BodyShort weight="semibold">{card.relation === 'NOT_FOLLOWED_BY' ? 'Dette' : 'Noe annet'}</BodyShort>
          <StepEditor
            step={card.then}
            anchorKey={`${card.id}-then-add`}
            websiteId={websiteId}
            showErrors={showErrors}
            onChange={(then) => onChange({ ...card, then })}
          />
        </VStack>

        <HStack gap="space-8" align="end" wrap id={anchorFor(`${card.id}-window`)}>
          <div style={{ width: '8rem' }}>
            <TextField
              label="Innen"
              size="small"
              type="number"
              min={1}
              value={String(card.windowValue)}
              error={showErrors && !(card.windowValue >= 1) ? 'Minst 1' : undefined}
              onChange={(e) => onChange({ ...card, windowValue: Number(e.target.value) })}
            />
          </div>
          <div style={{ width: '10rem' }}>
            <Select
              label="Enhet"
              hideLabel
              size="small"
              value={card.windowUnit}
              onChange={(e) => onChange({ ...card, windowUnit: e.target.value as SequenceTimeUnit })}
            >
              {WINDOW_UNITS.map((u) => (
                <option key={u} value={u}>
                  {windowUnitLabel(u, card.windowValue)}
                </option>
              ))}
            </Select>
          </div>
        </HStack>

        <div>
          <Button
            type="button"
            size="small"
            variant="tertiary"
            data-color="neutral"
            icon={<XMarkIcon aria-hidden />}
            onClick={() => onChange(sequenceToEvent(card))}
          >
            Fjern «deretter»
          </Button>
        </div>
      </VStack>
    </CardShell>
  )
}

export function CriterionCard(props: CriterionCardProps) {
  return (
    <ShowNumberContext.Provider value={props.total > 1}>
      <CardByKind {...props} />
    </ShowNumberContext.Provider>
  )
}

function CardByKind(props: CriterionCardProps) {
  switch (props.card.kind) {
    case 'event':
      return <EventCardBody {...props} card={props.card} />
    case 'cohort':
      return <CohortCardBody {...props} card={props.card} />
    case 'sequence':
      return <SequenceCardBody {...props} card={props.card} />
  }
}
