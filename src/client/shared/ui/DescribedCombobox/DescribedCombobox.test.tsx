import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DescribedCombobox from './DescribedCombobox.tsx'

const options = [
  { value: 'path', label: 'Side (URL)', description: 'Adressen uten parametere' },
  { value: 'query', label: 'Parameter (URL)', description: 'Det som står etter spørsmålstegnet' },
  { value: 'browser', label: 'Nettleser', description: 'Chrome eller Safari' },
]
const select = vi.fn()

describe('DescribedCombobox', () => {
  beforeEach(() => select.mockReset())

  it('renders visual URL anatomy without adding URL noise to the accessible option name', async () => {
    const user = userEvent.setup()
    render(
      <DescribedCombobox
        label="Velg filter"
        options={[
          {
            ...options[0],
            example: { url: 'https://nav.no/sok?tema=jobb', highlight: '/sok' },
          },
        ]}
        onSelect={select}
      />,
    )
    await user.click(screen.getByRole('combobox'))
    const option = screen.getByRole('option', { name: 'Side (URL) – Adressen uten parametere' })
    const example = option.querySelector('code')
    expect(example).toHaveAttribute('aria-hidden', 'true')
    expect(example).toHaveTextContent('https://nav.no/sok?tema=jobb')
    expect(within(option).getByText('/sok', { selector: 'mark' })).toBeVisible()
    expect(option).not.toHaveAccessibleName(/https|nav\.no|tema=jobb/)
  })

  it('renders bold names and separate descriptions, with both in the accessible option name', async () => {
    const user = userEvent.setup()
    render(<DescribedCombobox label="Velg filter" options={options} onSelect={select} />)
    await user.click(screen.getByRole('combobox', { name: 'Velg filter' }))
    const option = screen.getByRole('option', { name: 'Side (URL) – Adressen uten parametere' })
    expect(within(option).getByText('Side (URL)', { selector: 'strong' })).toBeVisible()
    expect(within(option).getByText('Adressen uten parametere')).toHaveClass('option-explanation__description')
  })

  it('searches descriptions as well as names and selects by pointer without moving focus off the input', async () => {
    const user = userEvent.setup()
    render(<DescribedCombobox label="Velg filter" options={options} onSelect={select} />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'safari')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.click(screen.getByRole('option', { name: /Nettleser/ }))
    expect(select).toHaveBeenCalledExactlyOnceWith('browser')
    expect(input).toHaveFocus()
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('keeps keyboard focus on the input while navigating and selects with Enter', async () => {
    const user = userEvent.setup()
    render(<DescribedCombobox label="Velg filter" options={options} onSelect={select} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.keyboard('{ArrowDown}')
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)).toHaveTextContent('Side (URL)')
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveFocus()
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)).toHaveTextContent('Parameter (URL)')
    await user.keyboard('{Enter}')
    expect(select).toHaveBeenCalledExactlyOnceWith('query')
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('supports Home, End and page navigation without changing native text editing when no option is active', async () => {
    const user = userEvent.setup()
    render(<DescribedCombobox label="Velg filter" options={options} onSelect={select} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.keyboard('{ArrowDown}{End}')
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)).toHaveTextContent('Nettleser')
    await user.keyboard('{Home}')
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)).toHaveTextContent('Side (URL)')
    await user.keyboard('{PageDown}{PageUp}')
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)).toHaveTextContent('Side (URL)')
    await user.type(input, 'Side')
    await user.keyboard('{Home}')
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('closes and clears the search on Escape, then reopens by input click or toggle', async () => {
    const user = userEvent.setup()
    render(<DescribedCombobox label="Velg filter" options={options} onSelect={select} />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'Side')
    await user.keyboard('{Escape}')
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Lukk filterlisten' }))
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: 'Åpne filterlisten' }))
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveFocus()
    expect(select).not.toHaveBeenCalled()
  })

  it('announces no matches and lets Tab leave without selecting or trapping focus', async () => {
    const user = userEvent.setup()
    render(
      <>
        <DescribedCombobox label="Velg filter" options={options} onSelect={select} />
        <button>Etter</button>
      </>,
    )
    const input = screen.getByRole('combobox')
    await user.type(input, 'xyz')
    expect(screen.getByRole('status')).toHaveTextContent('Ingen filtre funnet')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(select).not.toHaveBeenCalled()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Etter' })).toHaveFocus()
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not select during IME composition or leave a dangling active descendant when options change', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<DescribedCombobox label="Velg filter" options={options} onSelect={select} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.keyboard('{ArrowDown}')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(select).not.toHaveBeenCalled()
    rerender(<DescribedCombobox label="Velg filter" options={options.slice(1)} onSelect={select} />)
    expect(input).not.toHaveAttribute('aria-activedescendant')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(select).toHaveBeenCalledExactlyOnceWith('query')
  })
})
