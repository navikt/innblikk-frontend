import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'

const activeGuards = new Set<symbol>()

export function hasUnsavedChanges(): boolean {
  return activeGuards.size > 0
}

export function useUnsavedChangesGuard(dirty: boolean) {
  const bypassRef = useRef(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        dirty &&
        !bypassRef.current &&
        (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
      [dirty],
    ),
  )

  useEffect(() => {
    if (!dirty) return
    const guard = Symbol()
    activeGuards.add(guard)
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      activeGuards.delete(guard)
      window.removeEventListener('beforeunload', handler)
    }
  }, [dirty])

  const runWithoutBlocking = (action: () => void) => {
    bypassRef.current = true
    try {
      action()
    } finally {
      bypassRef.current = false
    }
  }

  const requestLeave = (action: () => void) => setPendingAction(() => action)
  const cancelLeave = () => {
    if (blocker.state === 'blocked') blocker.reset()
    setPendingAction(null)
  }
  const confirmLeave = () => {
    if (blocker.state === 'blocked') blocker.proceed()
    else if (pendingAction) runWithoutBlocking(pendingAction)
    setPendingAction(null)
  }

  return {
    isLeaveBlocked: blocker.state === 'blocked' || pendingAction !== null,
    requestLeave,
    cancelLeave,
    confirmLeave,
    runWithoutBlocking,
  }
}
