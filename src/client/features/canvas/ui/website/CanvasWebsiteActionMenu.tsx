import { ActionMenu, Button } from '@navikt/ds-react'
import { ChartNoAxesCombined, Copy, Edit2, List, MoreVertical, RefreshCw, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'

const stopMouseDownPropagation = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation()
}

type CanvasWebsiteActionMenuProps = {
  isInternalDashboard?: boolean
  showVisualizationOption?: boolean
  onOpenVisualization?: () => void
  showInsightOption?: boolean
  isInsightOpen?: boolean
  insightDisabled?: boolean
  onToggleInsight?: () => void
  showTopListOption?: boolean
  isTopListEnabled?: boolean
  onToggleTopList?: () => void
  onRefresh: () => void
  onDuplicate: () => void
  onEdit: () => void
  onRemove: () => void
  isEditingLocked?: boolean
}

const CanvasWebsiteActionMenu = ({
  isInternalDashboard,
  showVisualizationOption,
  onOpenVisualization,
  showInsightOption,
  isInsightOpen,
  insightDisabled,
  onToggleInsight,
  showTopListOption,
  isTopListEnabled,
  onToggleTopList,
  onRefresh,
  onDuplicate,
  onEdit,
  onRemove,
  isEditingLocked = false,
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
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRefresh}>
        <span className="inline-flex items-center gap-2">
          <RefreshCw size={14} aria-hidden="true" />
          <span>Last inn på nytt</span>
        </span>
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicate} disabled={isEditingLocked}>
        <span className="inline-flex items-center gap-2">
          <Copy size={14} aria-hidden="true" />
          <span>Dupliser</span>
        </span>
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onEdit} disabled={isEditingLocked}>
        <span className="inline-flex items-center gap-2">
          <Edit2 size={14} aria-hidden="true" />
          <span>{isInternalDashboard ? 'Rediger dashboard' : 'Rediger nettside'}</span>
        </span>
      </ActionMenu.Item>
      {showVisualizationOption && onOpenVisualization && (
        <ActionMenu.Item
          onMouseDown={stopMouseDownPropagation}
          onClick={onOpenVisualization}
          disabled={isEditingLocked}
        >
          <span className="inline-flex items-center gap-2">
            <ChartNoAxesCombined size={14} aria-hidden="true" />
            <span>Visualisering</span>
          </span>
        </ActionMenu.Item>
      )}
      {showInsightOption && onToggleInsight && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onToggleInsight} disabled={insightDisabled}>
          <span className="inline-flex items-center gap-2">
            <ChartNoAxesCombined size={14} aria-hidden="true" />
            <span>{isInsightOpen ? 'Skjul innsikt' : 'Vis innsikt'}</span>
          </span>
        </ActionMenu.Item>
      )}
      {showTopListOption && onToggleTopList && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onToggleTopList}>
          <span className="inline-flex items-center gap-2">
            <List size={14} aria-hidden="true" />
            <span>{isTopListEnabled ? 'Skjul toppliste' : 'Vis toppliste'}</span>
          </span>
        </ActionMenu.Item>
      )}
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRemove} disabled={isEditingLocked}>
        <span className="inline-flex items-center gap-2">
          <Trash2 size={14} aria-hidden="true" />
          <span>Fjern kort</span>
        </span>
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

export default CanvasWebsiteActionMenu
