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

test.describe('Grafbygger alfa', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/column-values?*', (route) => route.fulfill({ json: { values: [], scannedDays: 30 } }))
  })
  test('/grafbygger-alfa keeps the initial event controls minimal', async ({ page }) => {
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
    await page.goto('/grafbygger-alfa?websiteId=site-1')
    const heading = page.getByRole('heading', { level: 1, name: 'Grafbyggeren', exact: true })
    await expect(heading).toBeVisible()
    await expect(heading.locator('..').getByText('Beta', { exact: true })).toHaveCount(0)
    await expect(heading.locator('..').getByText('Alfa', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Prøv den nye grafbyggeren', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Grafbyggeren er i alfa', exact: true })).toBeVisible()
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
    const filterTrigger = page.getByRole('button', { name: 'Filter', exact: true })
    const triggerBeforeOpen = await filterTrigger.boundingBox()
    await filterTrigger.click()
    const filterPicker = page.getByRole('combobox', { name: 'Velg filter' })
    const filterDialog = page.getByRole('dialog', { name: 'Velg filter', exact: true })
    await expect(filterDialog).toBeVisible()
    await expect(filterPicker).toBeFocused()
    await expect(filterTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(await filterTrigger.boundingBox()).toEqual(triggerBeforeOpen)
    await expect(filterDialog.getByRole('listbox')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Avbryt filtervalg' })).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Velg filter' }).fill('Side (URL)')
    await filterDialog.getByRole('option', { name: /^Side \(URL\) –/ }).click()
    await expect(filterTrigger).toBeFocused()
    const pageFilter = page.getByRole('region', { name: 'Side (URL)', exact: true })
    await expect(pageFilter.getByRole('combobox', { name: 'Side (URL): sammenligning' })).toHaveValue('STARTS_WITH')
    await expect(page.getByRole('combobox', { name: 'Verdi', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Kolonne', exact: true })).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Verdi', exact: true }).fill('/soknad')
    await page.keyboard.press('Enter')
    await expect(pageFilter.locator('.aksel-combobox__selected-options--no-bg')).toHaveText('/soknad')
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
    await page
      .getByRole('dialog', { name: 'Velg filter', exact: true })
      .getByRole('option', { name: /^Sidetittel –/ })
      .click()
    await expect(page.getByText('Sidetittel', { exact: true }).and(page.locator('span'))).toBeVisible()
    await page.reload()
    await expect(page.getByText('Sidetittel', { exact: true }).and(page.locator('span'))).toBeVisible()
    await expect(page.getByRole('button', { name: 'skjema sendt slett' })).toBeVisible()
    await expect(pageFilter.locator('.aksel-combobox__selected-options--no-bg')).toHaveText('/soknad')
    await expect(page.getByRole('button', { name: 'Søkere slett' })).toBeVisible()
    await page.getByRole('button', { name: 'Fjern brukergrupper' }).click()
    await expect(page.getByRole('combobox', { name: 'Velg brukergrupper' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Brukergruppe', exact: true })).toBeVisible()
  })

  test('/grafbygger-alfa creates and selects sidegroups without leaving the graph', async ({ page }) => {
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
      await page.goto('/grafbygger-alfa?websiteId=site-1')
      await page.getByRole('combobox', { name: 'Hendelser', exact: true }).click()
      await page.getByRole('option', { name: 'Sidevisninger', exact: true }).click()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Filter', exact: true }).click()
      await page.getByRole('combobox', { name: 'Velg filter' }).fill('Sidegruppe')
      await page
        .getByRole('dialog', { name: 'Velg filter', exact: true })
        .getByRole('option', { name: /^Sidegruppe –/ })
        .click()
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
      await expect(page).toHaveURL(/\/grafbygger-alfa\?websiteId=site-1/)
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
})
