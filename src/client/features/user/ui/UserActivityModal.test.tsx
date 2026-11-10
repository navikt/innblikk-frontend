import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserActivityModal from './UserActivityModal'

const activity = [
  { type: 'pageview', title: 'Kalkulator', url: '/aap/kalkulator', createdAt: '2026-10-01T10:00:00Z' },
  { type: 'event', name: 'navigere', title: 'Kalkulator', url: '/aap/kalkulator', createdAt: '2026-10-01T10:00:02Z' },
]

describe('shared visitor activity modal', () => {
  it('preserves profile details, activity counts and URL actions without marking normal profile activity', async () => {
    const user = userEvent.setup()
    const onOpenUrl = vi.fn()
    const onClose = vi.fn()
    render(
      <UserActivityModal
        open
        onClose={onClose}
        activity={activity}
        loading={false}
        details={<div>Profilens enhet og nettleser</div>}
        onOpenUrl={onOpenUrl}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Brukerdetaljer' })
    expect(screen.getByText('Profilens enhet og nettleser')).toBeInTheDocument()
    expect(screen.getByText('Sidevisninger')).toBeInTheDocument()
    expect(screen.getByText('Hendelser')).toBeInTheDocument()
    expect(screen.getByText('Totalt')).toBeInTheDocument()
    expect(dialog.querySelector('[data-highlighted]')).toBeNull()
    await user.click(screen.getAllByRole('button', { name: '/aap/kalkulator' })[0])
    expect(onOpenUrl).toHaveBeenCalledWith('/aap/kalkulator')
    await user.click(screen.getByRole('button', { name: 'Lukk' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('opens event details for normal profile activity without highlighted events', async () => {
    const user = userEvent.setup()
    render(
      <UserActivityModal
        open
        onClose={() => {}}
        activity={[activity[0], { ...activity[1], properties: [{ key: 'knapp', value: 'Neste' }], propertyCount: 2 }]}
        loading={false}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Hendelsesdetaljer' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Hendelsesdetaljer' }))
    expect(screen.getByRole('rowheader', { name: 'knapp' })).toBeVisible()
    expect(screen.getByRole('cell', { name: 'Neste' })).toBeVisible()
    expect(screen.getByText('Viser de første 1 av 2 egenskaper.')).toBeVisible()
  })

  it('shows loading and errors explicitly and offers a retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<UserActivityModal open onClose={() => {}} activity={[]} loading />)
    expect(screen.getByTitle('Henter aktivitetslogg')).toBeInTheDocument()
    rerender(
      <UserActivityModal
        open
        onClose={() => {}}
        activity={[]}
        loading={false}
        error="Kunne ikke hente aktivitet"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Kunne ikke hente aktivitet')
    await user.click(screen.getByRole('button', { name: 'Prøv igjen' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
