import { useEffect, useRef, useState } from 'react'

/**
 * Sticky localStorage-backed state: restores the last persisted value on mount,
 * writes every change back. Never auto-cleared — only explicit `clear()` calls
 * (wired to the two-step «Tilbakestill alle valg» button) wipe it, so a page
 * refresh mid-work loses nothing.
 *
 * If `disable()` returns true (e.g. a dashboard "rediger" link carried URL
 * params), the URL params win for this load and nothing is read or written.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  disable?: () => boolean,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => {
    if (disable?.()) return initialValue
    try {
      const raw = window.localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const disabled = useRef(disable?.() ?? false)

  useEffect(() => {
    if (disabled.current) return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage full or unavailable — persistence is best-effort, never block the UI.
    }
  }, [key, value])

  const clear = () => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }

  return [value, setValue, clear]
}
