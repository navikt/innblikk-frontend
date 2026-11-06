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
    await expect(page.getByRole('heading', { name: 'Grafbyggeren er i beta', exact: true })).toBeVisible()
  })

  test('settings keeps the builder in beta and offers only its new filter selector in alfa', async ({ page }) => {
    await page.route('**/api/user/me', (route) =>
      route.fulfill({ status: 503, json: { message: 'Unavailable in this test' } }),
    )
    await page.route('**/api/backend/user-settings', (route) => route.fulfill({ json: { settings: {} } }))
    await page.goto('/innstillinger')
    await expect(page.getByRole('heading', { name: 'Funksjoner i beta', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Grafbyggeren er i beta', exact: true })).toHaveCount(1)
    const betaSection = page.locator('#beta')
    const alfaSection = page.locator('#alpha')
    await expect(betaSection.getByRole('link', { name: 'Åpne grafbyggeren', exact: true })).toHaveAttribute(
      'href',
      '/grafbygger',
    )
    await expect(betaSection.locator('a[href="/grafbygger-alfa"]')).toHaveCount(0)
    await expect(alfaSection.getByRole('heading', { name: 'Funksjoner i alfa', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Grafbyggeren er i alfa', exact: true })).toHaveCount(0)
    await expect(alfaSection.getByRole('status')).toHaveCount(0)
    const optIn = alfaSection.getByRole('checkbox', { name: /Aktiver ny filtervelger i grafbyggeren/ })
    await expect(optIn).not.toBeChecked()
    await expect(alfaSection.getByRole('link', { name: 'Åpne grafbyggeren', exact: true })).toHaveCount(0)
    await expect(alfaSection).toContainText('Det er ikke sikkert de kommer i beta eller blir en ferdig funksjon.')
    await optIn.check()
    await expect(optIn).toBeChecked()
    await expect(alfaSection.locator('a[href="/grafbygger-alfa"]')).toHaveCount(0)
    await expect(alfaSection.getByRole('button', { name: 'Lukk melding' })).toHaveCount(0)
    await expect(page.getByText('Ingen funksjoner i alfa akkurat nå.', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Funksjoner i alpha', exact: true })).toHaveCount(0)
    await page.reload()
    await expect(optIn).toBeChecked()
    await optIn.uncheck()
    await expect(alfaSection.getByRole('link', { name: 'Åpne grafbyggeren', exact: true })).toHaveCount(0)
  })

  test('the previous alfa URL opens the beta builder without enabling the experimental selector', async ({ page }) => {
    await page.route('**/api/backend/user-settings', (route) => route.fulfill({ json: { settings: {} } }))
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    await page.route('**/event-properties?*', (route) => route.fulfill({ json: { properties: [] } }))
    await page.goto('/grafbygger-alfa?websiteId=site-1&focused=1')
    await expect(page).toHaveURL(/\/grafbygger\?websiteId=site-1&focused=1$/)
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Velg filter' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Velg filter' })).toHaveCount(0)
  })

  test('/grafbygger renders the website picker with options', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 })
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
    await combobox.press('Escape')
    await expect(page.getByRole('button', { name: 'Minimer filter', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Vis filter', exact: true })).toHaveCount(0)
  })

  test('/grafbygger-eol keeps the previous builder and its separate draft', async ({ page }) => {
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    await page.route('**/event-properties?*', (route) => route.fulfill({ json: { properties: [] } }))
    const previousDraft = {
      website: MOCK_WEBSITES[0],
      metrics: [{ function: 'count', alias: 'tidligere_antall' }],
      groupByFields: [],
    }
    const betaDraft = {
      ...previousDraft,
      metrics: [{ function: 'count', alias: 'nytt_antall' }],
    }
    await page.addInitScript(
      ({ previousDraft, betaDraft }) => {
        localStorage.setItem('grafbygger:config:v2', JSON.stringify(previousDraft))
        localStorage.setItem('grafbygger-next:config:v2', JSON.stringify(betaDraft))
      },
      { previousDraft, betaDraft },
    )
    await page.goto('/grafbygger-eol?websiteId=site-1')
    await expect(page.getByText('Datakilder', { exact: true })).toBeVisible()
    await expect(page.getByText('Målt som...', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Minimer filter', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Grafbyggeren er i beta', exact: true })).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('grafbygger:config:v2')))
      .toContain(`"metrics":${JSON.stringify(previousDraft.metrics)}`)

    await page.getByRole('link', { name: 'Grafbygger', exact: true }).click()
    await expect(page).toHaveURL(/\/grafbygger\?websiteId=site-1$/)
    await expect(page.getByText('For hendelser og filtre...', { exact: true })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('grafbygger-next:config:v2')))
      .toContain(`"metrics":${JSON.stringify(betaDraft.metrics)}`)
    expect(await page.evaluate(() => localStorage.getItem('grafbygger:config:v2'))).toContain(
      `"metrics":${JSON.stringify(previousDraft.metrics)}`,
    )
  })

  for (const path of ['/grafbygger-next']) {
    test(`${path} redirects to the beta builder without losing the draft or URL parameters`, async ({ page }) => {
      await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
      await page.route('**/event-properties?*', (route) => route.fulfill({ json: { properties: [] } }))
      const draft = {
        website: MOCK_WEBSITES[0],
        metrics: [{ function: 'count', alias: 'antall' }],
        groupByFields: [],
      }
      await page.addInitScript(`
      localStorage.setItem('grafbygger-next:config:v2', ${JSON.stringify(JSON.stringify(draft))})
      localStorage.setItem('grafbygger-next:filters:v2', JSON.stringify([
        { column: 'event_type', operator: 'IN', value: '1', multipleValues: ['1'] }
      ]))
      localStorage.setItem('innblikk_dismissed_alerts', JSON.stringify(['grafbygger-next']))
    `)
      await page.goto(`${path}?websiteId=site-1&focused=0`)
      await expect(page).toHaveURL(/\/grafbygger\?websiteId=site-1&focused=0$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Grafbyggeren', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sidevisninger slett' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Prøv den nye grafbyggeren', exact: true })).toHaveCount(0)
    })
  }

  test('/grafbygger keeps the initial event controls minimal', async ({ page }) => {
    const cohort = {
      id: 3,
      websiteId: 'site-1',
      name: 'Søkere',
      root: {
        nodeType: 'GROUP',
        combinator: 'AND',
        negated: false,
        children: [{ nodeType: 'CONDITION', field: 'browser', conditionType: 'EQUALS', value: 'Firefox' }],
      },
    }
    await page.route(
      (url) => url.pathname === '/api/backend/cohort',
      (route) => route.fulfill({ json: [cohort, { ...cohort, id: 4, name: 'Windowsbrukere' }] }),
    )
    await page.route('**/api/backend/cohort/3', (route) => route.fulfill({ json: cohort }))
    await page.route('**/api/backend/cohort/4', (route) =>
      route.fulfill({ json: { ...cohort, id: 4, name: 'Windowsbrukere' } }),
    )
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    await page.route('**/event-properties?*', (route) =>
      route.fulfill({
        json: {
          properties:
            new URL(route.request().url()).searchParams.get('includeParams') === 'true'
              ? []
              : [{ eventName: 'skjema sendt' }, { eventName: 'meny åpnet' }],
        },
      }),
    )
    await page.goto('/grafbygger?websiteId=site-1')
    const heading = page.getByRole('heading', { level: 1, name: 'Grafbyggeren', exact: true })
    await expect(heading).toBeVisible()
    await expect(heading.locator('..').getByText('Beta', { exact: true })).toBeVisible()
    await expect(heading.locator('..').getByText('Alfa', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Prøv den nye grafbyggeren', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Grafbyggeren er i beta', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Minimer filter', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Vis filter', exact: true })).toHaveCount(0)
    const picker = page.getByRole('combobox', { name: 'Hendelser', exact: true })
    await expect(picker).toBeVisible()
    await expect(picker).not.toHaveAttribute('placeholder')
    await expect(page.getByRole('button', { name: 'Sidevisninger slett' })).toHaveCount(0)
    await expect(page.getByText('Velg sidevisninger eller en egen hendelse.', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible()
    for (const name of ['Filter', 'Brukergruppe']) {
      const action = page.getByRole('button', { name, exact: true })
      await expect(action).toHaveAttribute('data-variant', 'tertiary')
      await expect(action).toHaveAttribute('data-color', 'neutral')
      await expect(action).toHaveCSS('padding-left', '0px')
      await expect(action).toHaveCSS('padding-right', '0px')
    }
    await expect(page.getByText('Flere valg for hendelser', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Filtre', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Velg brukergrupper' })).toHaveCount(0)
    await expect(page.getByText('Vis...', { exact: true })).toBeVisible()
    await expect(page.getByText('For hendelser og filtre...', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Brukergruppe', exact: true }).click()
    const groupPicker = page.getByRole('combobox', { name: 'Velg brukergrupper' })
    await expect(groupPicker).toBeFocused()
    await groupPicker.fill('Søkere')
    await page.getByRole('option', { name: 'Søkere', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Søkere slett' })).toBeVisible()
    await groupPicker.fill('Windowsbrukere')
    await page.getByRole('option', { name: 'Windowsbrukere', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Windowsbrukere slett' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /Vis som ratio/ })).toHaveCount(0)

    await picker.click()
    await expect(page.getByRole('listbox').getByRole('option').first()).toHaveText('Sidevisninger')
    await picker.fill('skjema')
    await page.getByRole('option', { name: 'skjema sendt', exact: true }).click()
    await expect(page.getByRole('button', { name: 'skjema sendt slett' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sidevisninger slett' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    const filterPicker = page.getByRole('combobox', { name: 'Velg filter' })
    const eventFieldLeft = await picker.evaluate((input) => {
      const field = input.closest('.aksel-combobox__wrapper-inner')
      if (!field) throw new Error('Expected the event field wrapper')
      return field.getBoundingClientRect().left
    })
    const filterFieldLeft = await filterPicker.evaluate((input) => {
      const field = input.closest('.aksel-combobox__wrapper-inner')
      if (!field) throw new Error('Expected the filter field wrapper')
      return field.getBoundingClientRect().left
    })
    expect(Math.abs(filterFieldLeft - eventFieldLeft)).toBeLessThanOrEqual(1)
    await page.getByRole('combobox', { name: 'Velg filter' }).fill('Side (URL)')
    await page.getByRole('option', { name: 'Side (URL)', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Verdi', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Kolonne', exact: true })).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Verdi', exact: true }).fill('/soknad')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: '/soknad slett' })).toBeVisible()
    await picker.fill('meny')
    await page.getByRole('option', { name: 'meny åpnet', exact: true }).click()
    await expect(page.getByRole('button', { name: 'meny åpnet slett' })).toBeVisible()
    await page.keyboard.press('Escape')

    for (const width of [375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await picker.scrollIntoViewIfNeeded()
      const bounds = await picker.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(width)
      const fieldLeft = await picker.evaluate((input) => {
        const field = input.closest('.aksel-combobox__wrapper-inner')
        if (!field) throw new Error('Expected the event field wrapper')
        return field.getBoundingClientRect().left
      })
      const filterButton = page.getByRole('button', { name: 'Filter', exact: true })
      const buttonBounds = await filterButton.boundingBox()
      expect(buttonBounds).not.toBeNull()
      expect(Math.abs(buttonBounds!.x - fieldLeft)).toBeLessThanOrEqual(1)
      expect(buttonBounds!.x).toBeGreaterThanOrEqual(0)
      expect(buttonBounds!.height).toBeGreaterThanOrEqual(32)
      const filterValueBounds = await page.getByRole('combobox', { name: 'Verdi', exact: true }).boundingBox()
      expect(filterValueBounds).not.toBeNull()
      expect(buttonBounds!.y + buttonBounds!.height).toBeLessThan(filterValueBounds!.y)
      const iconBounds = await filterButton.locator('svg').boundingBox()
      expect(iconBounds).not.toBeNull()
      expect(Math.abs(iconBounds!.x - fieldLeft)).toBeLessThanOrEqual(2)
      await filterButton.hover()
      const hoveredBounds = await filterButton.boundingBox()
      expect(hoveredBounds).toMatchObject({
        x: buttonBounds!.x,
        width: buttonBounds!.width,
        height: buttonBounds!.height,
      })
    }
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await page.getByRole('combobox', { name: 'Velg filter' }).fill('Sidetittel')
    await page.getByRole('option', { name: 'Sidetittel', exact: true }).click()
    await expect(page.getByText('Sidetittel', { exact: true }).and(page.locator('span'))).toBeVisible()
    await page.reload()
    await expect(page.getByText('Sidetittel', { exact: true }).and(page.locator('span'))).toBeVisible()
    await expect(page.getByRole('button', { name: 'skjema sendt slett' })).toBeVisible()
    await expect(page.getByRole('button', { name: '/soknad slett' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Søkere slett' })).toBeVisible()
    await page.getByRole('button', { name: 'Fjern brukergrupper' }).click()
    await expect(page.getByRole('combobox', { name: 'Velg brukergrupper' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Brukergruppe', exact: true })).toBeVisible()
  })

  test('/grafbygger aligns the top fields and keeps reset beside results', async ({ page }, testInfo) => {
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    await page.route('**/event-properties?*', (route) => route.fulfill({ json: { properties: [] } }))
    await page.goto('/grafbygger?websiteId=site-1')
    const events = page.getByRole('combobox', { name: 'Hendelser', exact: true })
    await events.fill('Sidevisninger')
    await page.getByRole('option', { name: 'Sidevisninger', exact: true }).click()
    await events.press('Escape')
    await page.getByRole('radio', { name: 'Unike besøkende', exact: true }).check()
    const metricSection = page.locator('.sidebar-section').filter({
      has: page.getByText('Vis...', { exact: true }),
    })
    await expect(metricSection.getByRole('button', { name: 'Tilbakestill', exact: true })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Økter / besøk', exact: true }).check()
    await expect(metricSection.getByRole('button', { name: 'Tilbakestill', exact: true })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Unike besøkende', exact: true }).check()
    const reset = page.getByRole('button', { name: 'Tilbakestill alle valg', exact: true })
    await expect(reset).toBeVisible()
    await expect(reset).toHaveAttribute('data-color', 'neutral')
    for (const width of [375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate('window.scrollTo({ top: 0, behavior: "instant" })')
      const resetBounds = await reset.boundingBox()
      expect(resetBounds).not.toBeNull()
      const fieldBounds = []
      for (const name of ['Nettside', 'URL-sti', 'Periode']) {
        const field = page.getByRole('combobox', { name, exact: true })
        const bounds = await field.evaluate((input) => {
          const { x, y, width, height } = (
            input.closest('.aksel-combobox__wrapper-inner') ?? input
          ).getBoundingClientRect()
          return { x, y, width, height }
        })
        if (name !== 'Nettside') expect(bounds.y + bounds.height).toBeLessThan(resetBounds!.y)
        fieldBounds.push(bounds)
      }
      if (width >= 1280) {
        expect(
          Math.max(...fieldBounds.map((bounds) => bounds.y)) - Math.min(...fieldBounds.map((bounds) => bounds.y)),
        ).toBeLessThanOrEqual(1)
      }
      expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(width)
      if (width === 1920) {
        const resultsBounds = await page.getByRole('button', { name: 'Vis resultater', exact: true }).boundingBox()
        expect(resultsBounds).not.toBeNull()
        expect(
          Math.abs(resetBounds!.y + resetBounds!.height / 2 - (resultsBounds!.y + resultsBounds!.height / 2)),
        ).toBeLessThanOrEqual(1)
        expect(resetBounds!.x).toBeGreaterThan(resultsBounds!.x + resultsBounds!.width)
        await page.screenshot({ path: testInfo.outputPath('reset-placement.png') })
      }
    }
    await reset.click()
    const dialog = page.getByRole('dialog', { name: 'Tilbakestill alle valg?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click()
    await expect(reset).toBeFocused()
    await expect(page.getByRole('button', { name: 'Sidevisninger slett' })).toBeVisible()
  })

  test('/grafbygger keeps additional graph settings on the left', async ({ page }, testInfo) => {
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    await page.route('**/event-properties?*', (route) => route.fulfill({ json: { properties: [] } }))
    await page.goto('/grafbygger?websiteId=site-1')
    const settings = page.getByRole('button', { name: 'Tilleggsvalg', exact: true })
    await expect(settings).toHaveCount(1)
    await expect(settings).toHaveAttribute('aria-expanded', 'false')
    await expect(settings.locator('..')).toHaveCSS('border-bottom-width', '0px')
    await expect(page.getByText('Fordelt på...', { exact: true })).toBeVisible()
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate('window.scrollTo({ top: 0, behavior: "instant" })')
      const settingsBounds = await settings.boundingBox()
      const groupingBounds = await page.getByText('Fordelt på...', { exact: true }).boundingBox()
      const previewBounds = await page.getByRole('combobox', { name: 'Periode', exact: true }).boundingBox()
      expect(settingsBounds).not.toBeNull()
      expect(groupingBounds).not.toBeNull()
      expect(previewBounds).not.toBeNull()
      expect(settingsBounds!.y).toBeGreaterThan(groupingBounds!.y + groupingBounds!.height)
      expect(settingsBounds!.x).toBeLessThan(previewBounds!.x)
      expect(settingsBounds!.x + settingsBounds!.width).toBeLessThan(previewBounds!.x)
    }
    await settings.click()
    await expect(settings.locator('..')).toHaveCSS('border-bottom-width', '0px')
    await page.getByRole('checkbox', { name: /^Begrens antall rader/ }).check()
    const limit = page.getByRole('spinbutton', { name: 'Maksimalt antall rader', exact: true })
    await limit.fill('10')
    await limit.blur()
    await page.reload()
    await expect(settings).toHaveAttribute('aria-expanded', 'false')
    await settings.click()
    await page.getByRole('checkbox', { name: /^Begrens antall rader/ }).check()
    await expect(limit).toHaveValue('10')
    for (const width of [375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(width)
    }
    await settings.click()
    await page.evaluate('window.scrollTo({ top: 0, behavior: "instant" })')
    await page.screenshot({ path: testInfo.outputPath('additional-settings-placement.png') })
  })

  test('/grafbygger creates and selects user groups without leaving the graph', async ({ page }) => {
    const group = { id: 73, websiteId: 'site-1', name: 'Søkere', root: null }
    let saved = false
    let failCreate = true
    let criteria: unknown
    let finishSave: () => void = () => {}
    const saveReady = new Promise<void>((resolve) => {
      finishSave = resolve
    })
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    await page.route('**/event-properties?*', (route) => route.fulfill({ json: { properties: [] } }))
    await page.route('**/column-values?*', (route) => route.fulfill({ json: { values: [], scannedDays: 30 } }))
    await page.route(
      (url) => url.pathname === '/api/backend/cohort',
      async (route) => {
        if (route.request().method() === 'POST') {
          expect(route.request().postDataJSON()).toEqual({ websiteId: 'site-1', name: 'Søkere' })
          if (failCreate) {
            failCreate = false
            await route.fulfill({ status: 503, json: { message: 'Kunne ikke opprette brukergruppen' } })
          } else await route.fulfill({ json: group })
        } else await route.fulfill({ json: saved ? [{ ...group, root: criteria }] : [] })
      },
    )
    await page.route('**/api/backend/cohort/73/criteria', async (route) => {
      criteria = route.request().postDataJSON()
      await saveReady
      saved = true
      await route.fulfill({ json: criteria })
    })
    await page.route('**/api/backend/cohort/73', (route) => route.fulfill({ json: { ...group, root: criteria } }))

    await page.goto('/grafbygger?websiteId=site-1')
    await page.getByRole('button', { name: 'Brukergruppe', exact: true }).click()
    const trigger = page.getByRole('button', { name: 'Opprett brukergruppe', exact: true })
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveCSS('padding-left', '0px')
    await expect(trigger).toHaveCSS('padding-right', '0px')
    const groupFieldLeft = await page.getByRole('combobox', { name: 'Velg brukergrupper' }).evaluate((input) => {
      const field = input.closest('.aksel-combobox__wrapper-inner')
      if (!field) throw new Error('Expected the user-group field wrapper')
      return field.getBoundingClientRect().left
    })
    const triggerBounds = await trigger.boundingBox()
    const triggerIconBounds = await trigger.locator('svg').boundingBox()
    expect(triggerBounds).not.toBeNull()
    expect(triggerIconBounds).not.toBeNull()
    expect(Math.abs(triggerBounds!.x - groupFieldLeft)).toBeLessThanOrEqual(1)
    expect(Math.abs(triggerIconBounds!.x - groupFieldLeft)).toBeLessThanOrEqual(2)
    expect(triggerBounds!.height).toBeGreaterThanOrEqual(32)
    await expect(page.getByRole('link', { name: 'Administrer brukergrupper' })).toHaveCount(0)
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Ny brukergruppe' })
    await expect(dialog.getByRole('textbox', { name: 'Navn', exact: true })).toBeFocused()
    await expect(dialog.getByRole('combobox', { name: 'Nettsted' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Tilbake til brukergrupper' })).toHaveCount(0)
    await dialog.getByRole('textbox', { name: 'Navn', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await trigger.click()
    await dialog.getByRole('button', { name: 'Opprett brukergruppe', exact: true }).click()
    await expect(dialog.getByText('Dette må rettes før du kan lagre:')).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Navn', exact: true }).fill('Søkere')
    await dialog.getByRole('combobox', { name: 'Verdi', exact: true }).fill('/soknad')
    await page.keyboard.press('Enter')
    for (const width of [375, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 1000 })
      const bounds = await dialog.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      if (width >= 1024) {
        expect(bounds!.width).toBe(896)
        const fieldBounds = await dialog.getByRole('combobox', { name: 'Egenskap', exact: true }).boundingBox()
        const removeBounds = await dialog.getByRole('button', { name: 'Fjern vilkår', exact: true }).boundingBox()
        expect(fieldBounds).not.toBeNull()
        expect(removeBounds).not.toBeNull()
        expect(Math.abs(removeBounds!.y - fieldBounds!.y)).toBeLessThanOrEqual(1)
      }
    }
    await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click()
    const discard = page.getByRole('alertdialog', { name: 'Forkaste endringene?' })
    await expect(discard).toBeVisible()
    await discard.getByRole('button', { name: 'Fortsett å redigere' }).click()
    await expect(dialog.getByRole('textbox', { name: 'Navn', exact: true })).toHaveValue('Søkere')
    await dialog.getByRole('button', { name: 'Opprett brukergruppe', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Kunne ikke opprette brukergruppen')
    await dialog.getByRole('button', { name: 'Opprett brukergruppe', exact: true }).click()
    await expect
      .poll(() => criteria)
      .toEqual({
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
      })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    finishSave()
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('button', { name: 'Søkere slett' })).toBeVisible()
    await expect(page).toHaveURL(/\/grafbygger\?websiteId=site-1$/)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Søkere slett' })).toBeVisible()
    await trigger.click()
    await dialog.getByRole('textbox', { name: 'Navn', exact: true }).fill('Forkast meg')
    await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click()
    await discard.getByRole('button', { name: 'Forkast', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Søkere slett' })).toBeVisible()
    await expect(page).toHaveURL(/\/grafbygger\?websiteId=site-1$/)
  })

  test('/grafbygger creates and selects sidegroups without leaving the graph', async ({ page }) => {
    const requests: unknown[] = []
    const queries: string[] = []
    const group = { id: 73, websiteId: 'site-1', name: 'Hjelpesider', startWith: ['/hjelp'] }
    let saved = false
    let finishSave: () => void = () => {}
    const saveReady = new Promise<void>((resolve) => {
      finishSave = resolve
    })
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    await page.route('**/event-properties?*', (route) => route.fulfill({ json: { properties: [] } }))
    await page.route(
      (url) => url.pathname === '/api/backend/sidegroup',
      async (route) => {
        if (route.request().method() === 'GET') return route.fulfill({ json: saved ? [group] : [] })
        requests.push(route.request().postDataJSON())
        if (requests.length === 1)
          return route.fulfill({ status: 503, json: { message: 'Kunne ikke lagre sidegruppen' } })
        await saveReady
        saved = true
        await route.fulfill({ json: group })
      },
    )
    await page.route('**/api/bigquery/estimate', (route) => route.fulfill({ json: { totalBytesProcessedGB: '0' } }))
    await page.route(
      (url) => url.pathname === '/api/bigquery',
      (route) => {
        queries.push(route.request().postDataJSON().query)
        return route.fulfill({ json: { data: [{ antall: 1 }] } })
      },
    )

    try {
      await page.goto('/grafbygger?websiteId=site-1')
      await page.getByRole('combobox', { name: 'Hendelser', exact: true }).click()
      await page.getByRole('option', { name: 'Sidevisninger', exact: true }).click()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Filter', exact: true }).click()
      await page.getByRole('combobox', { name: 'Velg filter' }).fill('Sidegruppe')
      await page.getByRole('option', { name: 'Sidegruppe', exact: true }).click()
      const createButton = page.getByRole('button', { name: 'Opprett sidegruppe', exact: true })
      const dialog = page.getByRole('dialog', { name: 'Ny sidegruppe', exact: true })
      const sidegroupBounds = await page.getByRole('combobox', { name: 'Sidegruppe', exact: true }).boundingBox()
      expect(sidegroupBounds).not.toBeNull()
      for (const name of ['Filter', 'Brukergruppe']) {
        const actionBounds = await page.getByRole('button', { name, exact: true }).boundingBox()
        expect(actionBounds).not.toBeNull()
        expect(actionBounds!.y + actionBounds!.height).toBeLessThan(sidegroupBounds!.y)
      }
      await createButton.click()
      await expect(dialog.getByRole('textbox', { name: 'Navn', exact: true })).toBeFocused()
      await dialog.getByRole('textbox', { name: 'Navn', exact: true }).click()
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(createButton).toBeFocused()

      await createButton.click()
      await dialog.getByRole('textbox', { name: 'Navn', exact: true }).fill('Halvferdig')
      await page.keyboard.press('Escape')
      const confirmation = page.getByRole('alertdialog', { name: 'Forkaste endringene?' })
      await expect(confirmation).toBeVisible()
      await confirmation.getByRole('button', { name: 'Forkast', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      expect(requests).toHaveLength(0)

      await createButton.click()
      await expect(dialog.getByRole('combobox', { name: 'Nettsted' })).toHaveCount(0)
      await dialog.getByRole('textbox', { name: 'Navn', exact: true }).fill('Hjelpesider')
      await dialog.getByRole('combobox', { name: 'Samsvar', exact: true }).selectOption('startWith')
      await dialog.getByRole('textbox', { name: 'URL-sti', exact: true }).fill('/hjelp')
      await dialog.getByRole('button', { name: 'Legg til', exact: true }).click()
      for (const width of [375, 768, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1000 })
        const bounds = await dialog.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(width)
      }

      await dialog.getByRole('button', { name: 'Opprett sidegruppe', exact: true }).click()
      await expect(dialog.getByText('Kunne ikke lagre sidegruppen', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: 'Navn', exact: true })).toHaveValue('Hjelpesider')
      await dialog.getByRole('button', { name: 'Opprett sidegruppe', exact: true }).click()
      await expect.poll(() => requests.length).toBe(2)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
      await expect(confirmation).toHaveCount(0)
      finishSave()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('combobox', { name: 'Sidegruppe', exact: true })).toHaveValue('73')
      await expect(createButton).toBeFocused()
      await expect(page).toHaveURL(/\/grafbygger\?websiteId=site-1/)
      expect(page.context().pages()).toHaveLength(1)
      expect(requests[1]).toMatchObject({ websiteId: 'site-1', name: 'Hjelpesider', startWith: ['/hjelp'] })

      await page.getByRole('button', { name: 'Vis resultater', exact: true }).click()
      await expect.poll(() => queries.length).toBe(1)
      expect(queries[0]).toContain("STARTS_WITH(LOWER(url_path), LOWER('/hjelp'))")
      await page.reload()
      await expect(page.getByRole('combobox', { name: 'Sidegruppe', exact: true })).toHaveValue('73')
    } finally {
      finishSave()
    }
  })

  test('/grafbygger validates empty events only when results are requested', async ({ page }) => {
    const queries: string[] = []
    let estimates = 0
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    await page.route('**/event-properties?*', (route) =>
      route.fulfill({ json: { properties: [{ eventName: 'skjema sendt' }] } }),
    )
    await page.route('**/api/bigquery/estimate', (route) => {
      estimates++
      return route.fulfill({ json: { totalBytesProcessedGB: '0' } })
    })
    await page.route(
      (url) => url.pathname === '/api/bigquery',
      (route) => {
        queries.push(route.request().postDataJSON().query)
        return route.fulfill({ json: { data: [{ antall: 1 }] } })
      },
    )
    await page.goto('/grafbygger?websiteId=site-1')
    const picker = page.getByRole('combobox', { name: 'Hendelser', exact: true })
    const error = page.getByRole('status', { name: 'Hva vil du måle?' })
    const showResults = page.getByRole('button', { name: 'Vis resultater', exact: true })
    await expect(picker).not.toHaveAttribute('placeholder')
    await expect(error).toHaveCount(0)

    await expect(page.getByText('Velg hva du vil måle: sidevisninger eller en egen hendelse.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Bruk sidevisninger', exact: true })).toHaveCount(0)
    for (const width of [375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await showResults.click()
      await expect(error).toBeVisible()
      await expect(picker).toBeFocused()
      await expect(picker).not.toHaveAttribute('aria-invalid', 'true')
      await expect(error.getByRole('button', { name: 'Bruk sidevisninger' })).toBeVisible()
      expect(queries).toHaveLength(0)
      expect(estimates).toBe(0)
      expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(width)
    }

    await picker.fill('skjema')
    await showResults.click()
    await expect(error).toBeVisible()
    expect(estimates).toBe(0)
    await picker.click()
    await page.getByRole('option', { name: 'skjema sendt', exact: true }).click()
    await expect(error).toHaveCount(0)
    await expect(picker).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('button', { name: 'Sidevisninger slett' })).toHaveCount(0)
    await showResults.click()
    await expect.poll(() => queries.length).toBe(1)
    expect(queries[0]).toContain("event_name IN ('skjema sendt')")
    expect(queries[0]).not.toContain('AND FALSE')
    expect(queries[0]).not.toContain('event_type = 1 OR')

    await page.getByRole('button', { name: 'skjema sendt slett' }).click()
    await showResults.click()
    await expect(error).toBeVisible()
    expect(queries).toHaveLength(1)
    await page.reload()
    await expect(picker).not.toHaveAttribute('placeholder')
    await expect(page.getByRole('button', { name: 'Sidevisninger slett' })).toHaveCount(0)
    await expect(error).toHaveCount(0)
    const estimatesBeforeNudge = estimates
    await showResults.click()
    await expect(error).toBeVisible()
    expect(queries).toHaveLength(1)
    expect(estimates).toBe(estimatesBeforeNudge)
    await error.getByRole('button', { name: 'Bruk sidevisninger', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sidevisninger slett' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bruk sidevisninger', exact: true })).toHaveCount(0)
    await expect(picker).not.toHaveAttribute('aria-invalid', 'true')
    expect(queries).toHaveLength(1)
    expect(estimates).toBe(estimatesBeforeNudge)
    await showResults.click()
    await expect.poll(() => queries.length).toBe(2)
    expect(queries[1]).toContain('event_type IN (1)')
    expect(queries[1]).not.toContain('AND FALSE')
  })

  test('/grafbygger allows exact event names while suggestions load', async ({ page }) => {
    await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
    let releaseSuggestions: () => void = () => {}
    const suggestionsReady = new Promise<void>((resolve) => {
      releaseSuggestions = resolve
    })
    await page.route('**/event-properties?*', async (route) => {
      await suggestionsReady
      await route.fulfill({
        json: { properties: [{ eventName: 'søknad fullført' }, { eventName: 'meny åpnet' }] },
      })
    })
    try {
      await page.goto('/grafbygger?websiteId=site-1')
      const picker = page.getByRole('combobox', { name: 'Hendelser', exact: true })
      await expect(picker).toBeVisible()
      await expect(page.getByText('Henter egne hendelser… Du kan også skrive inn hendelsesnavnet.')).toHaveCount(0)
      await picker.fill('søknad fullført')
      await picker.press('Enter')
      await expect(page.getByRole('button', { name: 'søknad fullført slett' })).toBeVisible()
      releaseSuggestions()
      await expect(page.getByText('Henter egne hendelser… Du kan også skrive inn hendelsesnavnet.')).toHaveCount(0)
      await picker.click()
      await expect(page.getByRole('option', { name: 'søknad fullført', exact: true })).toHaveCount(1)
      await expect(page.getByRole('option', { name: 'meny åpnet', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: 'Alle egne hendelser', exact: true })).toHaveCount(0)
      await page.reload()
      await expect(page.getByRole('button', { name: 'søknad fullført slett' })).toBeVisible()
    } finally {
      releaseSuggestions()
    }
  })

  for (const response of [
    { name: 'empty', status: 200, json: { properties: [] } },
    { name: 'failed', status: 503, json: { error: 'Unavailable' } },
    { name: 'malformed', status: 200, json: {} },
  ]) {
    test(`/grafbygger allows exact event names with ${response.name} suggestions`, async ({ page }) => {
      await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: MOCK_WEBSITES } }))
      await page.route('**/event-properties?*', (route) =>
        route.fulfill({ status: response.status, json: response.json }),
      )
      await page.goto('/grafbygger?websiteId=site-1')
      const picker = page.getByRole('combobox', { name: 'Hendelser', exact: true })
      await expect(picker).toBeVisible()
      if (response.name !== 'empty') {
        await expect(
          page.getByText('Det oppstod en feil ved lasting av data. Forsøk å laste siden inn på nytt.'),
        ).toBeVisible()
      }
      await expect(page.getByText('Skriv inn hendelsesnavnet for å legge til en egen hendelse.')).toHaveCount(0)
      await picker.fill('skjema fullført')
      await page.getByRole('option', { name: /legg til.*skjema fullført/i }).click()
      await expect(page.getByRole('button', { name: 'skjema fullført slett' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Alle egne hendelser slett' })).toHaveCount(0)
      await page.reload()
      await expect(page.getByRole('button', { name: 'skjema fullført slett' })).toBeVisible()
    })
  }

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
    const previewButton = page.getByRole('button', { name: 'Vis gruppe', exact: true })
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
    const preview = dialog.getByRole('region', { name: 'Gruppestørrelse', exact: true })
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
