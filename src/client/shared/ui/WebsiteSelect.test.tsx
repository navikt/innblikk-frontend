import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WebsiteSelect } from './WebsiteSelect.tsx'
import type { Website } from '../types/website.ts'
import { DEFAULT_WEBSITE_ID } from '../lib/domain.ts'

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
  await user.click(await screen.findByRole('option', { name: 'arbeidogvelferd.nav.no' }))
  await user.click(input)
  return input
}

describe('WebsiteSelect backspace', () => {
  it('allows selecting and removing multiple sites without replacing the other selections', async () => {
    const user = userEvent.setup()
    function MultiHarness() {
      const [ids, setIds] = useState<string[]>([])
      return (
        <>
          <WebsiteSelect
            websites={sites}
            selectedId={ids[0] ?? null}
            onSelect={() => {}}
            selectedIds={ids}
            onSelectMultiple={setIds}
          />
          <output data-testid="selected-ids">{ids.join(',')}</output>
        </>
      )
    }
    render(<MultiHarness />)
    const input = screen.getByRole('combobox', { name: 'Nettsted' })
    await user.click(input)
    await user.click(await screen.findByRole('option', { name: 'aksel.nav.no' }))
    await user.click(input)
    await user.click(await screen.findByRole('option', { name: 'arbeidogvelferd.nav.no' }))
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('a,b')
    await user.click(input)
    await user.click(await screen.findByRole('option', { name: 'aksel.nav.no' }))
    expect(screen.getByTestId('selected-ids')).toHaveTextContent(/^b$/)
  })

  it('pins the main production site without parentheses while retaining duplicate names', async () => {
    const user = userEvent.setup()
    render(
      <WebsiteSelect
        websites={[
          ...sites,
          { ...sites[0], id: 'other-nav', name: 'Nav service', domain: 'www.nav.no' },
          { ...sites[0], id: DEFAULT_WEBSITE_ID.prod, name: 'Nav.no - prod', domain: 'www.nav.no' },
        ]}
        selectedId={null}
        onSelect={() => {}}
      />,
    )
    const input = screen.getByRole('combobox', { name: 'Nettsted' })
    await user.click(input)
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(/^www\.nav\.no$/)
    expect(screen.getByRole('option', { name: 'www.nav.no (Nav service)' })).toBeInTheDocument()
    await user.type(input, 'nav')
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(/^www\.nav\.no$/)
    await user.clear(input)
    await user.type(input, 'aksel')
    expect(screen.queryByRole('option', { name: 'www.nav.no' })).not.toBeInTheDocument()
  })

  it('shows domains and keeps duplicate sites distinguishable only in the list', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <WebsiteSelect
        websites={[...sites, { ...sites[0], id: 'duplicate', name: 'Another Aksel' }]}
        selectedId="a"
        onSelect={() => {}}
      />,
    )
    expect(container.querySelector('.aksel-combobox__selected-options--no-bg')).toHaveTextContent(/^aksel.nav.no$/)
    await user.click(screen.getByRole('combobox', { name: 'Nettsted' }))
    expect(screen.getByRole('option', { name: 'aksel.nav.no', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'aksel.nav.no (Another Aksel)' })).toBeInTheDocument()
  })

  it('finds SharePoint by its Navet alias', async () => {
    const user = userEvent.setup()
    render(
      <WebsiteSelect
        websites={[...sites, { ...sites[0], id: 'sharepoint', name: 'Intranett', domain: 'navno.sharepoint.com' }]}
        selectedId={null}
        onSelect={() => {}}
      />,
    )
    await user.type(screen.getByRole('combobox', { name: 'Nettsted' }), 'Navet')
    expect(screen.getByRole('option', { name: 'navno.sharepoint.com (Navet)' })).toBeInTheDocument()
  })

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
