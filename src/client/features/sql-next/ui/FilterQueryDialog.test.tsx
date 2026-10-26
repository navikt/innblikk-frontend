import { fireEvent, render, screen } from '@testing-library/react'
import FilterQueryDialog from './FilterQueryDialog'

const event = '`test-project.umami_views.event`'
const session = '`test-project.umami_views.session`'

const setup = (query: string) => {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(<FilterQueryDialog projectId="test-project" query={query} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}

it('shows the exact lines before anything is inserted', () => {
  const { onApply } = setup(`SELECT browser FROM ${session}`)
  expect(screen.getByRole('dialog', { name: 'Legg til filtre' })).toBeInTheDocument()
  const code = screen.getByLabelText('SQL som settes inn')
  expect(code).toHaveTextContent("WHERE website_id = '{{website_id}}'")
  expect(code).toHaveTextContent('[[AND {{created_at}}]]')
  expect(code).not.toHaveTextContent('session.website_id')
  expect(screen.getByRole('button', { name: 'Kopier SQL' })).toBeInTheDocument()
  expect(onApply).not.toHaveBeenCalled()
})

it('inserts the previewed SQL only after pressing Sett inn', () => {
  const { onApply, onClose } = setup(`SELECT browser FROM ${session}`)
  fireEvent.click(screen.getByRole('button', { name: 'Sett inn' }))
  expect(onApply).toHaveBeenCalledWith(
    `SELECT browser FROM ${session}\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]`,
  )
  expect(onClose).toHaveBeenCalledOnce()
})

it('updates the preview when a filter is unchecked', () => {
  setup(`SELECT browser FROM ${session}`)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Periode' }))
  const code = screen.getByLabelText('SQL som settes inn')
  expect(code).toHaveTextContent("website_id = '{{website_id}}'")
  expect(code).not.toHaveTextContent('created_at')
})

it('lets the user choose the table when several tables could hold the website filter', () => {
  const { onApply } = setup(`SELECT 1 FROM ${event} e LEFT JOIN ${session} s ON e.session_id = s.session_id`)
  const select = screen.getByRole('combobox', { name: 'Nettside gjelder for tabell' })
  expect(screen.getByLabelText('SQL som settes inn')).toHaveTextContent("e.website_id = '{{website_id}}'")
  fireEvent.change(select, { target: { value: 's' } })
  expect(screen.getByLabelText('SQL som settes inn')).toHaveTextContent("s.website_id = '{{website_id}}'")
  fireEvent.click(screen.getByRole('button', { name: 'Sett inn' }))
  expect(onApply.mock.calls[0][0]).toContain("WHERE s.website_id = '{{website_id}}'")
})

it('does not ask for a table when there is only one', () => {
  setup(`SELECT 1 FROM ${session}`)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

it('marks filters that already exist and has nothing to insert when both do', () => {
  setup(`SELECT 1 FROM ${event} WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]`)
  expect(screen.getByRole('checkbox', { name: /Nettside/ })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: /Periode/ })).toBeDisabled()
  expect(screen.getByText('Spørringen har allerede både nettside og periode.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sett inn' })).toBeDisabled()
})

it('offers only the code to copy when the query is too complex to edit', () => {
  const { onApply } = setup(`SELECT * FROM (SELECT 1 FROM ${event}) t`)
  expect(screen.getByLabelText('SQL som settes inn')).toBeInTheDocument()
  expect(screen.getByText(/for sammensatt til å settes inn automatisk/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sett inn' })).toBeDisabled()
  expect(onApply).not.toHaveBeenCalled()
})

it('starts a new query with FROM and filters', () => {
  const { onApply } = setup('SELECT')
  fireEvent.click(screen.getByRole('button', { name: 'Sett inn' }))
  expect(onApply).toHaveBeenCalledWith(
    `SELECT\nFROM ${event}\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]`,
  )
})

it('keeps the website filter on and explains why when the period has no WHERE to follow', () => {
  setup(`SELECT browser FROM ${session}`)
  fireEvent.click(screen.getByRole('checkbox', { name: /Nettside/ }))
  expect(screen.getByRole('checkbox', { name: /Nettside/ })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: /Nettside/ })).toBeChecked()
  expect(screen.getByText('Følger med perioden')).toBeInTheDocument()
  expect(screen.getByLabelText('SQL som settes inn')).not.toHaveTextContent('1 = 1')
})

it('allows a period on its own when the query already has a WHERE', () => {
  const { onApply } = setup(`SELECT browser FROM ${session} WHERE browser = 'chrome'`)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Nettside' }))
  expect(screen.getByRole('checkbox', { name: 'Nettside' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Sett inn' }))
  expect(onApply).toHaveBeenCalledWith(
    `SELECT browser FROM ${session}\nWHERE browser = 'chrome'\n  [[AND {{created_at}}]]`,
  )
})
