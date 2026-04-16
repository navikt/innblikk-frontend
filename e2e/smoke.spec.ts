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
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    // Something in the nav/layout should be visible
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('/grafbygger loads and shows the page heading', async ({ page }) => {
    await page.route('**/api/bigquery/websites', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: MOCK_WEBSITES }) }),
    )
    await page.goto('/grafbygger')
    await expect(page.getByRole('heading', { name: /grafbyggeren/i })).toBeVisible({ timeout: 10_000 })
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
})
