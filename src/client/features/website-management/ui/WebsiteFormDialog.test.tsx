import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WebsiteFormDialog } from './WebsiteFormDialog.tsx'

const teams = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Team Eksempel' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Team Annet' },
]

function renderDialog(props: Partial<React.ComponentProps<typeof WebsiteFormDialog>> = {}) {
  const onSubmit = vi.fn((_input: unknown) => Promise.resolve())
  const onClose = vi.fn()
  render(<WebsiteFormDialog open website={null} teams={teams} onSubmit={onSubmit} onClose={onClose} {...props} />)
  return { onSubmit, onClose }
}

describe('WebsiteFormDialog', () => {
  it('requires a name before submitting', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/Hoveddomene/), 'minside.nav.no')
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))

    expect(await screen.findByText('Navn må fylles ut')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('normalizes and validates the domain', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/Navn på nettsiden/), 'Min side')
    await user.type(screen.getByLabelText(/Hoveddomene/), 'ikke et domene!!')
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))

    expect(await screen.findByText(/Ugyldig domene/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits normalized values for the selected team', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/Navn på nettsiden/), '  Min side  ')
    await user.type(screen.getByLabelText(/Hoveddomene/), 'https://minside.nav.no/some/path')
    await user.selectOptions(screen.getByLabelText(/Team som eier nettsiden/), teams[1].id)
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Min side',
      domain: 'minside.nav.no',
      ownerTeamId: teams[1].id,
    })
  })

  it('shows the service error when the submit fails', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(() => Promise.reject(new Error('Domenet er allerede registrert')))
    render(<WebsiteFormDialog open website={null} teams={teams} onSubmit={onSubmit} onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Navn på nettsiden/), 'Min side')
    await user.type(screen.getByLabelText(/Hoveddomene/), 'minside.nav.no')
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Domenet er allerede registrert')
  })

  it('accepts a UUID owner in admin mode, and rejects non-UUIDs', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ adminMode: true })
    const adminOwner = '33333333-3333-4333-8333-333333333333'

    await user.type(screen.getByLabelText(/Navn på nettsiden/), 'Eldre registrering')
    await user.type(screen.getByLabelText(/Hoveddomene/), 'gammel.nav.no')
    const ownerField = screen.getByLabelText(/Eier \(team-ID i Teamkatalogen\)/)
    await user.type(ownerField, 'ikke-en-uuid')
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))
    expect(await screen.findByText(/Må være en gyldig team-ID/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.clear(ownerField)
    await user.type(ownerField, adminOwner)
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Eldre registrering',
      domain: 'gammel.nav.no',
      ownerTeamId: adminOwner,
    })
  })
})
