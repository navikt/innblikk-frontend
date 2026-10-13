import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CohortPreview } from './CohortPreview.tsx'
import { fetchCohortPreview, type PreviewResult } from '../api/previewApi.ts'
import type { CohortNode } from '../../cohortmanager/model/types.ts'

vi.mock('../api/previewApi.ts', () => ({ fetchCohortPreview: vi.fn() }))
const root: CohortNode = {
  nodeType: 'GROUP',
  combinator: 'AND',
  negated: false,
  children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/' }],
}
const result: PreviewResult = {
  users: 120,
  total: 1000,
  coverage: { total: 1500, withDistinctId: 750 },
}

describe('CohortPreview', () => {
  beforeEach(() => {
    vi.mocked(fetchCohortPreview).mockReset().mockResolvedValue(result)
  })

  it('loads the last seven days on the first click and shows counts without detailed breakdowns', async () => {
    const user = userEvent.setup()
    let resolve!: (value: PreviewResult) => void
    vi.mocked(fetchCohortPreview).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    render(<CohortPreview websiteId="site-1" root={root} />)
    expect(fetchCohortPreview).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    expect(fetchCohortPreview).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Periode')).toHaveValue('last_7_days')
    expect(vi.mocked(fetchCohortPreview).mock.calls[0][1]?.aborted).toBe(false)
    expect(screen.getByText('Henter resultat…')).toBeInTheDocument()
    expect(screen.queryByText(/Viser brukere som passer/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tellemetode i forhåndsvisningen:/)).not.toBeInTheDocument()
    await act(async () => {
      resolve(result)
      await Promise.resolve()
    })
    expect(await screen.findByText('120 unike brukere')).toBeInTheDocument()
    expect(screen.getByText(/12.*% av nettstedets unike brukere/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Se mer om gruppen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('automatically previews the last seven days on opening but waits for updates after period changes', async () => {
    const user = userEvent.setup()
    render(<CohortPreview websiteId="site-1" root={root} defaultExpanded autoPreview />)
    expect(await screen.findByText('120 unike brukere')).toBeInTheDocument()
    expect(screen.getByLabelText('Periode')).toHaveValue('last_7_days')
    expect(fetchCohortPreview).toHaveBeenCalledTimes(1)
    await user.selectOptions(screen.getByLabelText('Periode'), 'last_28_days')
    expect(screen.queryByText('120 unike brukere')).not.toBeInTheDocument()
    expect(fetchCohortPreview).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Oppdater' }))
    expect(await screen.findByText('120 unike brukere')).toBeInTheDocument()
    expect(fetchCohortPreview).toHaveBeenCalledTimes(2)
  })

  it('aborts a pending preview when hidden and fetches again when reopened', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCohortPreview).mockImplementationOnce(() => new Promise(() => {}))
    render(<CohortPreview websiteId="site-1" root={root} />)
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    const signal = vi.mocked(fetchCohortPreview).mock.calls[0][1]
    await user.click(screen.getByRole('button', { name: 'Skjul' }))
    expect(signal?.aborted).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    expect(await screen.findByText('120 unike brukere')).toBeInTheDocument()
    expect(fetchCohortPreview).toHaveBeenCalledTimes(2)
  })

  it('hides stale results and ignores a late response after criteria change', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<CohortPreview websiteId="site-1" root={root} defaultExpanded />)
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    await screen.findByText('120 unike brukere')
    let resolve!: (value: PreviewResult) => void
    vi.mocked(fetchCohortPreview).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await user.click(screen.getByRole('button', { name: 'Oppdater' }))
    expect(screen.queryByText(/Tellemetode i forhåndsvisningen:/)).not.toBeInTheDocument()
    rerender(<CohortPreview websiteId="site-1" root={{ ...root, negated: true }} defaultExpanded />)
    expect(screen.queryByText('120 unike brukere')).not.toBeInTheDocument()
    await act(async () => {
      resolve({ ...result, users: 999 })
      await Promise.resolve()
    })
    expect(screen.queryByText('999 unike brukere')).not.toBeInTheDocument()
    expect(screen.queryByText(/Valgene er endret/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tellemetode i forhåndsvisningen:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Om tellemetoden i forhåndsvisningen' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Oppdater' }))
    expect(await screen.findByText('120 unike brukere')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Om tellemetoden i forhåndsvisningen' })).toBeInTheDocument()
  })

  it('hides the counting method after a period change until the result is refreshed', async () => {
    const user = userEvent.setup()
    render(<CohortPreview websiteId="site-1" root={root} defaultExpanded />)
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    await screen.findByRole('button', { name: 'Om tellemetoden i forhåndsvisningen' })
    await user.selectOptions(screen.getByLabelText('Periode'), 'last_28_days')
    expect(screen.queryByRole('button', { name: 'Om tellemetoden i forhåndsvisningen' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Valgene er endret/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Oppdater' }))
    expect(await screen.findByRole('button', { name: 'Om tellemetoden i forhåndsvisningen' })).toBeInTheDocument()
  })

  it('requires criteria but not a name and distinguishes errors from zero matches', async () => {
    const user = userEvent.setup()
    const onInvalid = vi.fn()
    const { rerender } = render(<CohortPreview websiteId="site-1" root={null} onInvalid={onInvalid} defaultExpanded />)
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    expect(onInvalid).toHaveBeenCalled()
    expect(fetchCohortPreview).not.toHaveBeenCalled()
    rerender(<CohortPreview websiteId="site-1" root={root} defaultExpanded />)
    vi.mocked(fetchCohortPreview).mockRejectedValueOnce(new Error('failed'))
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Kunne ikke forhåndsvise/)
    expect(screen.queryByText('0 unike brukere')).not.toBeInTheDocument()
    vi.mocked(fetchCohortPreview).mockResolvedValueOnce({ ...result, users: 0 })
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    expect(await screen.findByText('0 unike brukere')).toBeInTheDocument()
    expect(screen.getByText(/Ingen brukere passer/)).toBeInTheDocument()
  })

  it.each([
    [0, 'Fingeravtrykk', /Samme person er unik innen en måned/],
    [1500, 'Cookie', /Samme person kjennes igjen i opptil 90 dager/],
    [750, 'Cookie og fingeravtrykk', /Uten cookie brukes fingeravtrykk/],
  ])('shows counting method help for coverage %i', async (withDistinctId, label, description) => {
    const user = userEvent.setup()
    vi.mocked(fetchCohortPreview).mockResolvedValueOnce({ ...result, coverage: { total: 1500, withDistinctId } })
    render(<CohortPreview websiteId="site-1" root={root} defaultExpanded />)
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    const heading = await screen.findByRole('heading', { name: '120 unike brukere' })
    const help = screen.getByRole('button', { name: 'Om tellemetoden i forhåndsvisningen' })
    expect(heading.parentElement).toContainElement(help)
    expect(help).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /Hvordan telles/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tell besøkende med')).not.toBeInTheDocument()
    expect(screen.queryByText(/uten cookie/)).not.toBeInTheDocument()
    expect(fetchCohortPreview).toHaveBeenCalledWith(expect.objectContaining({ basis: 'auto' }), expect.any(AbortSignal))
    await user.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText(`Tellemetode i forhåndsvisningen: ${label}`)).toBeVisible()
    expect(await screen.findByText(description)).toBeVisible()
  })
})
