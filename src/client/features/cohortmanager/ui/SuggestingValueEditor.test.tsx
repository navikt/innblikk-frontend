import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SuggestingValueEditor, countryFlagEmoji, toSuggestionOptions } from './SuggestingValueEditor.tsx'
import { columnValuesSuggestions } from '../hooks/useColumnValueSuggestions.ts'

vi.mock('../api/columnValuesApi.ts', () => ({
  fetchColumnValues: vi.fn(),
}))

import { fetchColumnValues } from '../api/columnValuesApi.ts'

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
