import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { preserveSharedAnalysisParams } from '../../../shared/lib/analysisNavigation.ts'
import { analyticsPages } from '../model/analyticsNavigation.ts'

export const useChartLayoutOriginal = (hideSidebar: boolean) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(!hideSidebar)
  const navigate = useNavigate()

  const handleChartChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedId = event.target.value
      const page = analyticsPages.find((p) => p.id === selectedId)
      if (page) {
        void navigate(preserveSharedAnalysisParams(page.href, window.location.search))
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
