import { ActionMenu, Button } from '@navikt/ds-react'
import { Plus } from 'lucide-react'

type CanvasAddActionMenuProps = {
  onAddWebsite: () => void
  onOpenGrafbygger: () => void
  onAddChart: () => void
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
}

const CanvasAddActionMenu = ({
  onAddWebsite,
  onOpenGrafbygger,
  onAddChart,
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
}: CanvasAddActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <div className="rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
        <Button size="xsmall" variant="tertiary" icon={<Plus size={14} />} className="rounded-full px-2">
          Legg til
        </Button>
      </div>
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Item onClick={onAddWebsite}>Nettside</ActionMenu.Item>
      <ActionMenu.Item onClick={onOpenGrafbygger}>Lag ny graf</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddChart}>Importer graf</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddDashboard}>Dashboard</ActionMenu.Item>
      <ActionMenu.Divider />
      <ActionMenu.Item onClick={onAddHeading}>Overskrift</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddText}>Tekst</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddSticky}>Post-it-lapp</ActionMenu.Item>
      <ActionMenu.Item onClick={onImportStickyCsv}>CSV-feedback (Post-it)</ActionMenu.Item>
      <ActionMenu.Divider />
      <ActionMenu.Item onClick={onAddImage}>Bilde</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddIcon}>Ikon</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddFigure}>Figur</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddDrawing}>Tegning</ActionMenu.Item>
      <ActionMenu.Item onClick={onAddIllustration}>Illustrasjoner</ActionMenu.Item>
      <ActionMenu.Divider />
      <ActionMenu.Item onClick={onAddTab}>Legg til fane</ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

export default CanvasAddActionMenu
