import { expect, test } from '@playwright/test'

const website = {
  id: 'site-1',
  name: 'Test Site',
  domain: 'test.nav.no',
  teamId: 'team-1',
  createdAt: '2024-01-01T00:00:00Z',
}
const patternResult = {
  summary: { totalSessions: 100, patternSessions: 15, repeatedCycleSessions: 12, ambiguousSessions: 2 },
  patterns: [
    {
      id: 'loop',
      type: 'alternation',
      pages: ['/oversikt', '/soknad'],
      sessions: 12,
      share: 0.12,
      medianRepetitions: 2,
      trend: [{ date: '2026-10-28', sessions: 12 }],
      before: [{ path: '/', sessions: 8 }],
      after: [],
    },
    {
      id: 'return',
      type: 'quick-return',
      pages: ['/vilkar', '/hjelp'],
      sessions: 8,
      share: 0.08,
      medianRepetitions: 1,
      trend: [],
      before: [],
      after: [],
    },
  ],
  generatedSql: 'SELECT 1',
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ json: { data: [] } }),
  )
  await page.route('**/api/user/me', (route) =>
    route.fulfill({ status: 503, json: { message: 'Not available in test' } }),
  )
  await page.route('**/api/bigquery/websites', (route) => route.fulfill({ json: { data: [website] } }))
  await page.route('**/api/bigquery/navigation-patterns', (route) => route.fulfill({ json: patternResult }))
  await page.route('**/api/bigquery/navigation-patterns/estimate', (route) =>
    route.fulfill({
      json: {
        queryStats: { totalBytesProcessed: 1024, totalBytesProcessedGB: '0.00', estimatedCostUSD: '0.000' },
        requiresConfirmation: false,
        maximumBytesBilled: String(500 * 1024 ** 3),
      },
    }),
  )
})

