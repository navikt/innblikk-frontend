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
  it('shows the website UUID and unassigned ownership for active registrations', () => {
    render(<WebsiteRegistrationsTable websites={[website]} teams={[]} onEdit={vi.fn()} />)
    expect(screen.getByText(website.websiteId)).toBeInTheDocument()
    expect(screen.getByText('Ingen eier')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rediger Testnettside' })).toBeInTheDocument()
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
