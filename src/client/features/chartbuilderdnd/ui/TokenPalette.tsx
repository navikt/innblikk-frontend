import { BodyShort, Heading, Label } from '@navikt/ds-react'
import { SLOT_LABELS } from '../model/constants'
import type { SlotType, TokenOption } from '../model/types'

type TokenPaletteProps = {
  groupedTokens: Record<SlotType, TokenOption[]>
  onDragStart: (tokenId: string) => void
  onDragEnd: () => void
  onTokenClick: (tokenId: string) => void
}

const SLOT_ORDER: SlotType[] = ['metric', 'timeBucket', 'groupBy', 'period', 'limit']

export default function TokenPalette({ groupedTokens, onDragStart, onDragEnd, onTokenClick }: TokenPaletteProps) {
  return (
    <div className="space-y-5">
      <Heading size="small" level="2">
        Byggeklosser
      </Heading>
      {SLOT_ORDER.map((slot) => (
        <section key={slot} className="space-y-2">
          <Label size="small">{SLOT_LABELS[slot]}</Label>
          <div className="flex flex-wrap gap-2">
            {groupedTokens[slot].map((token) => (
              <button
                key={token.id}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/token-id', token.id)
                  event.dataTransfer.effectAllowed = 'move'
                  onDragStart(token.id)
                }}
                onDragEnd={onDragEnd}
                onClick={() => onTokenClick(token.id)}
                className="rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-3 py-1 text-sm hover:border-[var(--ax-border-accent)] hover:bg-[var(--ax-bg-accent-soft)]"
                title="Dra til setningen eller klikk for å bruke"
              >
                {token.label}
              </button>
            ))}
          </div>
        </section>
      ))}
      <BodyShort size="small" textColor="subtle">
        Dra en kloss til riktig boks i setningen, eller klikk på klossen for å bruke den.
      </BodyShort>
    </div>
  )
}
