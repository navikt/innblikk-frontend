import {
  ClockIcon,
  FileTextIcon,
  PersonChatIcon,
  PersonGroupIcon,
  PresentationIcon,
  RecordIcon,
} from '@navikt/aksel-icons'
import { ActionMenu, Button } from '@navikt/ds-react'
type CanvasFacilitatorActionMenuProps = {
  onOpenTimer: () => void
  onOpenDotVoting: () => void
  onOpenShareView?: () => void
  onOpenPresentationView?: () => void
  isCanvasLocked?: boolean
  onToggleCanvasLock?: () => void
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
  onOpenShareView,
  onOpenPresentationView,
  isCanvasLocked = false,
  onToggleCanvasLock,
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
      <ActionMenu.Item onClick={onOpenTimer}>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <ClockIcon fontSize="0.875rem" />
          {timerLabel ? `Nedteller (${timerLabel})` : 'Nedteller'}
        </span>
      </ActionMenu.Item>
      <ActionMenu.Item onClick={onOpenDotVoting}>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <RecordIcon fontSize="0.875rem" />
          {dotVotingLabel ? `Prikkvotering (${dotVotingLabel})` : 'Prikkvotering'}
        </span>
      </ActionMenu.Item>
      {onToggleCanvasLock && (
        <ActionMenu.Item onClick={onToggleCanvasLock}>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <PersonGroupIcon aria-hidden fontSize="0.95rem" />
            {isCanvasLocked ? 'Aktiver samarbeidsmodus' : 'Deaktiver samarbeidsmodus'}
          </span>
        </ActionMenu.Item>
      )}
      {(onOpenShareView || onOpenPresentationView) && <ActionMenu.Divider />}
      {onOpenShareView && (
        <ActionMenu.Item onClick={onOpenShareView}>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <FileTextIcon fontSize="0.875rem" />
            Artikkelvisning
          </span>
        </ActionMenu.Item>
      )}
      {onOpenPresentationView && (
        <ActionMenu.Item onClick={onOpenPresentationView}>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <PresentationIcon fontSize="0.875rem" />
            Presentasjon
          </span>
        </ActionMenu.Item>
      )}
    </ActionMenu.Content>
  </ActionMenu>
)

export default CanvasFacilitatorActionMenu
