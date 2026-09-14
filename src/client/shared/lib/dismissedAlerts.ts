/**
 * Dismiss-once, never-show-again storage for informational banners/alerts.
 *
 * Distinct from featureFlags (user *preferences*, synced to the backend):
 * dismissals are device-local facts («user has seen and closed this notice»)
 * with no reason to follow the user across browsers.
 */

const DISMISSED_ALERTS_KEY = 'innblikk_dismissed_alerts'

const readDismissed = (): string[] => {
  try {
    const raw = localStorage.getItem(DISMISSED_ALERTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const isAlertDismissed = (id: string): boolean => readDismissed().includes(id)

export const dismissAlert = (id: string): void => {
  try {
    const dismissed = readDismissed()
    if (!dismissed.includes(id)) {
      localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify([...dismissed, id]))
    }
  } catch {
    // localStorage unavailable (private mode etc.) — banner simply reappears next load.
  }
}
