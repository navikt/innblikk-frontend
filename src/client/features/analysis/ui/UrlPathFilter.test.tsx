import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UrlPathFilter from './UrlPathFilter.tsx'
import { fetchColumnValues } from '../../cohortmanager/api/columnValuesApi.ts'
import { columnValuesSuggestions } from '../../cohortmanager/hooks/useColumnValueSuggestions.ts'

vi.mock('../../cohortmanager/api/columnValuesApi.ts', () => ({ fetchColumnValues: vi.fn() }))

const props = {
  urlPaths: [],
  onUrlPathsChange: vi.fn(),
  pathOperator: 'equals',
  onPathOperatorChange: vi.fn(),
  selectedWebsiteId: 'website-one',
}

describe('UrlPathFilter autocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    columnValuesSuggestions.clearColumnValuesCache()
    vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['/', '/arbeid', '/helse'], scannedDays: 30 })
  })

  it('suggests recorded paths and commits a clicked suggestion instead of the typed prefix', async () => {
    const user = userEvent.setup()
    render(<UrlPathFilter {...props} />, { wrapper: MemoryRouter })

    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalledWith('website-one', 'url_path', undefined, undefined))
    await user.type(screen.getByRole('combobox', { name: 'URL' }), '/arb')
    await user.click(await screen.findByRole('option', { name: /^\/arbeid$/ }))

    expect(props.onUrlPathsChange).toHaveBeenCalledWith(['/arbeid'])
    expect(props.onUrlPathsChange).not.toHaveBeenCalledWith(['/arb'])
  })

  it('keeps manual entry available when suggestions fail', async () => {
    vi.mocked(fetchColumnValues).mockRejectedValue(new Error('Unavailable'))
    const user = userEvent.setup()
    render(<UrlPathFilter {...props} />, { wrapper: MemoryRouter })

    await user.type(screen.getByRole('combobox', { name: 'URL' }), '/new-path')
    await user.keyboard('{Enter}')

    expect(props.onUrlPathsChange).toHaveBeenCalledWith(['/new-path'])
  })

  it('does not fetch when suggestions are disabled or no website is selected', () => {
    const { rerender } = render(<UrlPathFilter {...props} showSuggestions={false} />, { wrapper: MemoryRouter })
    rerender(<UrlPathFilter {...props} selectedWebsiteId={undefined} />)

    expect(fetchColumnValues).not.toHaveBeenCalled()
  })
})
