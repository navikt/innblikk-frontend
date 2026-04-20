import { ActionMenu, Button } from '@navikt/ds-react'
import { Plus } from 'lucide-react'

type CanvasAddActionMenuProps = {
  onAddWebsite: () => void
  onOpenGrafbygger: () => void
  onAddDashboard: () => void
  onAddSqlEditor: () => void
  onAddHeading: () => void
  onAddText: () => void
  onAddTable: () => void
  onAddLink: () => void
  onAddSticky: () => void
  onAddCodeBlock: () => void
  onAddSection: () => void
  onImportStickyCsv: () => void
  onAddImage: () => void
  onAddIcon: () => void
  onAddFigure: () => void
  onAddDrawing: () => void
  onAddIllustration: () => void
  onAddTab: () => void
  onOpenDotVoting: () => void
  disabled?: boolean
  buttonSize?: 'small' | 'xsmall'
  buttonVariant?: 'primary' | 'tertiary'
  buttonLabel?: string
  buttonClassName?: string
  iconSize?: number
  withFloatingFrame?: boolean
}

type MenuItemConfig = {
  label: string
  onClick: () => void
}

const CanvasAddActionMenu = ({
  onAddWebsite,
  onOpenGrafbygger,
  onAddDashboard,
  onAddSqlEditor,
  onAddHeading,
  onAddText,
  onAddTable,
  onAddLink,
  onAddSticky,
  onAddCodeBlock,
  onAddSection,
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
}: CanvasAddActionMenuProps) => {
  const textItems: MenuItemConfig[] = [
    { label: 'Overskrift', onClick: onAddHeading },
    { label: 'Tekst', onClick: onAddText },
    { label: 'Tabell', onClick: onAddTable },
    { label: 'Lenke', onClick: onAddLink },
    { label: 'Post-it-lapp', onClick: onAddSticky },
    { label: 'Kodeblokk', onClick: onAddCodeBlock },
  ]

  const visualItems: MenuItemConfig[] = [
    { label: 'Bilde', onClick: onAddImage },
    { label: 'Ikon', onClick: onAddIcon },
    { label: 'Figur', onClick: onAddFigure },
    { label: 'Tegning', onClick: onAddDrawing },
    { label: 'Illustrasjoner', onClick: onAddIllustration },
  ]

  const innblikkItems: MenuItemConfig[] = [
    { label: 'Nettside', onClick: onAddWebsite },
    { label: 'Graf', onClick: onOpenGrafbygger },
    { label: 'SQL-editor', onClick: onAddSqlEditor },
    { label: 'Dashboard', onClick: onAddDashboard },
  ]

  const layoutItems: MenuItemConfig[] = [
    { label: 'Seksjon', onClick: onAddSection },
    { label: 'Fane', onClick: onAddTab },
  ]

  return (
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
        {layoutItems.map(({ label, onClick }) => (
          <ActionMenu.Item key={label} onClick={onClick}>
            {label}
          </ActionMenu.Item>
        ))}
        <ActionMenu.Divider />
        {textItems.map(({ label, onClick }) => (
          <ActionMenu.Item key={label} onClick={onClick}>
            {label}
          </ActionMenu.Item>
        ))}
        <ActionMenu.Divider />
        {visualItems.map(({ label, onClick }) => (
          <ActionMenu.Item key={label} onClick={onClick}>
            {label}
          </ActionMenu.Item>
        ))}
        <ActionMenu.Divider />
        <ActionMenu.Group label="Fra Innblikk" className="mt-1">
          {innblikkItems.map(({ label, onClick }) => (
            <ActionMenu.Item key={label} onClick={onClick}>
              <span className="block pl-4">{label}</span>
            </ActionMenu.Item>
          ))}
        </ActionMenu.Group>
        <ActionMenu.Group label="Fra Skyra / Lumi" className="mt-1">
          <ActionMenu.Item onClick={onImportStickyCsv}>
            <span className="block pl-4">Undersøkelse → lapper</span>
          </ActionMenu.Item>
        </ActionMenu.Group>
      </ActionMenu.Content>
    </ActionMenu>
  )
}

export default CanvasAddActionMenu
