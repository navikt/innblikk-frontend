import { Button, HStack, ToggleGroup, VStack } from '@navikt/ds-react'
import { PlusIcon } from '@navikt/aksel-icons'
import type { CohortDto, LogicalOperator } from '../../cohortmanager/model/types.ts'
import { emptyCohortCard, emptyEventCard, eventToSequence, newId, type Card, type GroupCard } from '../model/draft.ts'
import { anchorFor } from '../utils/validate.ts'
import { CriterionCard } from './CriterionCard.tsx'

export interface CardList {
  combinator: LogicalOperator
  cards: Card[]
}

interface CardListEditorProps extends CardList {
  onChange: (next: CardList) => void
  websiteId: string | undefined
  others: CohortDto[]
  showErrors: boolean
  /** 0 for the top level, 1+ inside a group. */
  depth: number
  onFocusCard: (id: string) => void
}

/** One level of cards with its og/eller connectors and add buttons; groups render another one inside themselves. */
export function CardListEditor({
  combinator,
  cards,
  onChange,
  websiteId,
  others,
  showErrors,
  depth,
  onFocusCard,
}: CardListEditorProps) {
  const update = (next: Partial<CardList>) => onChange({ combinator, cards, ...next })

  const updateCard = (cardId: string, next: Card) => update({ cards: cards.map((c) => (c.id === cardId ? next : c)) })

  const removeCard = (cardId: string) => update({ cards: cards.filter((c) => c.id !== cardId) })

  const addCard = (card: Card, nextCombinator?: LogicalOperator) => {
    onChange({ combinator: nextCombinator ?? combinator, cards: [...cards, card] })
    onFocusCard(card.id)
  }

  const splitCondition = (cardId: string, conditionId: string) => {
    const index = cards.findIndex((c) => c.id === cardId)
    const card = cards[index]
    if (!card || card.kind !== 'event') return
    const moved = card.conditions.find((c) => c.id === conditionId)
    if (!moved) return
    const split = { ...emptyEventCard(), negated: card.negated, time: card.time, conditions: [moved] }
    const next = cards.slice()
    next[index] = { ...card, conditions: card.conditions.filter((c) => c.id !== conditionId) }
    next.splice(index + 1, 0, split)
    update({ cards: next })
  }

  /**
   * «og» / «eller» below the last card. A list has one connector, so asking for the other one
   * puts the last card and the new one in a bracketed group: «A og B» + eller → «A og (B eller C)».
   */
  const addWith = (requested: LogicalOperator) => {
    const next = emptyEventCard()
    if (cards.length <= 1 || requested === combinator) {
      addCard(next, requested)
      return
    }
    const last = cards[cards.length - 1]
    if (last.kind === 'group' && !last.negated && last.combinator === requested) {
      updateCard(last.id, { ...last, cards: [...last.cards, next] })
    } else {
      const wrapped: GroupCard = {
        kind: 'group',
        id: newId(),
        negated: false,
        combinator: requested,
        cards: [last, next],
      }
      update({ cards: [...cards.slice(0, -1), wrapped] })
    }
    onFocusCard(next.id)
  }

  const lastCard = cards[cards.length - 1]
  const canContinueWithThen = lastCard?.kind === 'event' && !lastCard.negated

  return (
    <VStack gap="space-8">
      {cards.map((card, index) => (
        <div key={card.id}>
          {index > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '0.5rem' }}>
              <ToggleGroup
                size="small"
                aria-label="Hvordan henger kriteriene sammen?"
                value={combinator}
                onChange={(v) => update({ combinator: v as LogicalOperator })}
              >
                <ToggleGroup.Item value="AND" label="og" />
                <ToggleGroup.Item value="OR" label="eller" />
              </ToggleGroup>
            </div>
          )}
          <CriterionCard
            card={card}
            index={index}
            total={cards.length}
            depth={depth}
            websiteId={websiteId}
            cohorts={others}
            showErrors={showErrors}
            onChange={(next) => updateCard(card.id, next)}
            onRemove={() => removeCard(card.id)}
            onSplitCondition={(conditionId) => splitCondition(card.id, conditionId)}
            renderGroupContent={(group) => (
              <div style={{ borderLeft: '2px solid var(--ax-border-neutral-subtle)', paddingLeft: '1rem' }}>
                <CardListEditor
                  combinator={group.combinator}
                  cards={group.cards}
                  onChange={(next) => updateCard(group.id, { ...group, ...next })}
                  websiteId={websiteId}
                  others={others}
                  showErrors={showErrors}
                  depth={depth + 1}
                  onFocusCard={onFocusCard}
                />
              </div>
            )}
          />
        </div>
      ))}

      <HStack gap="space-8" wrap id={depth === 0 ? anchorFor('add-card') : undefined}>
        {cards.length === 0 && (
          <Button
            type="button"
            size="small"
            variant="secondary"
            icon={<PlusIcon aria-hidden />}
            onClick={() => addCard(emptyEventCard())}
          >
            Legg til kriterium
          </Button>
        )}
        {cards.length > 0 && (
          <Button
            type="button"
            size="small"
            variant="secondary"
            icon={<PlusIcon aria-hidden />}
            onClick={() => addWith('AND')}
          >
            og
          </Button>
        )}
        {cards.length > 0 && (
          <Button
            type="button"
            size="small"
            variant="secondary"
            icon={<PlusIcon aria-hidden />}
            onClick={() => addWith('OR')}
          >
            eller
          </Button>
        )}
        {canContinueWithThen && (
          <Button
            type="button"
            size="small"
            variant="secondary"
            icon={<PlusIcon aria-hidden />}
            onClick={() => updateCard(lastCard.id, eventToSequence(lastCard))}
          >
            deretter
          </Button>
        )}
        {others.length > 0 && cards.length > 0 && (
          <Button
            type="button"
            size="small"
            variant="tertiary"
            icon={<PlusIcon aria-hidden />}
            onClick={() => addCard(emptyCohortCard())}
          >
            Bruk en eksisterende brukergruppe
          </Button>
        )}
      </HStack>
    </VStack>
  )
}
