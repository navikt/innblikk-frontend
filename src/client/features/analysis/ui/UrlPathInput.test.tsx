import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UrlPathInput from './UrlPathInput.tsx'
import { fetchColumnValues } from '../../cohortmanager/api/columnValuesApi.ts'
import { columnValuesSuggestions } from '../../cohortmanager/hooks/useColumnValueSuggestions.ts'

vi.mock('../../cohortmanager/api/columnValuesApi.ts', () => ({ fetchColumnValues: vi.fn() }))

const commit = vi.fn()

function Harness({ websiteId = 'site-one' }: { websiteId?: string }) {
  const [value, setValue] = useState('')
  return (
    <>
      <UrlPathInput websiteId={websiteId} value={value} onChange={setValue} onCommit={commit} />
      <output data-testid="value">{value}</output>
      <button>Vis rapport</button>
    </>
  )
}

describe('UrlPathInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    columnValuesSuggestions.clearColumnValuesCache()
    vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['/arbeid', '/helse'], scannedDays: 30 })
  })

  it('commits the clicked path without losing it or committing the search prefix', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByRole('combobox', { name: 'URL' }), '/arb')
    await user.click(await screen.findByRole('option', { name: '/arbeid', exact: true }))
    expect(screen.getByTestId('value')).toHaveTextContent(/^\/arbeid$/)
    expect(commit).toHaveBeenCalledWith('/arbeid')
    expect(commit).not.toHaveBeenCalledWith('/arb')
  })

  it('preserves full URLs and queries on blur even if suggestions fail', async () => {
    vi.mocked(fetchColumnValues).mockRejectedValue(new Error('Unavailable'))
    const user = userEvent.setup()
    render(<Harness />)
    const url = 'https://www.nav.no/arbeid?lang=nb'
    await user.type(screen.getByRole('combobox', { name: 'URL' }), url)
    await user.click(screen.getByRole('button', { name: 'Vis rapport' }))
    expect(commit).toHaveBeenLastCalledWith(url)
    expect(screen.getByTestId('value')).toHaveTextContent(url)
  })

  it('selects a suggestion by keyboard and allows the selected URL to be cleared', async () => {
    const user = userEvent.setup()
    const submit = vi.fn()
    render(
      <div onKeyDown={submit}>
        <Harness />
      </div>,
    )
    const input = screen.getByRole('combobox', { name: 'URL' })
    await user.type(input, '/arb')
    await screen.findByRole('option', { name: '/arbeid', exact: true })
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)).toHaveTextContent('/arbeid')
    submit.mockClear()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('value')).toHaveTextContent(/^\/arbeid$/)
    expect(submit).not.toHaveBeenCalled()
    await user.click(input)
    await user.keyboard('{Backspace}')
    await user.click(screen.getByRole('button', { name: 'Vis rapport' }))
    expect(screen.getByTestId('value')).toBeEmptyDOMElement()
    expect(commit).toHaveBeenLastCalledWith('')
  })

  it('loads new suggestions when the website changes', async () => {
    const { rerender } = render(<Harness />)
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalledWith('site-one', 'url_path', undefined, undefined))
    rerender(<Harness websiteId="site-two" />)
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalledWith('site-two', 'url_path', undefined, undefined))
  })
})
