import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader.tsx'

const description = 'Se besok over tid, hvor de kommer fra og hvor de gar videre.'

describe('PageHeader', () => {
  it.each(['Brukergrupper', 'Sidegrupper'])('preserves the beta badge beside the compact %s heading', (title) => {
    render(<PageHeader title={title} description={description} compact beta />)

    const heading = screen.getByRole('heading', { level: 1, name: title })
    expect(heading.parentElement).toContainElement(screen.getByText('Beta'))
    expect(screen.getByRole('button', { name: `Om ${title}` })).toHaveAttribute('aria-expanded', 'false')
  })

  it('offers the compact description through an accessible help button', () => {
    render(<PageHeader title="Trafikkoversikt" description={description} compact />)

    expect(screen.getByRole('heading', { level: 1, name: 'Trafikkoversikt' })).toBeInTheDocument()
    const help = screen.getByRole('button', { name: 'Om Trafikkoversikt' })
    expect(help).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(help)

    expect(help).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(description)).toBeInTheDocument()

    fireEvent.click(help)

    expect(help).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps descriptions visible in the regular header', () => {
    render(<PageHeader title="Trafikkoversikt" description={description} />)

    expect(screen.getByText(description)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Om Trafikkoversikt' })).not.toBeInTheDocument()
  })

  it('keeps article descriptions visible even when compact is requested', () => {
    render(<PageHeader title="Kom i gang" description={description} variant="article" compact />)

    expect(screen.getByText(description)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Om Kom i gang' })).not.toBeInTheDocument()
  })
})
