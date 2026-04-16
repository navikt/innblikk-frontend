import { test, expect } from '@playwright/test'

/**
 * Smoke tests — verify core pages load without crashing.
 * Not testing deep functionality, just that the app boots
 * and key routes are reachable.
 */

test.describe('App smoke tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    // Something in the nav/layout should be visible
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('/grafbygger loads and shows the page heading', async ({ page }) => {
    await page.goto('/grafbygger')
    await expect(page.getByRole('heading', { name: /grafbyggeren/i })).toBeVisible({ timeout: 10_000 })
  })

  test('/grafbygger renders the website picker', async ({ page }) => {
    await page.goto('/grafbygger')
    // WebsitePicker renders a label and a select/combobox
    await expect(page.getByRole('combobox').first()).toBeVisible({ timeout: 10_000 })
  })
})
