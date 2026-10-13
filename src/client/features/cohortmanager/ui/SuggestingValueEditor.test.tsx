import { act, render, renderHook, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SuggestingValueEditor, countryFlagEmoji, toSuggestionOptions } from './SuggestingValueEditor.tsx'
import { columnValuesSuggestions } from '../hooks/useColumnValueSuggestions.ts'

vi.mock('../api/columnValuesApi.ts', () => ({
  fetchColumnValues: vi.fn(),
}))

import { fetchColumnValues } from '../api/columnValuesApi.ts'
import type { SuggestibleColumn } from '../api/columnValuesApi.ts'

describe('countryFlagEmoji', () => {
  it('maps an ISO alpha-2 code to its flag', () => {
    expect(countryFlagEmoji('NO')).toBe('🇳🇴')
  })

  it('returns empty string for non-codes', () => {
    expect(countryFlagEmoji('NOR')).toBe('')
    expect(countryFlagEmoji('')).toBe('')
  })
})

describe('toSuggestionOptions', () => {
  it('renders country values as flag + localized name + raw code (never emoji alone)', () => {
    const [opt] = toSuggestionOptions('country', ['no'])
    expect(opt.value).toBe('no')
    expect(opt.label).toContain('🇳🇴')
    expect(opt.label).toMatch(/\(NO\)$/)
    // nb-NO localized region name
    expect(opt.label).toContain('Norge')
  })

  it('excludes malformed country suggestions without crashing or dropping valid codes', () => {
    const options = toSuggestionOptions('country', ['/', '/soknad', '', 'NOR', 'unknown', '123', 'no', 'SE'])

    expect(options.map((option) => option.value)).toEqual(['no', 'SE'])
    expect(options[0].label).toContain('Norge')
    expect(options[1].label).toContain('Sverige')
  })

  it('renders language values as localized names while preserving the raw code', () => {
    const [opt] = toSuggestionOptions('language', ['nb-NO'])
    expect(opt.value).toBe('nb-NO')
    expect(opt.label).toMatch(/\(nb-NO\)$/)
    expect(opt.label).not.toBe('nb-NO')
  })

  it('passes other columns through as-is', () => {
    expect(toSuggestionOptions('browser', ['Chrome'])).toEqual([{ label: 'Chrome', value: 'Chrome' }])
  })
})

