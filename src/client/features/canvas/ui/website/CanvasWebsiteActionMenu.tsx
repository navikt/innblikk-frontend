import { ActionMenu, Button } from '@navikt/ds-react'
import type { MouseEvent } from 'react'
import {
  ArrowCirclepathIcon,
  BulletListIcon,
  FilesIcon,
  LineGraphIcon,
  PencilIcon,
  TrashIcon,
} from '@navikt/aksel-icons'

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
  onTriggerHoverChange?: (hovered: boolean) => void
  triggerClassName?: string
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
  onTriggerHoverChange,
  triggerClassName,
}: CanvasWebsiteActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <span
        className="-m-2 inline-flex p-2"
        onMouseDown={stopMouseDownPropagation}
        onMouseEnter={() => onTriggerHoverChange?.(true)}
        onMouseLeave={() => onTriggerHoverChange?.(false)}
        onFocus={() => onTriggerHoverChange?.(true)}
        onBlur={() => onTriggerHoverChange?.(false)}
      >
        <Button
          size="xsmall"
          variant="tertiary"
          className={triggerClassName}
          icon={<PencilIcon fontSize="0.875rem" />}
          onMouseDown={stopMouseDownPropagation}
          title="Flere valg"
          aria-label="Flere valg"
        />
      </span>
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRefresh}>
        <span className="inline-flex items-center gap-2">
          <ArrowCirclepathIcon fontSize="0.875rem" aria-hidden="true" />
          <span>Last inn på nytt</span>
        </span>
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicate} disabled={isEditingLocked}>
        <span className="inline-flex items-center gap-2">
          <FilesIcon fontSize="0.875rem" aria-hidden="true" />
          <span>Dupliser</span>
        </span>
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onEdit} disabled={isEditingLocked}>
        <span className="inline-flex items-center gap-2">
          <PencilIcon fontSize="0.875rem" aria-hidden="true" />
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
            <LineGraphIcon fontSize="0.875rem" aria-hidden="true" />
            <span>Visualisering</span>
          </span>
        </ActionMenu.Item>
      )}
      {showInsightOption && onToggleInsight && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onToggleInsight} disabled={insightDisabled}>
          <span className="inline-flex items-center gap-2">
            <LineGraphIcon fontSize="0.875rem" aria-hidden="true" />
            <span>{isInsightOpen ? 'Skjul innsikt' : 'Vis innsikt'}</span>
          </span>
        </ActionMenu.Item>
      )}
      {showTopListOption && onToggleTopList && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onToggleTopList}>
          <span className="inline-flex items-center gap-2">
            <BulletListIcon fontSize="0.875rem" aria-hidden="true" />
            <span>{isTopListEnabled ? 'Skjul toppliste' : 'Vis toppliste'}</span>
          </span>
        </ActionMenu.Item>
      )}
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRemove} disabled={isEditingLocked}>
        <span className="inline-flex items-center gap-2">
          <TrashIcon fontSize="0.875rem" aria-hidden="true" />
          <span>Fjern kort</span>
        </span>
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

export default CanvasWebsiteActionMenu
