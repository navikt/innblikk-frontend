import { PersonChatIcon } from '@navikt/aksel-icons'
import { ActionMenu, Button } from '@navikt/ds-react'

type CanvasFacilitatorActionMenuProps = {
  onOpenTimer: () => void
  onOpenDotVoting: () => void
  timerLabel: string | null
  dotVotingLabel: string | null
  disabled?: boolean
  buttonSize?: 'small' | 'xsmall'
  buttonVariant?: 'secondary' | 'tertiary'
  buttonLabel?: string
  buttonClassName?: string
  iconSize?: number
  withFloatingFrame?: boolean
}

const CanvasFacilitatorActionMenu = ({
  onOpenTimer,
  onOpenDotVoting,
  timerLabel,
  dotVotingLabel,
  disabled = false,
  buttonSize = 'xsmall',
  buttonVariant = 'secondary',
  buttonLabel = 'Fasilitator',
  buttonClassName = '',
  iconSize = 16,
  withFloatingFrame = true,
}: CanvasFacilitatorActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      {withFloatingFrame ? (
        <div className="rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
          <Button
            size={buttonSize}
            variant={buttonVariant}
            icon={<PersonChatIcon fontSize={iconSize} aria-hidden="true" />}
            className={buttonClassName}
            disabled={disabled}
          >
            {buttonLabel}
          </Button>
        </div>
      ) : (
        <Button
          size={buttonSize}
          variant={buttonVariant}
          icon={<PersonChatIcon fontSize={iconSize} aria-hidden="true" />}
          className={buttonClassName}
          disabled={disabled}
        >
          {buttonLabel}
        </Button>
      )}
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Item onClick={onOpenTimer}>{timerLabel ? `Nedteller (${timerLabel})` : 'Nedteller'}</ActionMenu.Item>
      <ActionMenu.Item onClick={onOpenDotVoting}>
        {dotVotingLabel ? `Prikkvotering (${dotVotingLabel})` : 'Prikkvotering'}
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

export default CanvasFacilitatorActionMenu
