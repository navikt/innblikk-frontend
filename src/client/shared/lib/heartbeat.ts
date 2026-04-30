const HEARTBEAT_KEY = 'innblikk_heartbeat_last'
const ONE_DAY_MS = 86_400_000

export function touchUserSettings(): void {
  const last = Number(localStorage.getItem(HEARTBEAT_KEY) ?? 0)
  if (Date.now() - last < ONE_DAY_MS) return

  fetch('/api/backend/user-settings/touch', { method: 'POST' })
    .then((res) => {
      if (res.ok) localStorage.setItem(HEARTBEAT_KEY, String(Date.now()))
    })
    .catch(() => {})
}
