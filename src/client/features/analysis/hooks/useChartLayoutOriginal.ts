import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyticsPages } from '../model/analyticsNavigation.ts'
import { SHARED_PARAMS } from '../model/types.ts'

export const useChartLayoutOriginal = (hideSidebar: boolean) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(!hideSidebar)
  const navigate = useNavigate()

  const handleChartChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedId = event.target.value
      const page = analyticsPages.find((p) => p.id === selectedId)
      if (page) {
        const currentParams = new URLSearchParams(window.location.search)
        const preservedParams = new URLSearchParams()

        SHARED_PARAMS.forEach((param) => {
          const value = currentParams.get(param)
          if (value) {
            preservedParams.set(param, value)
          }
        })

        const queryString = preservedParams.toString()
        const targetUrl = queryString ? `${page.href}?${queryString}` : page.href
        void navigate(targetUrl)
      }
    },
    [navigate],
  )

  // Trigger window resize event when sidebar toggles to help charts resize
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 100)
    return () => clearTimeout(timer)
  }, [isSidebarOpen])

  return {
    isSidebarOpen,
    setIsSidebarOpen,
    handleChartChange,
  }
}
