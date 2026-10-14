import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { WebsiteNavigation, WebsiteNavigationSlot } from './WebsiteNavigation.tsx'

function Page() {
  const [website, setWebsite] = useState('nav')

  return (
    <main>
      <WebsiteNavigationSlot>
        <label>
          Nettside
          <select value={website} onChange={(event) => setWebsite(event.target.value)}>
            <option value="nav">Nav.no</option>
            <option value="fia">Fia</option>
          </select>
        </label>
      </WebsiteNavigationSlot>
      <p>Valgt: {website}</p>
    </main>
  )
}

describe('WebsiteNavigation', () => {
  it('moves the selector into the top bar while preserving page state and callbacks', () => {
    render(
      <WebsiteNavigation>
        <Page />
      </WebsiteNavigation>,
    )

    const navigation = screen.getByRole('banner', { name: 'Valgt nettside' })
    const selector = within(navigation).getByRole('combobox', { name: 'Nettside' })
    expect(within(screen.getByRole('main')).queryByRole('combobox')).not.toBeInTheDocument()

    fireEvent.change(selector, { target: { value: 'fia' } })

    expect(screen.getByText('Valgt: fia')).toBeInTheDocument()
    expect(selector).toHaveValue('fia')
    const environment = within(navigation).getByRole('combobox', { name: 'Miljø' })
    expect(environment).toHaveDisplayValue('local')
    expect(selector.compareDocumentPosition(environment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
  })

  it('keeps the selector in place outside the new navigation shell', () => {
    render(<Page />)

    expect(within(screen.getByRole('main')).getByRole('combobox', { name: 'Nettside' })).toBeInTheDocument()
  })
})
