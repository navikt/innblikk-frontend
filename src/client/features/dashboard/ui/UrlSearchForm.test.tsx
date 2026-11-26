import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UrlSearchForm from './UrlSearchForm.tsx'
import { fetchWebsites } from '../api/bigquery.ts'
import { fetchColumnValues } from '../../cohortmanager/api/columnValuesApi.ts'
import { columnValuesSuggestions } from '../../cohortmanager/hooks/useColumnValueSuggestions.ts'
import { DEFAULT_WEBSITE_ID } from '../../../shared/lib/domain.ts'
import { PROD_TEAM_ID } from '../../settings/model/constants.ts'

vi.mock('../api/bigquery.ts', () => ({ fetchWebsites: vi.fn() }))
vi.mock('../../cohortmanager/api/columnValuesApi.ts', () => ({ fetchColumnValues: vi.fn() }))

const websites = [
  { id: 'nav-test', domain: 'www.nav.no', name: 'Test', teamId: 'test-team', createdAt: '2026-01-01' },
  { id: DEFAULT_WEBSITE_ID.prod, domain: 'www.nav.no', name: 'Nav', teamId: PROD_TEAM_ID, createdAt: '2026-01-01' },
  { id: 'aksel', domain: 'aksel.nav.no', name: 'Aksel', teamId: PROD_TEAM_ID, createdAt: '2026-01-01' },
]

function Location() {
  const location = useLocation()
  return <output data-testid="adresse">{location.pathname + location.search}</output>
}

function renderForm() {
  render(
    <MemoryRouter>
      <UrlSearchForm />
      <Location />
    </MemoryRouter>,
  )
  return screen.getByRole('combobox', { name: 'Lim inn URL for å se webstatistikk' })
}

function expectDestination(websiteId: string, path: string | null) {
  return waitFor(() => {
    const address = screen.getByTestId('adresse').textContent
    expect(address.split('?')[0]).toBe('/trafikkanalyse')
    const params = new URLSearchParams(address.split('?')[1])
    expect(params.get('websiteId')).toBe(websiteId)
    expect(params.get('urlPath')).toBe(path)
  })
}

