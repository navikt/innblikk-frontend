import { ActionMenu, Button, Tooltip } from '@navikt/ds-react'
import { MoreVertical } from 'lucide-react'

export type CanvasActionMenuItem = {
  label: string
  onClick?: () => void
  href?: string
}

type CanvasActionMenuProps = {
  canvasName: string
  items: CanvasActionMenuItem[]
}

const CanvasActionMenu = ({ canvasName, items }: CanvasActionMenuProps) => {
  if (items.length === 0) return null

  return (
    <ActionMenu>
      <Tooltip content="Flere valg" describesChild>
        <ActionMenu.Trigger>
          <Button
            variant="tertiary"
            size="xsmall"
            icon={<MoreVertical aria-hidden />}
            aria-label={`Flere valg for ${canvasName}`}
          />
        </ActionMenu.Trigger>
      </Tooltip>
      <ActionMenu.Content align="end">
        {items.map((item) => (
          <ActionMenu.Item key={item.label} as={item.href ? 'a' : undefined} href={item.href} onClick={item.onClick}>
            {item.label}
          </ActionMenu.Item>
        ))}
      </ActionMenu.Content>
    </ActionMenu>
  )
}

export default CanvasActionMenu
