/**
 * ActionFeedbackButton
 *
 * A button that performs an action and briefly shows a confirmation label —
 * inspired by Aksel's CopyButton. After clicking, the label and icon swap to
 * the "active" state for `activeDuration` ms, then revert.
 *
 * Usage:
 *   <ActionFeedbackButton
 *     label="Tilbakestill"
 *     activeLabel="Tilbakestilt!"
 *     onClick={handleReset}
 *   />
 */

import { forwardRef, useState } from 'react'
import { CheckmarkIcon, ArrowUndoIcon } from '@navikt/aksel-icons'
import { Button } from '@navikt/ds-react'
import type { ButtonProps } from '@navikt/ds-react'

export interface ActionFeedbackButtonProps extends Omit<ButtonProps, 'children' | 'onClick'> {
  /** Label shown in the default (idle) state. */
  label: string
  /** Label shown briefly after the action fires. @default `${label}!` */
  activeLabel?: string
  /** Icon shown in idle state. @default <ArrowUndoIcon /> */
  icon?: React.ReactNode
  /** Icon shown in active state. @default <CheckmarkIcon /> */
  activeIcon?: React.ReactNode
  /** How long (ms) to stay in the active state. @default 2000 */
  activeDuration?: number
  /** Button size. @default "small" */
  size?: ButtonProps['size']
  /** Called when the button is clicked (before the active state is shown). */
  onClick?: () => void
  /** Extra className forwarded to the underlying Button. */
  className?: string
}

const ActionFeedbackButton = forwardRef<HTMLButtonElement, ActionFeedbackButtonProps>(
  (
    { label, activeLabel, icon, activeIcon, activeDuration = 2000, size = 'small', onClick, className, ...rest },
    ref,
  ) => {
    const [active, setActive] = useState(false)

    const handleClick = () => {
      onClick?.()
      setActive(true)
      setTimeout(() => setActive(false), activeDuration)
    }

    return (
      <Button
        ref={ref}
        type="button"
        variant="tertiary-neutral"
        size={size}
        icon={active ? (activeIcon ?? <CheckmarkIcon aria-hidden />) : (icon ?? <ArrowUndoIcon aria-hidden />)}
        iconPosition="left"
        data-active={active}
        className={className}
        onClick={handleClick}
        {...rest}
      >
        {active ? (activeLabel ?? `${label}!`) : label}
      </Button>
    )
  },
)

ActionFeedbackButton.displayName = 'ActionFeedbackButton'

export default ActionFeedbackButton
