import { useEffect, useState } from 'react'

/**
 * Warns about unsaved edits when the tab is closed and when an in-app link is clicked.
 * BrowserRouter has no navigation blocker, so link clicks are intercepted instead:
 * `leaveTarget` holds the intercepted destination until the caller confirms or cancels.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    if (!dirty) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.origin !== window.location.origin) return
      const destination = anchor.pathname + anchor.search + anchor.hash
      if (destination === window.location.pathname + window.location.search + window.location.hash) return
      e.preventDefault()
      e.stopPropagation()
      setLeaveTarget(destination)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])

  return { leaveTarget, requestLeave: setLeaveTarget, cancelLeave: () => setLeaveTarget(null) }
}
