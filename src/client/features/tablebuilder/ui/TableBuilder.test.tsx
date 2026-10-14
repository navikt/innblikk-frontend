import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebsiteNavigation } from '../../../shared/ui/theme/WebsiteNavigation.tsx'
import TableBuilder from './TableBuilder.tsx'

describe('TableBuilder report layout', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/tabellbygger')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([true, false])('uses the shared report layout with new navigation %s', async (newNavigation) => {
    localStorage.setItem('innblikk_feature_flags', JSON.stringify({ alpha_new_nav: newNavigation }))
    const page = <TableBuilder />
    render(<MemoryRouter>{newNavigation ? <WebsiteNavigation>{page}</WebsiteNavigation> : page}</MemoryRouter>)

    expect(screen.getByRole('heading', { level: 1, name: 'Tabellbygger' })).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Periode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Velg kolonner' })).toBeInTheDocument()

    await waitFor(() => expect(screen.getAllByRole('combobox', { name: 'Nettside' })).toHaveLength(1))
    if (newNavigation) {
      const topBar = screen.getByRole('banner', { name: 'Valgt nettside' })
      expect(within(topBar).getByRole('combobox', { name: 'Nettside' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Om Tabellbygger' })).toBeInTheDocument()
    } else {
      expect(screen.queryByRole('button', { name: 'Om Tabellbygger' })).not.toBeInTheDocument()
      expect(screen.getByText('Bygg en tabell med kolonnene du trenger')).toBeInTheDocument()
    }
  })
})
