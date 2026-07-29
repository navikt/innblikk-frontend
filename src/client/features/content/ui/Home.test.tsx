import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Home from './Home.tsx'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Home />
    </MemoryRouter>,
  )
}

describe('Home page', () => {
  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /forstå brukeradferd med innblikk/i })).toBeInTheDocument()
  })

  it('renders the url search form', () => {
    renderPage()
    expect(screen.getByRole('search', { name: '' })).toBeInTheDocument()
    expect(screen.getByLabelText(/lim inn url for å se webstatistikk/i)).toBeInTheDocument()
  })
})
