import { test, expect } from '@playwright/test'

/**
 * Smoke tests — verify core pages load without crashing.
 * Not testing deep functionality, just that the app boots
 * and key routes are reachable.
 *
 * The /api/bigquery/websites endpoint is mocked so tests are
 * hermetic and don't require a running backend.
 */

const MOCK_WEBSITES = [
  {
    id: 'site-1',
    name: 'Test Site',
    domain: 'test.nav.no',
    teamId: 'team-1',
    createdAt: '2024-01-01T00:00:00Z',
  },
]

test.describe('App smoke tests', () => {
  test('home page loads and shows the page heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /forstå brukeradferd med innblikk/i })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('/grafbygger loads and shows the page heading', async ({ page }) => {
    await page.route('**/api/bigquery/websites', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: MOCK_WEBSITES }) }),
    )
    await page.goto('/grafbygger')
    await expect(page.getByRole('heading', { level: 1, name: /grafbyggeren/i })).toBeVisible({ timeout: 10_000 })
  })

  test('/grafbygger renders the website picker with options', async ({ page }) => {
    await page.route('**/api/bigquery/websites', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: MOCK_WEBSITES }) }),
    )
    await page.goto('/grafbygger')
    // Scoped by accessible name ("Nettside") — the "Type analyse" <select> is
    // hidden under the new navigation, but stay scoped by role rather than
    // .first() to be robust against future additions.
    const combobox = page.getByRole('combobox', { name: /nettside/i })
    await expect(combobox).toBeVisible({ timeout: 10_000 })
    // Open the dropdown and verify mock data populated the picker
    await combobox.click()
    await expect(page.getByRole('option', { name: /test\.nav\.no/i })).toBeVisible({ timeout: 10_000 })
  })

  const routesWithHeadings: Array<{ path: string; heading: RegExp }> = [
    { path: '/trafikkanalyse', heading: /trafikkoversikt/i },
    { path: '/klikkoversikt', heading: /klikkoversikt/i },
    { path: '/brukerreiser', heading: /navigasjonsflyt/i },
    { path: '/trakt', heading: /^trakt$/i },
    { path: '/maloppnaelse', heading: /måloppnåelse/i },
  ]

  for (const { path, heading } of routesWithHeadings) {
    test(`${path} loads and shows the page heading`, async ({ page }) => {
      await page.route('**/api/bigquery/websites', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: MOCK_WEBSITES }) }),
      )
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 10_000 })
    })
  }
})

for (const width of [390, 1440]) {
  test(`cohort preview modal at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const queries: string[] = []
    const writes: string[] = []
    const cohort = {
      id: 3,
      websiteId: 'site-1',
      name: 'Søkere',
      root: {
        nodeType: 'GROUP',
        combinator: 'AND',
        negated: false,
        children: [
          {
            nodeType: 'GROUP',
            combinator: 'AND',
            negated: false,
            children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/soknad' }],
          },
        ],
      },
    }
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        let body: unknown = {}
        if (path === '/api/bigquery/websites') body = { data: MOCK_WEBSITES }
        else if (path === '/api/backend/cohort') {
          if (request.method() !== 'GET') writes.push(request.method())
          body = [cohort]
        } else if (path === '/api/backend/cohort/3') body = cohort
        else if (path.includes('column-values')) body = { values: ['/soknad'], scannedDays: 30 }
        else if (path === '/api/bigquery') {
          queries.push((request.postDataJSON() as { query: string }).query)
          body = {
            data: [{ kind: 'summary', name: '', users: 120, total: 1000, coverage_total: 1500, coverage_cookie: 750 }],
          }
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      },
    )

    await page.goto('/brukergrupper?websiteId=site-1')
    const previewButton = page.getByRole('button', { name: 'Forhåndsvis', exact: true })
    await expect(previewButton).toBeVisible()
    expect(queries).toHaveLength(0)
    await previewButton.click()
    const dialog = page.getByRole('dialog', { name: 'Søkere', exact: true })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/brukergrupper\?websiteId=site-1$/)
    await expect(dialog.getByRole('heading', { name: 'Søkere', exact: true })).toBeVisible()
    await expect(page.getByLabel('Periode', { exact: true })).toHaveValue('last_7_days')
    await expect(page.getByText('120 unike brukere', { exact: true })).toBeVisible()
    expect(queries).toHaveLength(1)
    await expect(page.getByRole('button', { name: 'Se mer om gruppen', exact: true })).toHaveCount(0)
    await expect(
      page.getByText('Tellemetode i forhåndsvisningen: Cookie og fingeravtrykk', { exact: true }),
    ).not.toBeVisible()
    await page.getByRole('button', { name: 'Om tellemetoden i forhåndsvisningen', exact: true }).click()
    await expect(
      page.getByText('Tellemetode i forhåndsvisningen: Cookie og fingeravtrykk', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/Uten cookie brukes fingeravtrykk/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: /Hvordan telles/ })).toHaveCount(0)
    await page.getByLabel('Periode', { exact: true }).selectOption('last_28_days')
    await expect(page.getByText('120 unike brukere', { exact: true })).not.toBeVisible()
    expect(queries).toHaveLength(1)
    await page.getByRole('button', { name: 'Oppdater', exact: true }).click()
    await expect(page.getByText('120 unike brukere', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('cohort-preview-modal.png'), fullPage: true })
    const preview = page.getByRole('region', { name: 'Forhåndsvisning', exact: true })
    const bounds = await preview.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)

    await dialog.getByRole('button', { name: 'Lukk', exact: true }).last().click()
    await expect(dialog).not.toBeVisible()
    await expect(previewButton).toBeFocused()
    await previewButton.click()
    await expect(dialog).toBeVisible()
    await expect(page.getByLabel('Periode', { exact: true })).toHaveValue('last_7_days')
    await expect(page.getByText('120 unike brukere', { exact: true })).toBeVisible()
    expect(queries).toHaveLength(3)

    await page.getByRole('button', { name: 'Rediger gruppe', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Rediger brukergruppe' })).toBeVisible()
    await page.getByRole('button', { name: 'Forhåndsvis gruppe', exact: true }).click()
    await expect(page.getByText('120 unike brukere', { exact: true })).toBeVisible()

    await page.goto('/brukergrupper/ny?websiteId=site-1')
    await page.getByRole('combobox', { name: 'Verdi', exact: true }).fill('/soknad')
    await page.getByRole('button', { name: 'Forhåndsvis gruppe', exact: true }).click()
    await expect(page.getByText('120 unike brukere', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Navn', { exact: true })).toBeEmpty()
    await expect(page.getByRole('button', { name: 'Opprett brukergruppe', exact: true })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('cohort-create-preview.png'), fullPage: true })
    expect(errors).toEqual([])
    expect(writes).toEqual([])
  })
}
