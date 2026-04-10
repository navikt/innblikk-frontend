import { ActionMenu, Button } from '@navikt/ds-react'
import { Copy, Edit2, MoreVertical, RefreshCw, Trash2 } from 'lucide-react'

type CanvasWebsiteActionMenuProps = {
  isInternalDashboard?: boolean
  onRefresh: () => void
  onDuplicate: () => void
  onEdit: () => void
  onRemove: () => void
}

const CanvasWebsiteActionMenu = ({
  isInternalDashboard,
  onRefresh,
  onDuplicate,
  onEdit,
  onRemove,
}: CanvasWebsiteActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <Button
        size="xsmall"
        variant="tertiary"
        icon={<MoreVertical size={14} />}
        onMouseDown={(event) => event.stopPropagation()}
        title="Flere valg"
        aria-label="Flere valg"
      />
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Item onClick={onRefresh}>
        <span className="inline-flex items-center gap-2">
          <RefreshCw size={14} aria-hidden="true" />
          <span>Last inn på nytt</span>
        </span>
      </ActionMenu.Item>
      <ActionMenu.Item onClick={onDuplicate}>
        <span className="inline-flex items-center gap-2">
          <Copy size={14} aria-hidden="true" />
          <span>Dupliser</span>
        </span>
      </ActionMenu.Item>
      <ActionMenu.Item onClick={onEdit}>
        <span className="inline-flex items-center gap-2">
          <Edit2 size={14} aria-hidden="true" />
          <span>{isInternalDashboard ? 'Rediger dashboard' : 'Rediger nettside'}</span>
        </span>
      </ActionMenu.Item>
      <ActionMenu.Item onClick={onRemove}>
        <span className="inline-flex items-center gap-2">
          <Trash2 size={14} aria-hidden="true" />
          <span>Fjern kort</span>
        </span>
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

export default CanvasWebsiteActionMenu
