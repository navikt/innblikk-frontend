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
}

/**
 * A labelled Switch that optionally reveals an indented, bordered panel beneath
 * it when turned on. Use without `children` for a plain binary toggle.
 */
const ToggleOption = ({ label, description, checked, onChange, children, keepMounted = false }: ToggleOptionProps) => {
  const hasPanel = children !== undefined

  return (
    <>
      <Switch size="small" description={description} checked={checked} onChange={(e) => onChange(e.target.checked)}>
        {label}
      </Switch>

      {hasPanel &&
        (keepMounted ? (
          <div className={checked ? 'ml-6' : 'ml-6 hidden'}>{children}</div>
        ) : (
          checked && (
            <div className="ml-6 my-4 p-4 flex flex-col gap-2 bg-[var(--ax-bg-default)] rounded-md border">
              {children}
            </div>
          )
        ))}
    </>
  )
}

export default ToggleOption
