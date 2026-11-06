import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Popover } from '@navikt/ds-react'
import { PlusIcon } from '@navikt/aksel-icons'
import DescribedCombobox from '../../../../shared/ui/DescribedCombobox/DescribedCombobox.tsx'
import type { DescribedComboboxOption } from '../../../../shared/ui/DescribedCombobox/types.ts'
import './FilterTypePicker.css'

interface FilterTypePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: DescribedComboboxOption[]
  onSelect: (value: string) => void
  onRequestOptions: () => void
}

/** Nonmodal search-and-pick popover. The persistent trigger is its return-focus target. */
export default function FilterTypePicker({
  open,
  onOpenChange,
  options,
  onSelect,
  onRequestOptions,
}: FilterTypePickerProps) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)
  const popupId = useId()
  const dismissAndReturnFocus = () => {
    onOpenChange(false)
    trigger?.focus()
  }

  const leaveWithTab = (backwards: boolean) => {
    if (!trigger) return false
    // The popup is portaled, so explicitly resume the page's order at its trigger.
    // Do not trap focus or send it to the browser chrome at the portal's DOM position.
    const popup = document.getElementById(popupId)
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'),
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(':disabled') &&
        !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
        !popup?.contains(element) &&
        element.getClientRects().length > 0,
    )
    const next = backwards ? trigger : focusable[focusable.indexOf(trigger) + 1]
    onOpenChange(false)
    const focusTarget = next ?? trigger
    focusTarget.focus()
    // At the end of the page, allow native Tab to leave rather than trapping focus.
    return Boolean(next)
  }

  return (
    <>
      <Button
        ref={setTrigger}
        type="button"
        variant="tertiary"
        data-color="neutral"
        size="small"
        className="px-0"
        icon={<PlusIcon aria-hidden />}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={() => {
          onOpenChange(!open)
          if (!open) onRequestOptions()
        }}
      >
        Filter
      </Button>
      {open &&
        trigger &&
        createPortal(
          <Popover
            id={popupId}
            role="dialog"
            aria-label="Velg filter"
            open
            anchorEl={trigger}
            onClose={() => onOpenChange(false)}
            placement="bottom-start"
            strategy="fixed"
            style={{ width: 'min(32rem, calc(100vw - 24px))' }}
          >
            <div className="filter-type-picker__content">
              <DescribedCombobox
                label="Velg filter"
                description="Hendelsen må oppfylle alle filtrene du legger til."
                options={options}
                inlineList
                autoFocus
                onDismiss={dismissAndReturnFocus}
                onTab={leaveWithTab}
                onSelect={(value) => {
                  dismissAndReturnFocus()
                  onSelect(value)
                }}
              />
            </div>
          </Popover>,
          document.body,
        )}
    </>
  )
}
