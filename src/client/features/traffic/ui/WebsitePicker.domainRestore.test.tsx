import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { useState } from 'react'

vi.hoisted(() => {
  window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
})

import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import type { Website } from '../../../shared/types/chart.ts'

const REAL_WEBSITES = [
  { id: 'www-nav-no-id', name: 'Nav.no - prod', domain: 'www.nav.no', teamId: 't1', createdAt: '2023-01-01T00:00:00Z' },
  { id: 'gaupe-id', name: 'Gaupe', domain: 'gaupe.nav.no', teamId: 't1', createdAt: '2023-01-01T00:00:00Z' },
  {
    id: 'innblikk-dev-id',
    name: 'Innblikk',
    domain: 'innblikk.ansatt.dev.nav.no',
    teamId: 't1',
    createdAt: '2026-04-20T00:00:00Z',
  },
]

// Harness that holds selection the way a real page does.
function Harness() {
  const [selected, setSelected] = useState<Website | null>(null)
  return (
    <div>
      <div data-testid="selected-id">{selected?.id ?? 'none'}</div>
      <WebsitePicker selectedWebsite={selected} onWebsiteChange={setSelected} disableAutoEvents />
    </div>
  )
}

describe('WebsitePicker domain restore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/bigquery/websites')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: REAL_WEBSITES }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('selects the website matching ?domain= after websites load (fresh visit, empty localStorage)', async () => {
    // WebsitePicker reads window.location.search directly (not the router), so set the real URL.
    window.history.replaceState({}, '', '/trafikkanalyse?domain=www.nav.no&urlPath=%2Fhelse')
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/trafikkanalyse?domain=www.nav.no&urlPath=%2Fhelse']}>
        <Harness />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(getByTestId('selected-id').textContent).toBe('www-nav-no-id')
    })
  })

  it('selects innblikk dev website for ?domain=innblikk.ansatt.dev.nav.no', async () => {
    window.history.replaceState({}, '', '/trafikkanalyse?domain=innblikk.ansatt.dev.nav.no&urlPath=%2Fgrafbygger')
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/trafikkanalyse?domain=innblikk.ansatt.dev.nav.no&urlPath=%2Fgrafbygger']}>
        <Harness />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(getByTestId('selected-id').textContent).toBe('innblikk-dev-id')
    })
  })

  it('shows the selected label inside the combobox (not just state)', async () => {
    window.history.replaceState({}, '', '/trafikkanalyse?domain=innblikk.ansatt.dev.nav.no&urlPath=%2Fgrafbygger')
    const { container, getByTestId } = render(
      <MemoryRouter initialEntries={['/trafikkanalyse?domain=innblikk.ansatt.dev.nav.no&urlPath=%2Fgrafbygger']}>
        <Harness />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(getByTestId('selected-id').textContent).toBe('innblikk-dev-id')
    })
    // The single-select combobox renders the selected option's label as visible text.
    await waitFor(() => {
      const selectedText = container.querySelector('.aksel-combobox__selected-options--no-bg')
      expect(selectedText?.textContent).toBe('Innblikk')
    })
  })
})
