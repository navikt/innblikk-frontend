import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader.tsx'

describe('PageHeader beta badge', () => {
  it('keeps the existing Beta label by default', () => {
    render(<PageHeader title="Grafbyggeren" beta />)
    expect(screen.getByText('Beta', { exact: true })).toBeVisible()
  })

  it('supports a trial label without changing the page title', () => {
    render(<PageHeader title="Grafbyggeren" beta betaLabel="Alfa" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Grafbyggeren' })).toBeVisible()
    expect(screen.getByText('Alfa', { exact: true })).toBeVisible()
    expect(screen.queryByText('Beta', { exact: true })).not.toBeInTheDocument()
  })

  it('does not show a badge unless beta is enabled', () => {
    render(<PageHeader title="Grafbyggeren" betaLabel="Alfa" />)
    expect(screen.queryByText('Alfa', { exact: true })).not.toBeInTheDocument()
  })
})
