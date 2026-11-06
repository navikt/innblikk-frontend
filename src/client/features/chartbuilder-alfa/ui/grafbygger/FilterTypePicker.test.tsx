import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilterTypePicker from './FilterTypePicker.tsx'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <FilterTypePicker
        open={open}
        onOpenChange={setOpen}
        options={[{ value: 'url_path', label: 'Side (URL)', description: 'Adressen uten parametere' }]}
        onRequestOptions={() => {}}
        onSelect={() => {}}
      />
      <button>Etter filtervelgeren</button>
    </>
  )
}

describe('FilterTypePicker', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps its trigger in place and puts search and options in one nonmodal popover', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Filter' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Velg filter' })
    expect(dialog).not.toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('combobox')).toHaveFocus()
    expect(within(dialog).getByRole('listbox')).toBeVisible()
    expect(document.querySelectorAll('.aksel-popover')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Filter' })).toBe(trigger)
    expect(screen.queryByRole('button', { name: /Avbryt|Lukk filterlisten/ })).not.toBeInTheDocument()
  })

  it.each([false, true])('lets Tab leave the portaled popup in page order (backwards: %s)', async (backwards) => {
    // jsdom has no layout; give visible page controls a box for the focus-order check.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 100, 32),
    ] as unknown as DOMRectList)
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Filter' })
    await user.click(trigger)
    await user.tab({ shift: backwards })
    expect(screen.queryByRole('dialog', { name: 'Velg filter' })).not.toBeInTheDocument()
    expect(backwards ? trigger : screen.getByRole('button', { name: 'Etter filtervelgeren' })).toHaveFocus()
  })
})
