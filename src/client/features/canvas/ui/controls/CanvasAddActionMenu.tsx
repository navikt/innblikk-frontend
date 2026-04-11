import { ActionMenu, Button } from '@navikt/ds-react'
import { Plus } from 'lucide-react'

type CanvasAddActionMenuProps = {
  onAddWebsite: () => void
  onOpenGrafbygger: () => void
  onAddDashboard: () => void
  onAddHeading: () => void
  onAddText: () => void
  onAddSticky: () => void
  onImportStickyCsv: () => void
  onAddImage: () => void
  onAddIcon: () => void
  onAddFigure: () => void
  onAddDrawing: () => void
  onAddIllustration: () => void
  onAddTab: () => void
  disabled?: boolean
  buttonSize?: 'small' | 'xsmall'
  buttonVariant?: 'primary' | 'tertiary'
  buttonLabel?: string
  buttonClassName?: string
  iconSize?: number
  withFloatingFrame?: boolean
}

const CanvasAddActionMenu = ({
  onAddWebsite,
  onOpenGrafbygger,
  onAddDashboard,
  onAddHeading,
  onAddText,
  onAddSticky,
  onImportStickyCsv,
  onAddImage,
  onAddIcon,
  onAddFigure,
  onAddDrawing,
  onAddIllustration,
  onAddTab,
  disabled = false,
  buttonSize = 'xsmall',
  buttonVariant = 'tertiary',
  buttonLabel = 'Legg til',
  buttonClassName = '',
  iconSize = 14,
  withFloatingFrame = true,
}: CanvasAddActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      {withFloatingFrame ? (
        <div className="rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
          <Button
            size={buttonSize}
            variant={buttonVariant}
            icon={<Plus size={iconSize} />}
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
          icon={<Plus size={iconSize} />}
          className={buttonClassName}
          disabled={disabled}
        >
          {buttonLabel}
        </Button>
      )}
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Item onClick={onAddHeading}>Overskrift</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddText}>Tekst</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddSticky}>Post-it-lapp</ActionMenu.Item>
      <ActionMenu.Divider />
      <ActionMenu.Item onClick={onAddImage}>Bilde</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddIcon}>Ikon</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddFigure}>Figur</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddDrawing}>Tegning</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddIllustration}>Illustrasjoner</ActionMenu.Item>
      <ActionMenu.Divider />
      <ActionMenu.Item onClick={onAddWebsite}>Nettside · Umami</ActionMenu.Item>
      <ActionMenu.Item onClick={onOpenGrafbygger}>Graf · Umami</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddDashboard}>Dashboard · Innblikk</ActionMenu.Item>
      <ActionMenu.Item onClick={onImportStickyCsv}>Undersøkelse · Skyra / Lumi</ActionMenu.Item>
      <ActionMenu.Divider />
      <ActionMenu.Item onClick={onAddTab}>Fane</ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

export default CanvasAddActionMenu