describe('SuggestingValueEditor', () => {
  beforeEach(() => {
    columnValuesSuggestions.clearColumnValuesCache()
    vi.mocked(fetchColumnValues).mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches suggestions on mount (field-pick), not on focus', async () => {
    vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['Chrome'], scannedDays: 30 })
    render(<SuggestingValueEditor websiteId="w1" column="browser" value="" onChange={() => {}} label="Verdi" />)
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalledTimes(1))
    expect(fetchColumnValues).toHaveBeenCalledWith('w1', 'browser', undefined, undefined)
  })

  it('keeps the country dropdown usable when its response contains malformed values', async () => {
    vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['/', '/soknad', 'no'], scannedDays: 30 })
    const onChange = vi.fn()
    render(<SuggestingValueEditor websiteId="w1" column="country" value="" onChange={onChange} label="Verdi" />)
    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })

    const countryOption = await screen.findByRole('option', { name: /Norge/ })
    expect(screen.queryByRole('option', { name: '/' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '/soknad' })).not.toBeInTheDocument()
    fireEvent.pointerUp(countryOption)
    expect(onChange).toHaveBeenCalledWith('no')
  })

  it('removes URL options from the open dropdown while country suggestions are loading', async () => {
    let resolveCountry!: (value: { values: string[]; scannedDays: number }) => void
    vi.mocked(fetchColumnValues)
      .mockResolvedValueOnce({ values: ['/soknad'], scannedDays: 30 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCountry = resolve
          }),
      )
    const onChange = vi.fn()
    const { rerender } = render(
      <SuggestingValueEditor websiteId="w1" column="url_path" value="" onChange={onChange} label="Verdi" />,
    )
    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    expect(await screen.findByRole('option', { name: '/soknad' })).toBeInTheDocument()

    rerender(<SuggestingValueEditor websiteId="w1" column="country" value="" onChange={onChange} label="Verdi" />)

    expect(screen.queryByRole('option', { name: '/soknad' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    await act(async () => {
      resolveCountry({ values: ['no'], scannedDays: 30 })
      await Promise.resolve()
    })
    expect(await screen.findByRole('option', { name: /Norge/ })).toBeInTheDocument()
    fireEvent.pointerUp(screen.getByRole('option', { name: /Norge/ }))
    expect(onChange).toHaveBeenCalledWith('no')
  })

  it.each([
    { websiteId: 'w2', column: 'event_data_value', suggestionKey: 'page', eventName: 'visit' },
    { websiteId: 'w1', column: 'country', suggestionKey: 'page', eventName: 'visit' },
    { websiteId: 'w1', column: 'event_data_value', suggestionKey: 'country', eventName: 'visit' },
    { websiteId: 'w1', column: 'event_data_value', suggestionKey: 'page', eventName: 'click' },
  ])('immediately clears suggestions when their scope changes to %j', async (next) => {
    vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['/soknad'], scannedDays: 7 })
    const { result, rerender } = renderHook(
      ({ websiteId, column, suggestionKey, eventName }) =>
        columnValuesSuggestions.useColumnValueSuggestions(websiteId, column, suggestionKey, eventName),
      {
        initialProps: {
          websiteId: 'w1',
          column: 'event_data_value' as SuggestibleColumn,
          suggestionKey: 'page',
          eventName: 'visit',
        },
      },
    )
    act(() => result.current.load())
    await waitFor(() => expect(result.current.values).toEqual(['/soknad']))

    rerender({ ...next, column: next.column as SuggestibleColumn })

    expect(result.current.values).toEqual([])
    expect(result.current.scannedDays).toBeNull()
    expect(result.current.failed).toBe(false)
  })

  it.each(['success', 'failure'])(
    'ignores an old request finishing with %s after switching fields',
    async (outcome) => {
      let resolveOld!: (value: { values: string[]; scannedDays: number }) => void
      let rejectOld!: (reason: Error) => void
      vi.mocked(fetchColumnValues)
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolveOld = resolve
              rejectOld = reject
            }),
        )
        .mockResolvedValueOnce({ values: ['no'], scannedDays: 30 })
      const { result, rerender } = renderHook(
        ({ column }) => columnValuesSuggestions.useColumnValueSuggestions('w1', column),
        { initialProps: { column: 'url_path' as SuggestibleColumn } },
      )
      act(() => result.current.load())
      rerender({ column: 'country' })
      act(() => result.current.load())
      await waitFor(() => expect(result.current.values).toEqual(['no']))

      await act(async () => {
        if (outcome === 'success') resolveOld({ values: ['/soknad'], scannedDays: 7 })
        else rejectOld(new Error('old request failed'))
        await Promise.resolve()
      })

      expect(result.current.values).toEqual(['no'])
      expect(result.current.scannedDays).toBe(30)
      expect(result.current.failed).toBe(false)
      expect(result.current.loading).toBe(false)
    },
  )

  it('shows «Forslag fra siste N dager» only when the server narrowed the window', async () => {
    vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['Chrome'], scannedDays: 7 })
    render(<SuggestingValueEditor websiteId="w1" column="browser" value="" onChange={() => {}} label="Verdi" />)
    await screen.findByText('Forslag fra siste 7 dager')
  })

  it('does not show the scanned-days note at the full 30-day window', async () => {
    vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['Chrome'], scannedDays: 30 })
    render(<SuggestingValueEditor websiteId="w1" column="browser" value="" onChange={() => {}} label="Verdi" />)
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalled())
    expect(screen.queryByText(/Forslag fra siste/)).toBeNull()
  })

  it('degrades to free text with an inline note when the fetch fails (never blocks input)', async () => {
    vi.mocked(fetchColumnValues).mockRejectedValue(new Error('too expensive'))
    render(<SuggestingValueEditor websiteId="w1" column="browser" value="" onChange={() => {}} label="Verdi" />)
    await screen.findByText('Kunne ikke hente forslag — du kan fortsatt skrive verdien manuelt')
    expect(screen.getByRole('combobox')).toBeEnabled()
  })

  it('does not fetch without a websiteId', async () => {
    render(<SuggestingValueEditor websiteId={undefined} column="browser" value="" onChange={() => {}} label="Verdi" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchColumnValues).not.toHaveBeenCalled()
  })

  // Blur-commit is deferred with setTimeout(0) so a mouse-click on a dropdown
  // option — real ordering: mousedown (input blurs) → pointerup (Aksel fires
  // onToggleSelected) → click → macrotasks — sets the justToggled flag before
  // our deferred commit runs, letting it bail instead of clobbering the pick
  // with the leftover typed text.
  describe('free-text blur commit vs. mouse-pick race', () => {
    const flushMacrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

    it('commits free text synchronously when focus moves to an action button', async () => {
      vi.mocked(fetchColumnValues).mockResolvedValue({ values: [], scannedDays: 30 })
      const onChange = vi.fn()
      render(
        <>
          <SuggestingValueEditor websiteId="w1" column="url_path" value="" onChange={onChange} label="Verdi" />
          <button type="button">Forhåndsvis gruppe</button>
        </>,
      )
      const input = await screen.findByRole('combobox')
      fireEvent.change(input, { target: { value: '/soknad' } })
      fireEvent.blur(input, {
        target: { value: '/soknad' },
        relatedTarget: screen.getByRole('button', { name: 'Forhåndsvis gruppe' }),
      })
      expect(onChange).toHaveBeenCalledExactlyOnceWith('/soknad')
    })

    it('commits leftover free text on a real blur (tab away)', async () => {
      vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['Chrome'], scannedDays: 30 })
      const onChange = vi.fn()
      render(<SuggestingValueEditor websiteId="w1" column="browser" value="" onChange={onChange} label="Verdi" />)
      const input = await screen.findByRole('combobox')

      fireEvent.change(input, { target: { value: 'Chro' } })
      fireEvent.blur(input, { target: { value: 'Chro' } })
      await flushMacrotask()

      expect(onChange).toHaveBeenCalledWith('Chro')
    })

    it('does NOT commit leftover text when the blur was a mouse-pick (toggle fired first)', async () => {
      vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['Chrome'], scannedDays: 30 })
      const onChange = vi.fn()
      render(<SuggestingValueEditor websiteId="w1" column="browser" value="" onChange={onChange} label="Verdi" />)
      const input = await screen.findByRole('combobox')
      await screen.findByText('Chrome')

      // Real mouse ordering: blur (mousedown) first, then the option's
      // pointerup fires onToggleSelected (Aksel selects on pointerup, not
      // click), THEN our setTimeout(0) commit runs.
      fireEvent.change(input, { target: { value: 'Chro' } })
      fireEvent.blur(input, { target: { value: 'Chro' } })
      fireEvent.pointerUp(screen.getByRole('option', { name: /Chrome/ }))
      await flushMacrotask()

      // The only onChange should be the pick itself, not the leftover 'Chro'.
      expect(onChange).toHaveBeenCalledWith('Chrome')
      expect(onChange).not.toHaveBeenCalledWith('Chro')
    })
  })
})
