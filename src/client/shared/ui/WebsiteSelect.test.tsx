import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WebsiteSelect } from './WebsiteSelect.tsx'
import type { Website } from '../types/website.ts'

const sites = [
  { id: 'a', name: 'Aksel', domain: 'aksel.nav.no' },
  { id: 'b', name: 'Arbeid og velferd', domain: 'arbeidogvelferd.nav.no' },
] as Website[]

function Harness() {
  const [id, setId] = useState<string | null>(null)
  return (
    <>
      <WebsiteSelect websites={sites} selectedId={id} onSelect={setId} />
      <output data-testid="selected">{id ?? 'none'}</output>
    </>
  )
}

async function pickArbeid(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByRole('combobox', { name: 'Nettsted' })
  await user.click(input)
  await user.click(await screen.findByRole('option', { name: /Arbeid og velferd/ }))
  await user.click(input)
  return input
}

describe('WebsiteSelect backspace', () => {
  it('clears an untouched selection', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await pickArbeid(user)
    expect(screen.getByTestId('selected')).toHaveTextContent('b')

    await user.keyboard('{Backspace}')
    expect(screen.getByTestId('selected')).toHaveTextContent('none')
  })

  it('keeps the selection while a search term is being corrected', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = await pickArbeid(user)

    await user.keyboard('ak')
    await user.keyboard('{Backspace}')

    expect(screen.getByTestId('selected')).toHaveTextContent('b')
    expect(input).toHaveValue('a')
  })
})
