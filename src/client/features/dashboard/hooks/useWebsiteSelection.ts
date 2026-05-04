import { useCallback, useEffect, useRef } from 'react'
import { getFromLocalStorage, saveToLocalStorage, SELECTED_WEBSITE_CACHE_KEY } from '../storage/localStorage.ts'
import type { Website } from '../model/types.ts'

interface UseWebsiteSelectionProps {
  websites: Website[]
  selectedWebsite: Website | null
  onWebsiteChange: (website: Website | null) => void
  disableUrlUpdate?: boolean
}

export const useWebsiteSelection = ({
  websites,
  selectedWebsite,
  onWebsiteChange,
  disableUrlUpdate = false,
}: UseWebsiteSelectionProps) => {
  const initialSelectionHandled = useRef<boolean>(false)

  const updateUrlWithWebsiteId = useCallback((website: Website | null) => {
    const url = new URL(window.location.href)

    if (website && website.id) {
      url.searchParams.set('websiteId', website.id)
    } else {
      url.searchParams.delete('websiteId')
    }

    window.history.pushState({}, '', url.toString())
  }, [])

  const applySelection = useCallback(
    (website: Website | null, updateUrl: boolean = true) => {
      onWebsiteChange(website)

      if (updateUrl && !disableUrlUpdate) {
        updateUrlWithWebsiteId(website)
      }

      if (website) {
        saveToLocalStorage(SELECTED_WEBSITE_CACHE_KEY, website)
      } else {
        localStorage.removeItem(SELECTED_WEBSITE_CACHE_KEY)
      }
    },
    [disableUrlUpdate, onWebsiteChange, updateUrlWithWebsiteId],
  )

  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search)
      const websiteIdFromUrl = urlParams.get('websiteId')

      if (websiteIdFromUrl) {
        const website = websites.find((w) => w.id === websiteIdFromUrl)
        if (website && (!selectedWebsite || website.id !== selectedWebsite.id)) {
          onWebsiteChange(website)
          saveToLocalStorage(SELECTED_WEBSITE_CACHE_KEY, website)
        }
      } else if (selectedWebsite) {
        onWebsiteChange(null)
        localStorage.removeItem(SELECTED_WEBSITE_CACHE_KEY)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [websites, selectedWebsite, onWebsiteChange])

  useEffect(() => {
    if (initialSelectionHandled.current) return

    const urlParams = new URLSearchParams(window.location.search)
    const websiteIdFromUrl = urlParams.get('websiteId')

    if (websiteIdFromUrl) {
      if (websites.length === 0) return

      const website = websites.find((w) => w.id === websiteIdFromUrl)
      if (website && (!selectedWebsite || website.id !== selectedWebsite.id)) {
        applySelection(website)
      }

      initialSelectionHandled.current = true
      return
    }

    const cachedWebsite = getFromLocalStorage<Website>(SELECTED_WEBSITE_CACHE_KEY)
    if (cachedWebsite && !selectedWebsite) {
      applySelection(cachedWebsite)
    }

    initialSelectionHandled.current = true
  }, [websites, selectedWebsite, applySelection])

  return { handleWebsiteChange: applySelection }
}