describe('URL-forslag på forsiden', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    columnValuesSuggestions.clearColumnValuesCache()
    vi.mocked(fetchWebsites).mockResolvedValue(websites)
    vi.mocked(fetchColumnValues).mockImplementation((websiteId) =>
      Promise.resolve({
        values: websiteId === 'aksel' ? ['/komponenter', '/monster'] : ['/arbeid', '/helse'],
        scannedDays: 30,
      }),
    )
  })

  it('bruker hovednettstedet i produksjon for bare en sti, også med et testnettsted først', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, '/arb')
    await user.click(await screen.findByRole('option', { name: /^\/arbeid$/ }))
    expect(input).toHaveValue('/arbeid')
    await user.click(screen.getByRole('button', { name: /^Søk$/ }))
    await expectDestination(DEFAULT_WEBSITE_ID.prod, '/arbeid')
    expect(fetchColumnValues).toHaveBeenCalledWith(DEFAULT_WEBSITE_ID.prod, 'url_path', undefined, undefined)
    expect(fetchWebsites).toHaveBeenCalledTimes(1)
  })

  it('gjetter nettsted fra domenet og bytter forslag når domenet endres', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, '/arb')
    await screen.findByRole('option', { name: /^\/arbeid$/ })
    await user.clear(input)
    await user.type(input, 'https://aksel.nav.no/kom')
    await user.click(await screen.findByRole('option', { name: /^https:\/\/aksel.nav.no\/komponenter$/ }))
    expect(input).toHaveValue('https://aksel.nav.no/komponenter')
    await user.click(screen.getByRole('button', { name: /^Søk$/ }))
    await expectDestination('aksel', '/komponenter')
    expect(fetchColumnValues).toHaveBeenCalledWith('aksel', 'url_path', undefined, undefined)
  })

  it('foreslår nettsteder før brukeren skriver en sti', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, 'aks')
    await user.click(await screen.findByRole('option', { name: /^aksel.nav.no$/ }))
    expect(input).toHaveFocus()
    expect(input).toHaveValue('aksel.nav.no')
    await screen.findByRole('option', { name: /^aksel.nav.no\/komponenter$/ })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('/komponenter')
    expect(input).toHaveValue('aksel.nav.no/komponenter')
    await user.click(screen.getByRole('button', { name: /^Søk$/ }))
    await expectDestination('aksel', '/komponenter')
  })

  it('lar brukeren skrive en adresse selv når URL-forslag ikke kan hentes', async () => {
    vi.mocked(fetchColumnValues).mockRejectedValue(new Error('Feil ved oppslag'))
    const user = userEvent.setup()
    await user.type(renderForm(), 'nav.no/en-annen-side?lang=nb')
    await screen.findByText('Kunne ikke hente URL-forslag. Du kan fortsatt skrive inn adressen selv.')
    await user.click(screen.getByRole('button', { name: /^Søk$/ }))
    await expectDestination(DEFAULT_WEBSITE_ID.prod, '/en-annen-side')
  })

  it('velger forslag med tastaturet uten å sende inn skjemaet før søk', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, '/arb')
    await screen.findByRole('option', { name: /^\/arbeid$/ })
    await user.keyboard('{ArrowDown}')
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)).toHaveTextContent('/arbeid')
    await user.keyboard('{Enter}')
    expect(input).toHaveFocus()
    expect(input).toHaveValue('/arbeid')
    await user.keyboard('/soknad')
    expect(input).toHaveValue('/arbeid/soknad')
    expect(screen.getByTestId('adresse')).toHaveTextContent(/^\/$/)
    await user.keyboard('{Enter}')
    await expectDestination(DEFAULT_WEBSITE_ID.prod, '/arbeid/soknad')
  })

  it('viser oppslagsfeil og lar brukeren prøve igjen', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchWebsites).mockRejectedValueOnce(new Error('Feil ved oppslag'))
    const user = userEvent.setup()
    const input = renderForm()
    await user.click(input)
    await screen.findByText('Kunne ikke hente nettsider. Prøv igjen.')
    await user.type(input, '/arbeid')
    await user.click(screen.getByRole('button', { name: /^Søk$/ }))
    await expectDestination(DEFAULT_WEBSITE_ID.prod, '/arbeid')
    expect(fetchWebsites).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it('viser nav.no-produksjon øverst i nettstedslisten', async () => {
    const user = userEvent.setup()
    await user.click(renderForm())
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveTextContent(/^www.nav.no$/)
    await user.click(screen.getByRole('button', { name: 'Hvilke nettsider støttes?' }))
    const links = await screen.findAllByRole('link')
    expect(links[0]).toHaveTextContent('www.nav.no')
    expect(links[0]).toHaveAttribute('href', `/trafikkanalyse?websiteId=${DEFAULT_WEBSITE_ID.prod}&domain=www.nav.no`)
  })

  it('lar brukeren redigere og tømme et valgt forslag', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, '/arb')
    await user.click(await screen.findByRole('option', { name: /^\/arbeid$/ }))
    expect(input).toHaveValue('/arbeid')
    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('/arbei')
    await user.clear(input)
    expect(input).toHaveValue('')
    await user.click(screen.getByRole('button', { name: /^Søk$/ }))
    await screen.findByText('Du må sette inn en URL-adresse.')
    expect(screen.getByTestId('adresse')).toHaveTextContent(/^\/$/)
  })

  it('åpner hele nettstedet når brukeren velger bare et domene', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, 'aks')
    await user.click(await screen.findByRole('option', { name: /^aksel.nav.no$/ }))
    expect(input).toHaveValue('aksel.nav.no')
    await user.keyboard('{Enter}')
    await expectDestination('aksel', null)
  })

  it('filtrerer på forsiden når brukeren skriver en eksplisitt skråstrek', async () => {
    const user = userEvent.setup()
    await user.type(renderForm(), 'aksel.nav.no/')
    await user.keyboard('{Enter}')
    await expectDestination('aksel', '/')
  })

  it('viser ikke «Legg til» og lar brukeren søke etter en adresse uten forslag', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, 'nav.no/en-ny-side')
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalled())
    expect(screen.queryByText(/legg til/i)).not.toBeInTheDocument()
    expect(screen.getByText('Ingen søketreff').closest('.aksel-combobox__list')).toHaveClass(
      'aksel-combobox__list--closed',
    )
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveValue('nav.no/en-ny-side')
    await user.keyboard('{Enter}')
    await expectDestination(DEFAULT_WEBSITE_ID.prod, '/en-ny-side')
  })

  it('skjuler tomme URL-forslag og lar brukeren søke på en side uten trafikk', async () => {
    vi.mocked(fetchColumnValues).mockResolvedValue({ values: [], scannedDays: 30 })
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, 'aksel.nav.no/ny-side')
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalledWith('aksel', 'url_path', undefined, undefined))
    expect(screen.getByText('Ingen søketreff').closest('.aksel-combobox__list')).toHaveClass(
      'aksel-combobox__list--closed',
    )
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{Enter}')
    await expectDestination('aksel', '/ny-side')
  })

  it('åpner forslag igjen når en adresse uten treff endres til en med treff', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, '/ingen-trafikk')
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalled())
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.clear(input)
    await user.type(input, '/arb')
    await screen.findByRole('option', { name: /^\/arbeid$/ })
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('lukker URL-forslag ved Escape og åpner dem igjen når feltet klikkes', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, 'aks')
    await user.click(await screen.findByRole('option', { name: /^aksel.nav.no$/ }))
    await screen.findByRole('option', { name: /^aksel.nav.no\/komponenter$/ })
    await user.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it.each(['?next=/komponenter', '#/komponenter'])(
    'åpner hele nettstedet uten å tolke %s som en sti',
    async (suffix) => {
      const user = userEvent.setup()
      const input = renderForm()
      await user.type(input, `aksel.nav.no${suffix}`)
      await screen.findByRole('option', { name: /^aksel.nav.no\/komponenter$/ })
      await user.keyboard('{Enter}')
      await expectDestination('aksel', null)
    },
  )

  it.each(['?next=/monster', '#/monster'])(
    'foreslår pathname og ikke query eller fragment når adressen slutter med %s',
    async (suffix) => {
      const user = userEvent.setup()
      const input = renderForm()
      await user.type(input, `https://aksel.nav.no/kom${suffix}`)
      await user.click(await screen.findByRole('option', { name: /^https:\/\/aksel.nav.no\/komponenter$/ }))
      expect(input).toHaveValue('https://aksel.nav.no/komponenter')
      await user.keyboard('{Enter}')
      await expectDestination('aksel', '/komponenter')
    },
  )

  it('åpner og lukker forslag med pilknappen uten å miste fokus eller tekst', async () => {
    const user = userEvent.setup()
    const input = renderForm()
    await user.type(input, 'aks')
    await user.click(await screen.findByRole('option', { name: /^aksel.nav.no$/ }))
    await screen.findByRole('option', { name: /^aksel.nav.no\/komponenter$/ })
    const toggle = input
      .closest('.aksel-combobox__wrapper-inner')!
      .querySelector('.aksel-combobox__button-toggle-list')!
    await user.click(toggle)
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveFocus()
    expect(input).toHaveValue('aksel.nav.no')
    await user.click(toggle)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveFocus()
    await screen.findByRole('option', { name: /^aksel.nav.no\/komponenter$/ })
  })
})
