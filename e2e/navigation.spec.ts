import { expect, test } from '@playwright/test'

const eventName = 'nedtrekksliste + valg endret'
const parameterName = 'valg + type'
const website = { id: 'site-1', name: 'Test Site', domain: 'test.nav.no', teamId: 'team-1', createdAt: '2024-01-01' }

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      let json: unknown = {}
      if (path === '/api/bigquery/websites') json = { data: [website] }
      else if (path.endsWith('/event-series'))
        json = {
          data: [
            { time: '2026-11-01', count: 5 },
            { time: '2026-11-02', count: 8 },
          ],
        }
      else if (path.endsWith('/event-properties')) json = { properties: [{ propertyName: parameterName, total: 13 }] }
      else if (path.endsWith('/event-parameter-values')) json = { values: [{ value: 'Eksempel', count: 13 }] }
      else if (path.endsWith('/events')) json = { events: [{ name: eventName, count: 13 }] }
      else if (path.endsWith('/event-latest')) json = { events: [] }
      else if (path === '/api/backend/cohort' || path === '/api/backend/sidegroup') json = []
      else if (path === '/api/backend/user-settings') json = { settings: {} }
      await route.fulfill({ json })
    },
  )
  await page.route('https://cdn.nav.no/**', (route) => route.abort())
  await page.route('https://survey.skyra.no/**', (route) => route.abort())
})

