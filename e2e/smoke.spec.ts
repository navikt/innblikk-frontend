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
    const combobox = page.getByRole('combobox').first()
    await expect(combobox).toBeVisible({ timeout: 10_000 })
    // Open the dropdown and verify mock data populated the picker
    await combobox.click()
    await expect(page.getByRole('option', { name: /test site/i })).toBeVisible({ timeout: 10_000 })
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

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`journey HTML preview at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const apiPayloads: string[] = []
    await page.route('**/api/**', (route) => {
      apiPayloads.push(route.request().postData() || '')
      if (route.request().url().includes('/api/clickmap-preview')) {
        if (new URL(route.request().url()).searchParams.get('url') === 'https://mock.example/calculator') {
          return route.fulfill({
            contentType: 'text/html',
            body: '<a href="/next">Neste</a><p>Offentlig mockside lastet</p>',
          })
        }
        return route.fulfill({
          contentType: 'text/html',
          body: '<body data-clickmap-preview-error="unauthenticated"><h1>Siden krever innlogging</h1></body>',
        })
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: route.request().url().includes('/websites') ? MOCK_WEBSITES : [] }),
      })
    })
    const params = new URLSearchParams({
      websiteId: 'site-1',
      urlPath: '/account/',
      journey: JSON.stringify([
        'lenke klikket: lenketekst: Neste || destinasjon: /next',
        'knapp klikket: deviceBrowser: Safari || deviceBrowserVersion: 26.6',
        'lenke klikket: lenketekst: Manglende lenke || destinasjon: /missing',
        'knapp klikket: tekst: Toggle viser fane avansert',
        'button click: tekst: Avbryt',
      ]),
      journeyCount: '2',
      journeyTotal: '4',
    })
    await page.goto(`/hendelsesreiser/visualisering?${params.toString()}`)
    await expect(page.getByRole('radio', { name: 'Lim inn HTML' })).not.toBeVisible()
    await page.getByRole('button', { name: 'Alternative visningsvalg' }).click()
    await page.getByRole('radio', { name: 'Lim inn HTML' }).click()
    await expect(page.getByRole('button', { name: 'Vis HTML', exact: true })).toBeDisabled()
    const html = `<!doctype html><html><head><style>body { padding: 40px; font: 18px sans-serif; }
      a { display: inline-block; padding: 16px; }</style>
      <script>parent.document.body.dataset.snapshotExecuted = 'yes'</script>
      <meta http-equiv="refresh" content="0;url=https://evil.example"></head>
      <body><a href="/next" onclick="parent.document.body.dataset.snapshotExecuted = 'yes'">Neste</a>
      <button>Gå ut av Avansert</button><button>Avbryt</button>
      <div role="radiogroup"><button role="radio" aria-checked="true">Enkel</button>
      <button role="radio" aria-checked="false"><span>Avansert</span></button></div>
      <p>snapshot-only-content</p></body></html>`
    await page.getByLabel('HTML fra siden').fill(html)
    await page.getByRole('button', { name: 'Vis HTML', exact: true }).click()
    const iframe = page.locator('iframe[title="Visualisert hendelsesforløp"]')
    await expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin')
    await expect(iframe).not.toHaveAttribute('src')
    const preview = page.frameLocator('iframe[title="Visualisert hendelsesforløp"]')
    const link = preview.getByRole('link', { name: 'Neste' })
    await expect(link).toHaveAttribute('data-journey-step', '1')
    await expect(preview.getByRole('radio', { name: 'Avansert' })).toHaveAttribute('data-journey-step', '4')
    await expect(preview.getByRole('button', { name: 'Gå ut av Avansert' })).not.toHaveAttribute('data-journey-step')
    await expect(preview.getByRole('button', { name: 'Avbryt' })).toHaveAttribute('data-journey-step', '5')
    await expect(preview.locator('base')).toHaveAttribute('href', 'https://test.nav.no/account/')
    await link.click()
    await expect(preview.getByText('snapshot-only-content')).toBeVisible()
    expect(await page.locator('body').getAttribute('data-snapshot-executed')).toBeNull()
    expect(apiPayloads.some((payload) => payload.includes('snapshot-only-content'))).toBe(false)
    await page.getByRole('button', { name: /Steg 2/ }).click()
    const missingStepDialog = page.getByRole('dialog', { name: 'Fant ikke plasseringen til steg 2' })
    await expect(missingStepDialog).toBeVisible()
    await expect(missingStepDialog).toContainText('Enhetsdata alene er ikke nok')
    await missingStepDialog.getByRole('button', { name: 'Lukk', exact: true }).click()
    await expect(missingStepDialog).not.toBeVisible()
    await page.getByRole('button', { name: /Steg 3/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Elementet kan være skjult')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /Steg 1/ }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(link).toHaveClass(/umami-journey-step-active/)
    await page.getByRole('button', { name: /Steg 4/ }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(preview.getByRole('radio', { name: 'Avansert' })).toHaveClass(/umami-journey-step-active/)
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`journey-html-${viewport.width}.png`), fullPage: true })

    await page.getByRole('radio', { name: 'Offentlig mockside', exact: true }).click()
    const mockUrlInput = page.getByRole('textbox', { name: 'URL til offentlig mockside' })
    await mockUrlInput.fill('http://mock.example/calculator')
    await page.getByRole('button', { name: 'Vis mockside', exact: true }).click()
    await expect(page.getByText('Oppgi en fullstendig HTTPS-adresse uten innloggingsopplysninger.')).toBeVisible()
    await mockUrlInput.fill('https://mock.example/calculator')
    await page.getByRole('button', { name: 'Vis mockside', exact: true }).click()
    await expect(preview.getByText('Offentlig mockside lastet')).toBeVisible()
    await expect(preview.getByRole('link', { name: 'Neste' })).toHaveAttribute('data-journey-step', '1')
    expect(new URL(page.url()).searchParams.get('urlPath')).toBe('/account/')
    await page.getByRole('radio', { name: 'Opprinnelig side' }).click()
    await expect(iframe).toHaveAttribute('src', /\/api\/clickmap-preview/)
    await expect(preview.getByRole('heading', { name: 'Siden krever innlogging' })).toBeVisible()
    await page.getByRole('radio', { name: 'Lim inn HTML' }).click()
    await expect(preview.getByText('snapshot-only-content')).toBeVisible()
    await page.getByRole('textbox', { name: 'URL', exact: true }).fill('/another-page')
    await expect(iframe).not.toHaveAttribute('srcdoc')
    await page.getByRole('radio', { name: 'Lim inn HTML' }).click()
    await expect(page.getByLabel('HTML fra siden')).toHaveValue('')
    await page.reload()
    await page.getByRole('button', { name: 'Alternative visningsvalg' }).click()
    await page.getByRole('radio', { name: 'Lim inn HTML' }).click()
    await expect(page.getByLabel('HTML fra siden')).toHaveValue('')
  })

  test(`click overview HTML preview at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.route('**/api/**', (route) => {
      const requestUrl = new URL(route.request().url())
      if (requestUrl.pathname.includes('/clickmap-preview')) {
        const isMock = requestUrl.searchParams.get('url') === 'https://mock.example/calculator'
        return route.fulfill({
          contentType: 'text/html',
          body: isMock
            ? '<a href="/next">Neste</a><p>Offentlig mockside lastet</p>'
            : '<body data-clickmap-preview-error="unauthenticated"><h1>Siden krever innlogging</h1></body>',
        })
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: requestUrl.pathname.endsWith('/websites')
            ? MOCK_WEBSITES
            : [
                {
                  sourcePath: '/account/',
                  linkText: 'Neste',
                  destination: '/next',
                  section: '',
                  audience: '',
                  component: '',
                  count: 12,
                },
              ],
        }),
      })
    })
    await page.goto('/klikkoversikt?websiteId=site-1&urlPath=%2Faccount%2F')
    await page.getByRole('button', { name: 'Alternative visningsvalg' }).click()
    await page.getByRole('radio', { name: 'Lim inn HTML' }).click()
    await page
      .getByLabel('HTML fra siden')
      .fill(
        '<a href="/next" onclick="parent.document.body.dataset.snapshotExecuted=1">Neste</a><script>parent.document.body.dataset.snapshotExecuted=1</script>',
      )
    await page.getByRole('button', { name: 'Vis HTML', exact: true }).click()
    const iframe = page.locator('iframe[title="Klikk-kart sidevisning"]')
    const preview = page.frameLocator('iframe[title="Klikk-kart sidevisning"]')
    const link = preview.getByRole('link', { name: 'Neste' })
    await expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin')
    await expect(link).toHaveAttribute('data-clickmap-snapshot-count', '12')
    await link.click()
    await expect(link).toBeVisible()
    expect(await page.locator('body').getAttribute('data-snapshot-executed')).toBeNull()
    if (viewport.width < 768) await page.getByRole('button', { name: /Vis toppliste/i }).click()
    await page.getByRole('button', { name: /^Neste/ }).click()
    await expect(link).toHaveClass(/umami-clickmap-focused-link/)
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`clickmap-html-${viewport.width}.png`), fullPage: true })
    await page.getByRole('radio', { name: 'Offentlig mockside', exact: true }).click()
    await page.getByRole('textbox', { name: 'URL til offentlig mockside' }).fill('https://mock.example/calculator')
    await page.getByRole('button', { name: 'Vis mockside', exact: true }).click()
    await expect(preview.getByText('Offentlig mockside lastet')).toBeVisible()
    expect(new URL(page.url()).searchParams.get('urlPath')).toBe('/account/')
  })
}

for (const path of ['/hendelsesreiser/visualisering', '/klikkoversikt']) {
  test(`${path} hides alternative viewing options for an available original page`, async ({ page }) => {
    await page.route('**/api/**', (route) => {
      const requestUrl = new URL(route.request().url())
      if (requestUrl.pathname.includes('/clickmap-preview')) {
        return route.fulfill({ contentType: 'text/html', body: '<a href="/next">Neste</a>' })
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: requestUrl.pathname.endsWith('/websites')
            ? MOCK_WEBSITES
            : [
                {
                  sourcePath: '/account/',
                  linkText: 'Neste',
                  destination: '/next',
                  section: '',
                  audience: '',
                  component: '',
                  count: 12,
                },
              ],
        }),
      })
    })
    const params = new URLSearchParams({
      websiteId: 'site-1',
      urlPath: '/account/',
      journey: JSON.stringify(['lenke klikket: lenketekst: Neste || destinasjon: /next']),
    })
    await page.goto(`${path}?${params.toString()}`)
    await expect(page.frameLocator('iframe').getByRole('link', { name: 'Neste' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Alternative visningsvalg' })).toHaveCount(0)
  })
}
