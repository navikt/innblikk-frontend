const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

// Make cache keys environment-aware to prevent dev/prod conflicts
const getHostPrefix = () => window.location.hostname.replace(/\./g, '_')

export const WEBSITES_CACHE_KEY = `umami_websites_cache_${getHostPrefix()}`
export const SELECTED_WEBSITE_CACHE_KEY = `umami_selected_website_${getHostPrefix()}`

export const saveToLocalStorage = <T>(key: string, data: T) => {
  try {
    const item = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(key, JSON.stringify(item))
  } catch (error) {
    console.error('Error saving to localStorage:', error)
  }
}

export const getFromLocalStorage = <T>(key: string, maxAgeMs: number = CACHE_EXPIRY_MS): T | null => {
  try {
    const itemStr = localStorage.getItem(key)
    if (!itemStr) return null

    const item = JSON.parse(itemStr)
    const now = Date.now()

    if (now - item.timestamp > maxAgeMs) {
      localStorage.removeItem(key)
      return null
    }

    return item.data as T
  } catch (error) {
    console.error('Error reading from localStorage:', error)
    return null
  }
}
