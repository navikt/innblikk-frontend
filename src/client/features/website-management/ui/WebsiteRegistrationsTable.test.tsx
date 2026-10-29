import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WebsiteRegistration } from '../../../shared/api/websiteManagementApi.ts'
import { WebsiteRegistrationsTable } from './WebsiteRegistrationsTable.tsx'

const website: WebsiteRegistration = {
  websiteId: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Testnettside',
  domain: 'test.nav.no',
  ownerTeamId: null,
  createdAt: '2026-10-22T10:00:00Z',
  updatedAt: '2026-10-22T10:00:00Z',
  deletedAt: null,
}

describe('WebsiteRegistrationsTable', () => {
  it('keeps the website UUID out of the name cell and shows it in the expandable details', () => {
    render(<WebsiteRegistrationsTable websites={[website]} teams={[]} onEdit={vi.fn()} />)
    expect(screen.getByText('Testnettside')).toBeInTheDocument()
    expect(screen.queryByText(website.websiteId)).not.toBeInTheDocument()
    expect(screen.getByText('Ingen eier')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rediger Testnettside' })).toBeInTheDocument()
  })

  it('shows the team name instead of the team UUID as owner', () => {
    const owned = { ...website, ownerTeamId: '11111111-1111-4111-8111-111111111111' }
    render(
      <WebsiteRegistrationsTable
        websites={[owned]}
        teams={[{ id: owned.ownerTeamId, name: 'Team ResearchOps' }]}
        onEdit={vi.fn()}
      />,
    )
    expect(screen.getByText('Team ResearchOps')).toBeInTheDocument()
    expect(screen.queryByText(owned.ownerTeamId)).not.toBeInTheDocument()
  })

  it('allows admins to hard-delete an already soft-deleted registration', () => {
    const deleted = { ...website, deletedAt: '2026-10-22T11:00:00Z' }
    const hardDelete = vi.fn()
    render(
      <WebsiteRegistrationsTable
        websites={[deleted]}
        teams={[]}
        onEdit={vi.fn()}
        onSoftDelete={vi.fn()}
        onHardDelete={hardDelete}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Rediger Testnettside' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deaktiver innsamling for Testnettside' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Slett registreringen for Testnettside permanent' }))
    expect(hardDelete).toHaveBeenCalledWith(deleted)
  })

  it('does not expose a hard-delete action on the self-service table', () => {
    render(<WebsiteRegistrationsTable websites={[website]} teams={[]} onEdit={vi.fn()} onSoftDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Slett registreringen/ })).not.toBeInTheDocument()
  })
})
