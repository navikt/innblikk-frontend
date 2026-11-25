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
  it('lets admins create with an explicit website ID', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ adminMode: true })

    await user.type(screen.getByLabelText(/Navn på nettsiden/), 'Gjenopprettet nettside')
    await user.type(screen.getByLabelText(/Hoveddomene/), 'gammel.nav.no')
    await user.type(screen.getByLabelText(/Nettside-ID/), '  123E4567-E89B-42D3-A456-426614174000  ')
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Gjenopprettet nettside',
        domain: 'gammel.nav.no',
        ownerTeamId: null,
        websiteId: '123e4567-e89b-42d3-a456-426614174000',
      }),
    )
  })

  it('rejects malformed custom IDs before submitting', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ adminMode: true })

    await user.type(screen.getByLabelText(/Navn på nettsiden/), 'Nettside')
    await user.type(screen.getByLabelText(/Hoveddomene/), 'side.nav.no')
    await user.type(screen.getByLabelText(/Nettside-ID/), 'not-a-uuid')
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))

    expect(await screen.findByText('Nettside-ID må være en gyldig UUID')).toBeInTheDocument()
    expect(screen.getByLabelText(/Nettside-ID/)).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('omits a whitespace-only custom ID so the server generates one', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ adminMode: true })

    await user.type(screen.getByLabelText(/Navn på nettsiden/), 'Nettside')
    await user.type(screen.getByLabelText(/Hoveddomene/), 'side.nav.no')
    await user.type(screen.getByLabelText(/Nettside-ID/), '   ')
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Nettside',
        domain: 'side.nav.no',
        ownerTeamId: null,
      }),
    )
  })

  it('hides custom IDs from self-service creation', () => {
    renderDialog()
    expect(screen.queryByLabelText(/Nettside-ID/)).not.toBeInTheDocument()
  })

  it('does not allow changing the ID when editing', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({
      adminMode: true,
      website: {
        websiteId: '123e4567-e89b-42d3-a456-426614174000',
        name: 'Nettside',
        domain: 'side.nav.no',
        ownerTeamId: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        deletedAt: null,
      },
    })

    expect(screen.queryByLabelText(/Nettside-ID/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lagre endringer' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Nettside',
        domain: 'side.nav.no',
        ownerTeamId: null,
      }),
    )
  })

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

  it('lets admins pick the owner team by name, and allows no owner', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ adminMode: true })

    await user.type(screen.getByLabelText(/Navn på nettsiden/), 'Eldre registrering')
    await user.type(screen.getByLabelText(/Hoveddomene/), 'gammel.nav.no')
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenLastCalledWith({
      name: 'Eldre registrering',
      domain: 'gammel.nav.no',
      ownerTeamId: null,
    })

    await user.type(screen.getByLabelText(/Eier \(team i Teamkatalogen\)/), 'Annet')
    await user.click(await screen.findByRole('option', { name: 'Team Annet' }))
    await user.click(screen.getByRole('button', { name: 'Registrer nettside' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit).toHaveBeenLastCalledWith({
      name: 'Eldre registrering',
      domain: 'gammel.nav.no',
      ownerTeamId: teams[1].id,
    })
  })
})
