import { ActionMenu, Button, Tooltip } from '@navikt/ds-react'
import { MenuElipsisVerticalIcon } from '@navikt/aksel-icons'
import { Link } from 'react-router-dom'

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
            icon={<MenuElipsisVerticalIcon fontSize="1.25rem" aria-hidden />}
            aria-label={`Flere valg for ${canvasName}`}
          />
        </ActionMenu.Trigger>
      </Tooltip>
      <ActionMenu.Content align="end">
        {items.map((item) =>
          item.href ? (
            <ActionMenu.Item key={item.label} as={Link} to={item.href} onClick={item.onClick}>
              {item.label}
            </ActionMenu.Item>
          ) : (
            <ActionMenu.Item key={item.label} onClick={item.onClick}>
              {item.label}
            </ActionMenu.Item>
          ),
        )}
      </ActionMenu.Content>
    </ActionMenu>
  )
}

export default CanvasActionMenu
