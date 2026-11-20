import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** Replace view configuration without adding a Back-button step or resetting scroll. */
export function useReplaceSearchParams() {
  const navigate = useNavigate()
  const location = useLocation()
  const latestLocation = useRef(location)
  const mounted = useRef(true)
  useLayoutEffect(() => {
    latestLocation.current = location
  }, [location])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return useCallback(
    (params: URLSearchParams, hash?: string) => {
      // An old request must never rewrite the destination after leaving its page.
      if (!mounted.current || latestLocation.current.pathname !== location.pathname) return
      const query = params.toString()
      const search = query ? `?${query}` : ''
      const nextHash = hash ?? latestLocation.current.hash
      if (search === latestLocation.current.search && nextHash === latestLocation.current.hash) return
      void navigate(
        { pathname: location.pathname, search, hash: nextHash },
        { replace: true, preventScrollReset: true },
      )
    },
    [location.pathname, navigate],
  )
}
