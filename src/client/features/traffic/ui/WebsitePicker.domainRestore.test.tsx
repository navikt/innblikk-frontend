import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { useState } from 'react'

vi.hoisted(() => {
  window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
})

import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import type { Website } from '../../../shared/types/chart.ts'

// Real website IDs for the front-page defaults (see DEFAULT_WEBSITE_ID in shared/lib/domain).
const PROD_DEFAULT_ID = '35abb2b7-3f97-42ce-931b-cf547d40d967' // www.nav.no
const DEV_DEFAULT_ID = 'c44a6db3-c974-4316-b433-214f87e80b4d' // www.ansatt.dev.nav.no

const REAL_WEBSITES = [
  { id: PROD_DEFAULT_ID, name: 'Nav.no - prod', domain: 'www.nav.no', teamId: 't1', createdAt: '2023-01-01T00:00:00Z' },
  { id: 'gaupe-id', name: 'Gaupe', domain: 'gaupe.nav.no', teamId: 't1', createdAt: '2023-01-01T00:00:00Z' },
  {
    id: 'innblikk-dev-id',
    name: 'Innblikk',
    domain: 'innblikk.ansatt.dev.nav.no',
    teamId: 't1',
    createdAt: '2026-04-20T00:00:00Z',
  },
  {
    id: DEV_DEFAULT_ID,
    name: 'Nav.no - dev',
    domain: 'www.ansatt.dev.nav.no',
    teamId: 't1',
    createdAt: '2023-01-01T00:00:00Z',
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
    // Default to the prod dataset; individual tests override for dev.
    window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'team-researchops-prod-01d6' }
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
      expect(getByTestId('selected-id').textContent).toBe(PROD_DEFAULT_ID)
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

  it('defaults to nav.no when there is no URL param and no stored selection', async () => {
    window.history.replaceState({}, '', '/trafikkanalyse')
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/trafikkanalyse']}>
        <Harness />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(getByTestId('selected-id').textContent).toBe(PROD_DEFAULT_ID)
    })
  })

  it('does not let the default override an explicit ?domain= param', async () => {
    window.history.replaceState({}, '', '/trafikkanalyse?domain=gaupe.nav.no')
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/trafikkanalyse?domain=gaupe.nav.no']}>
        <Harness />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(getByTestId('selected-id').textContent).toBe('gaupe-id')
    })
  })

  it('does not let the default override a stored (last-selected) website', async () => {
    window.history.replaceState({}, '', '/trafikkanalyse')
    localStorage.setItem(
      `umami_selected_website_${window.location.hostname.replace(/\./g, '_')}`,
      JSON.stringify({ data: REAL_WEBSITES[1], timestamp: Date.now() }), // gaupe
    )
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/trafikkanalyse']}>
        <Harness />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(getByTestId('selected-id').textContent).toBe('gaupe-id')
    })
  })

  it('defaults to the dev front page (www.ansatt.dev.nav.no) when querying the dev dataset', async () => {
    window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'team-researchops-dev-4396' }
    window.history.replaceState({}, '', '/trafikkanalyse')
    const { container, getByTestId } = render(
      <MemoryRouter initialEntries={['/trafikkanalyse']}>
        <Harness />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(getByTestId('selected-id').textContent).toBe(DEV_DEFAULT_ID)
    })
    // The dev default is a dev site — it must be revealed (showDevSites) so the selected
    // label actually renders in the combobox on a prod-classified host (e.g. localhost),
    // not silently filtered out of the options.
    await waitFor(() => {
      const selectedText = container.querySelector('.aksel-combobox__selected-options--no-bg')
      expect(selectedText?.textContent).toBe('Nav.no - dev')
    })
  })

  it('matches the default by stable website ID even if the domain changes', async () => {
    // The default site keeps its ID but its domain got renamed — ID match must still find it.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/api/bigquery/websites')
          ? Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  data: [
                    {
                      id: PROD_DEFAULT_ID,
                      name: 'Nav.no',
                      domain: 'renamed.example.no', // domain drifted, ID stable
                      teamId: 't1',
                      createdAt: '2023-01-01T00:00:00Z',
                    },
                  ],
                }),
            })
          : Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      ),
    )
    window.history.replaceState({}, '', '/trafikkanalyse')
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/trafikkanalyse']}>
        <Harness />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(getByTestId('selected-id').textContent).toBe(PROD_DEFAULT_ID)
    })
  })
})
