import { Switch } from '@navikt/ds-react'
import type { ReactNode } from 'react'

interface ToggleOptionProps {
  /** The switch label */
  label: string
  /** Optional description shown beneath the label */
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  /**
   * Content revealed when the toggle is on.
   * When omitted the component behaves as a plain binary switch with no panel.
   */
  children?: ReactNode
  /**
   * Keep children mounted in the DOM even when unchecked (hidden via CSS).
   * Useful when children own internal state that must survive toggling.
   */
  keepMounted?: boolean
  /**
   * Override the default indented/bordered panel styling (e.g. to match a
   * different panel style used elsewhere in the same section).
   */
  panelClassName?: string
  /**
   * Spacing classes (e.g. margin) for the wrapper around the panel.
   * Kept separate from `panelClassName` because that class may include an
   * entrance animation (`filter-card-animate-in`) whose keyframes end on
   * `margin-top: 0` — with `animation-fill-mode: both` that final value
   * overrides any margin-top utility placed on the same element. Applying
   * spacing to this outer, non-animated wrapper avoids the conflict.
   */
  panelWrapperClassName?: string
}

/**
 * A labelled Switch that optionally reveals an indented, bordered panel beneath
 * it when turned on. Use without `children` for a plain binary toggle.
 */
const ToggleOption = ({
  label,
  description,
  checked,
  onChange,
  children,
  keepMounted = false,
  panelClassName,
  panelWrapperClassName,
}: ToggleOptionProps) => {
  const hasPanel = children !== undefined
  const defaultPanelClassName = 'ml-6 my-4 p-4 flex flex-col gap-2 bg-[var(--ax-bg-default)] rounded-md border'

  return (
    <>
      <Switch size="small" description={description} checked={checked} onChange={(e) => onChange(e.target.checked)}>
        {label}
      </Switch>

      {hasPanel &&
        (keepMounted ? (
          <div className={checked ? (panelClassName ?? 'ml-6') : `${panelClassName ?? 'ml-6'} hidden`}>{children}</div>
        ) : (
          checked && (
            <div className={panelWrapperClassName}>
              <div className={panelClassName ?? defaultPanelClassName}>{children}</div>
            </div>
          )
        ))}
    </>
  )
}

export default ToggleOption
