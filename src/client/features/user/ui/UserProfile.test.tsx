import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UserProfile from './UserProfile.tsx'
import { getFeatureFlag } from '../../../shared/lib/featureFlags.ts'

vi.mock('../../../shared/hooks/useIsReopsTeamMember.ts', () => ({
  useIsReopsTeamMember: () => ({ isReopsTeamMember: false }),
}))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ navIdent: 'T123456', name: 'Testbruker', email: 'test@example.com' }),
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('alfa settings', () => {
  it('offers only the filter selector as an alfa checkbox, separate from the beta builder', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserProfile />
      </MemoryRouter>,
    )
    await screen.findByText('Testbruker')
    const checkbox = screen.getByRole('checkbox', { name: /Aktiver ny filtervelger i grafbyggeren/ })
    expect(checkbox).not.toBeChecked()
    expect(document.querySelector('a[href="/grafbygger-alfa"]')).toBeNull()
    expect(document.querySelector('a[href="/grafbygger"]')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Grafbyggeren er i beta' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Grafbyggeren er i alfa' })).not.toBeInTheDocument()
    expect(checkbox.closest('#alpha')?.querySelector('[role="status"]')).toBeNull()
    expect(screen.getByText(/Søk etter filtre og se forklaringer og eksempler/)).toBeInTheDocument()
    expect(screen.getByText(/Det er ikke sikkert de kommer i beta eller blir en ferdig funksjon/)).toBeInTheDocument()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(getFeatureFlag('grafbygger_custom_filter_selector')).toBe(true)
    expect(document.querySelector('a[href="/grafbygger-alfa"]')).toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/backend/user-settings', expect.objectContaining({ method: 'PUT' }))

    await user.click(checkbox)
    expect(getFeatureFlag('grafbygger_custom_filter_selector')).toBe(false)
    expect(document.querySelector('a[href="/grafbygger-alfa"]')).toBeNull()
    expect(document.querySelector('a[href="/grafbygger"]')).toBeInTheDocument()
  })

  it('restores a previously saved alfa opt-in', async () => {
    localStorage.setItem('innblikk_feature_flags', JSON.stringify({ grafbygger_custom_filter_selector: true }))
    render(
      <MemoryRouter>
        <UserProfile />
      </MemoryRouter>,
    )
    await screen.findByText('Testbruker')
    expect(screen.getByRole('checkbox', { name: /Aktiver ny filtervelger i grafbyggeren/ })).toBeChecked()
    expect(document.querySelector('a[href="/grafbygger-alfa"]')).toBeNull()
  })
})