test('Alfa page loads without a banner or menu entry, analyses and expands findings with keyboard', async ({
  page,
}) => {
  await page.goto('/navigasjonsmonstre?websiteId=site-1&period=last_7_days')
  await expect(page.getByRole('heading', { name: 'Gjentatt navigasjon', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hvor går folk i ring?' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Filtrene er endret' })).toHaveCount(0)
  await expect(page.getByText('Alfa', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Navigasjonsmønstre er i beta' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Gjentatt navigasjon', exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Nettside', exact: true })).toBeVisible()
  await expect(page.getByText('test.nav.no', { exact: true }).first()).toBeVisible()
  const pendingRequest = page.waitForRequest('**/api/bigquery/navigation-patterns')
  await page.getByRole('button', { name: 'Analyser', exact: true }).click()
  const request = await pendingRequest
  expect(request.postDataJSON()).toMatchObject({ websiteId: 'site-1' })
  expect(request.postDataJSON()).not.toHaveProperty('urlPath')
  await expect(page.getByRole('heading', { name: 'Mønstre å undersøke' })).toBeVisible()
  const finding = page.getByRole('button', { name: /Frem og tilbake/ })
  await expect(finding.getByText('Minst to hele runder mellom de samme to sidene. Ingen tidsgrense.')).toBeVisible()
  await expect(
    page
      .getByRole('button', { name: /Rask retur/ })
      .getByText('Tilbake til samme side etter høyst 10 sekunder på siden imellom. Én retur er nok.'),
  ).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Mønstertype', exact: true })).toHaveValue('all')
  await expect(page.getByRole('combobox', { name: 'Sorter etter', exact: true })).toHaveValue('reach')
  const sessions = page.getByRole('group', { name: 'Analyserte økter' })
  await expect(sessions.getByText('2 økter utelatt: usikker rekkefølge.')).toBeVisible()
  await expect(sessions.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText(/Visningsfiltrene koster|CSV tar med alle mønstre|statistisk signifikans/)).toHaveCount(0)
  await finding.focus()
  await page.keyboard.press('Enter')
  await expect(finding).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { name: 'Berørte økter per dag' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '2026-10-28' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Navigasjonsflyt', exact: true }).first()).toHaveAttribute(
    'href',
    '/brukerreiser?websiteId=site-1&period=last_7_days&urlPath=%2Foversikt',
  )
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Last ned CSV' }).click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/^gjentatt_navigasjon_.*\.csv$/)
})

test('mobile findings fit the viewport and changing period hides stale results', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/navigasjonsmonstre?websiteId=site-1&period=last_7_days')
  await expect(page.getByText('test.nav.no', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Analyser', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mønstre å undersøke' })).toBeVisible()
  await page.getByRole('button', { name: /Frem og tilbake/ }).click()
  await expect(page.getByRole('heading', { name: 'Berørte økter per dag' })).toBeVisible()
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(390)
  await page.getByRole('combobox', { name: 'Periode', exact: true }).selectOption('last_28_days')
  await expect(page.getByRole('heading', { name: 'Filtrene er endret' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mønstre å undersøke' })).toHaveCount(0)
})

test('the experiment is listed under Alfa, not Beta, in settings', async ({ page }) => {
  await page.goto('/innstillinger')
  await expect(page.getByRole('heading', { name: 'Funksjoner i beta', exact: true })).toBeVisible()
  const alfa = page.locator('#alpha')
  await expect(alfa.getByRole('heading', { name: 'Gjentatt navigasjon er i alfa' })).toBeVisible()
  await expect(alfa.getByText('Ingen funksjoner i alfa akkurat nå.')).toHaveCount(0)
  const link = alfa.getByRole('link', { name: 'Åpne gjentatt navigasjon' })
  await expect(link).toHaveAttribute('href', '/navigasjonsmonstre')
  await expect(page.locator('#beta').getByRole('link', { name: 'Åpne gjentatt navigasjon' })).toHaveCount(0)
  await link.click()
  await expect(page.getByRole('heading', { name: 'Gjentatt navigasjon', exact: true })).toBeVisible()
  await expect(page.getByText('Alfa', { exact: true })).toBeVisible()
})

test('analysis can begin on a selected page without requiring session entry there', async ({ page }) => {
  await page.route('**/api/bigquery/navigation-patterns', (route) =>
    route.fulfill({
      json: {
        ...patternResult,
        patterns: patternResult.patterns.map((pattern) => ({ ...pattern, pages: ['/hello', pattern.pages[1]] })),
      },
    }),
  )
  await page.goto('/navigasjonsmonstre?websiteId=site-1&period=last_7_days&urlPath=%2Fhello')
  await expect(page.getByText('test.nav.no', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Analyseområde', exact: true })).toHaveValue('from-first-visit')
  await expect(page.getByRole('combobox', { name: 'Startside', exact: true })).toBeVisible()
  await expect(page.getByText('Bare mønstre fra valgt side og tilbake.')).toHaveCount(0)
  const pendingRequest = page.waitForRequest('**/api/bigquery/navigation-patterns')
  await page.getByRole('button', { name: 'Analyser', exact: true }).click()
  expect((await pendingRequest).postDataJSON()).toMatchObject({ urlPath: '/hello', pathScope: 'from-first-visit' })
  await expect(page.getByRole('heading', { name: 'Mønstre å undersøke' })).toBeVisible()
  for (const type of [/Frem og tilbake/, /Rask retur/]) {
    const sequence = page.getByRole('button', { name: type }).getByRole('list')
    await expect(sequence.getByRole('listitem').first()).toHaveText('/hello')
    await expect(sequence.getByRole('listitem').last()).toHaveText('→/hello')
  }
  await expect(page).toHaveURL(/pathScope=from-first-visit/)
  await page.getByRole('combobox', { name: 'Analyseområde', exact: true }).selectOption('anywhere')
  await expect(page.getByText('Også mønstre uten den valgte siden tas med.')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Filtrene er endret' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Inneholder valgt side', exact: true })).toBeAttached()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(390)
})

test('contains-page mode permits the selected page at any position in each pattern', async ({ page }) => {
  await page.route('**/api/bigquery/navigation-patterns', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ urlPath: '/hello', pathScope: 'anywhere' })
    return route.fulfill({
      json: {
        ...patternResult,
        patterns: [
          { ...patternResult.patterns[0], pages: ['/a', '/hello'] },
          { ...patternResult.patterns[1], pages: ['/a', '/hello'] },
          { ...patternResult.patterns[0], id: 'triangle', type: 'cycle', pages: ['/a', '/b', '/hello'] },
          { ...patternResult.patterns[0], id: 'square', type: 'cycle', pages: ['/a', '/b', '/c', '/hello'] },
        ],
      },
    })
  })
  await page.goto('/navigasjonsmonstre?websiteId=site-1&period=last_7_days&urlPath=%2Fhello&pathScope=anywhere')
  await expect(page.getByText('test.nav.no', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Analyseområde', exact: true })).toHaveValue('anywhere')
  await expect(page.getByRole('option', { name: 'Inneholder valgt side' })).toBeAttached()
  await page.getByRole('button', { name: 'Analyser', exact: true }).click()
  const findings = page.getByRole('button', { name: /Frem og tilbake|Rask retur|Rundgang/ })
  await expect(findings).toHaveCount(4)
  for (const finding of await findings.all()) {
    const sequence = finding.getByRole('list')
    await expect(sequence).toContainText('/hello')
    await expect(sequence.getByRole('listitem').first()).toHaveText('/a')
  }
  await expect(page).toHaveURL(/pathScope=anywhere/)
})

test('high-cost analysis cannot execute until the user accepts the dry-run estimate', async ({ page }) => {
  const bytes = 50 * 1024 ** 3
  let executions = 0
  await page.route('**/api/bigquery/navigation-patterns/estimate', (route) =>
    route.fulfill({
      json: {
        queryStats: { totalBytesProcessed: bytes, totalBytesProcessedGB: '50.00', estimatedCostUSD: '0.305' },
        requiresConfirmation: true,
        maximumBytesBilled: String(500 * 1024 ** 3),
      },
    }),
  )
  await page.route('**/api/bigquery/navigation-patterns', (route) => {
    executions++
    expect(route.request().postDataJSON()).toMatchObject({ confirmedBytes: bytes })
    return route.fulfill({ json: patternResult })
  })
  await page.goto('/navigasjonsmonstre?websiteId=site-1&period=last_28_days')
  await expect(page.getByText('test.nav.no', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Analyser', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bekreft stor spørring' })
  await expect(dialog).toBeVisible()
  expect(executions).toBe(0)
  await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(executions).toBe(0)
  await page.getByRole('button', { name: 'Analyser', exact: true }).click()
  await dialog.getByRole('button', { name: 'Ja, kjør spørringen' }).click()
  await expect(page.getByRole('heading', { name: 'Mønstre å undersøke' })).toBeVisible()
  expect(executions).toBe(1)
})

test('Rundgang is independently filterable and recurrence sorting is local', async ({ page }) => {
  const cycle = {
    ...patternResult.patterns[0],
    id: 'cycle',
    type: 'cycle',
    pages: ['/a', '/b', '/c'],
    sessions: 9,
    share: 0.09,
    trend: [
      { date: '2026-10-28', sessions: 3 },
      { date: '2026-10-29', sessions: 3 },
      { date: '2026-10-30', sessions: 3 },
    ],
  }
  let requests = 0
  await page.route('**/api/bigquery/navigation-patterns', (route) => {
    requests++
    return route.fulfill({ json: { ...patternResult, patterns: [...patternResult.patterns, cycle] } })
  })
  await page.goto('/navigasjonsmonstre?websiteId=site-1&period=last_7_days')
  await expect(page.getByText('test.nav.no', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Analyser', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mønstre å undersøke' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Mønstertype', exact: true }).selectOption('cycle')
  await expect(page.getByRole('button', { name: /Rundgang/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Frem og tilbake/ })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Mønstertype', exact: true }).selectOption('all')
  await page.getByRole('combobox', { name: 'Sorter etter', exact: true }).selectOption('days')
  await expect(page.getByRole('button', { name: /Rundgang/ })).toBeVisible()
  await page.getByRole('combobox', { name: 'Minst antall økter', exact: true }).selectOption('10')
  await expect(page.getByRole('button', { name: /Rundgang/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Frem og tilbake/ })).toBeVisible()
  expect(requests).toBe(1)
})
