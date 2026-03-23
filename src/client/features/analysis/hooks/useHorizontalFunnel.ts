import type React from 'react'
import { useState, useCallback } from 'react'

export const useHorizontalFunnel = (websiteId?: string) => {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)

  const handleUrlClick = useCallback(
    (e: React.MouseEvent, urlPath: string) => {
      if (!websiteId) return
      e.stopPropagation()
      setSelectedUrl(urlPath)
    },
    [websiteId],
  )

  const closeModal = useCallback(() => {
    setSelectedUrl(null)
  }, [])

  return {
    selectedUrl,
    handleUrlClick,
    closeModal,
  }
}