test('event pages support real browser history, reload, sidebar destinations and breadcrumbs without document reloads', async ({
  page,
}) => {
  const search = new URLSearchParams({
    websiteId: website.id,
    period: 'last_7_days',
    urlPath: '/arbeid',
    metricType: 'visitors',
  })
  await page.goto(`/utforsk-hendelser?${search.toString()}#analysis`)
  await expect(page.getByRole('navigation', { name: 'Brødsmulesti' })).toHaveCount(0)
  await page.evaluate(() => {
    window.navigationTest = 'same-document'
  })

  await page.getByRole('link', { name: 'Utforsk', exact: true }).click()
  await expect(page).toHaveURL(/\/utforsk-hendelser\/hendelse\?/)
  await expect(page.getByRole('heading', { name: `Hendelse: ${eventName}` })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('event')).toBe(eventName)
  const breadcrumb = page.getByRole('navigation', { name: 'Brødsmulesti' })
  await expect(breadcrumb.getByText(eventName, { exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('link', { name: 'Utforsk', exact: true }).click()
  await expect(page).toHaveURL(/\/utforsk-hendelser\/hendelse\/parameter\?/)
  await expect(page.getByRole('heading', { name: parameterName, exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.navigationTest)).toBe('same-document')

  await page.goBack()
  await expect(page).toHaveURL(/\/utforsk-hendelser\/hendelse\?/)
  await page.goBack()
  await expect(page).toHaveURL(/\/utforsk-hendelser\?/)
  await page.goForward()
  await page.goForward()
  await expect(page.getByRole('heading', { name: parameterName, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: parameterName, exact: true })).toBeVisible()

  await breadcrumb.getByRole('link', { name: eventName, exact: true }).click()
  await expect(page).toHaveURL(/\/utforsk-hendelser\/hendelse\?/)
  await page
    .getByRole('navigation', { name: 'Hovedmeny' })
    .getByRole('link', { name: 'Egendefinerte hendelser', exact: true })
    .click()
  await expect(page).toHaveURL(/\/utforsk-hendelser\?/)
  const destination = new URL(page.url())
  expect(destination.searchParams.has('event')).toBe(false)
  expect(destination.searchParams.has('parameter')).toBe(false)
  expect(destination.searchParams.get('websiteId')).toBe(website.id)
  expect(destination.searchParams.get('period')).toBe('last_7_days')
  expect(destination.searchParams.get('urlPath')).toBe('/arbeid')
  expect(destination.searchParams.get('metricType')).toBe('visitors')
  await expect(page.getByRole('navigation', { name: 'Brødsmulesti' })).toHaveCount(0)
})

test('legacy event URLs accept percent-encoded spaces and preserve their hash', async ({ page }) => {
  const search = new URLSearchParams({ websiteId: website.id, period: 'last_7_days', event: eventName })
    .toString()
    .replaceAll('+', '%20')
  await page.goto(`/utforsk-hendelser?${search}#legacy`)
  await expect(page).toHaveURL(/\/utforsk-hendelser\/hendelse\?/)
  await expect(page.getByRole('heading', { name: `Hendelse: ${eventName}` })).toBeVisible()
  expect(new URL(page.url()).hash).toBe('#legacy')
})

test('breadcrumbs use actual fit, default to the parent link, and make vertical overflow opt-in', async ({ page }) => {
  const search = new URLSearchParams({
    websiteId: website.id,
    period: 'last_7_days',
    event: eventName,
    parameter: parameterName,
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/utforsk-hendelser/hendelse/parameter?${search.toString()}`)
  const nav = page.getByRole('navigation', { name: 'Brødsmulesti' })
  const levels = nav.getByRole('listitem')
  await expect(levels).toHaveCount(3)

  // Long labels can require the compact layout even on a wide screen.
  const longSearch = new URLSearchParams(search)
  longSearch.set('event', 'et svært langt hendelsesnavn '.repeat(8))
  await page.goto(`/utforsk-hendelser/hendelse/parameter?${longSearch.toString()}`)
  await expect(levels).toHaveCount(1)
  await page.goto(`/utforsk-hendelser/hendelse/parameter?${search.toString()}`)
  await expect(levels).toHaveCount(3)

  await page.setViewportSize({ width: 320, height: 900 })
  await expect(levels).toHaveCount(1)
  await expect(nav.getByRole('link', { name: eventName, exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const parentUrl = new URL((await nav.getByRole('link').getAttribute('href')) ?? '', page.url())
  expect(parentUrl.pathname).toBe('/utforsk-hendelser/hendelse')
  expect(parentUrl.searchParams.has('parameter')).toBe(false)
  const parentLink = nav.getByRole('link')
  expect(await parentLink.evaluate((element) => getComputedStyle(element).textDecorationLine)).toBe('none')
  await parentLink.locator('svg').click()
  await expect(page).toHaveURL(/\/utforsk-hendelser\/hendelse\?/)
  await page.goBack()
  await expect(levels).toHaveCount(1)

  await page.evaluate(() => {
    const flags = JSON.parse(localStorage.getItem('innblikk_feature_flags') || '{}') as Record<string, boolean>
    localStorage.setItem('innblikk_feature_flags', JSON.stringify({ ...flags, breadcrumbs_vertical_overflow: true }))
    window.dispatchEvent(new CustomEvent('featureFlagsChange'))
  })
  await expect(levels).toHaveCount(3)
  await expect
    .poll(async () =>
      levels.evaluateAll((elements) => new Set(elements.map((element) => element.getBoundingClientRect().y)).size),
    )
    .toBe(3)
  const narrowPositions = await levels.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().y),
  )
  expect(narrowPositions[1]).toBeGreaterThan(narrowPositions[0])
  expect(narrowPositions[2]).toBeGreaterThan(narrowPositions[1])

  await page.setViewportSize({ width: 1280, height: 900 })
  await expect
    .poll(async () =>
      levels.evaluateAll((elements) => new Set(elements.map((element) => element.getBoundingClientRect().y)).size),
    )
    .toBe(1)

  // Even with the experiment enabled, a short trail that fits stays horizontal on mobile.
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(`/utforsk-hendelser/hendelse?websiteId=${website.id}&period=last_7_days&event=A`)
  await expect(levels).toHaveCount(2)
  await expect
    .poll(async () =>
      levels.evaluateAll((elements) => new Set(elements.map((element) => element.getBoundingClientRect().y)).size),
    )
    .toBe(1)

  // Aksel's reduced-motion animation reset uses the conservative parent fallback.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/utforsk-hendelser/hendelse/parameter?${search.toString()}`)
  await expect(levels).toHaveCount(1)
  await expect(nav.getByRole('link', { name: eventName, exact: true })).toBeVisible()
})

test('accidental browser Back keeps a dirty editor until discard is confirmed', async ({ page }) => {
  await page.goto(`/brukergrupper?websiteId=${website.id}`)
  await page.getByRole('button', { name: 'Ny brukergruppe', exact: true }).click()
  await expect(page).toHaveURL(/\/brukergrupper\/ny\?/)
  const name = page.getByRole('textbox', { name: /^Navn/ })
  await name.fill('Ulagret gruppe')
  await page.evaluate(() => history.back())
  const dialog = page.getByRole('alertdialog', { name: 'Forkaste endringene?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Fortsett å redigere' }).click()
  await expect(name).toHaveValue('Ulagret gruppe')
  await expect(page).toHaveURL(/\/brukergrupper\/ny\?/)
  await page.evaluate(() => history.back())
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Forkast', exact: true }).click()
  await expect(page).toHaveURL(/\/brukergrupper\?/)
  await page.goForward()
  await expect(page).toHaveURL(/\/brukergrupper\/ny\?/)
})
