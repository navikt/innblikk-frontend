const ANALYTICS_ID_KEY = 'innblikk_analytics_id'

export function getOrCreateAnalyticsId(): string {
  let id = localStorage.getItem(ANALYTICS_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(ANALYTICS_ID_KEY, id)
  }
  return id
}
