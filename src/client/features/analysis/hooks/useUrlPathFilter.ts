import { useMemo, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { normalizeUrlToPath } from '../../../shared/lib/utils.ts'
import { useWebsiteMatching } from '../../../shared/hooks/useWebsiteMatching.ts'
import type { PendingSwitchData } from '../model/types.ts'
import { parseMultipleUrls, hasMultipleValues } from '../utils/urlPathFilter.ts'

export const useUrlPathFilter = (
  urlPaths: string[],
  onUrlPathsChange: (paths: string[]) => void,
  selectedWebsiteDomain?: string,
) => {
  const uniqueUrlPaths = useMemo(() => Array.from(new Set(urlPaths)), [urlPaths])

  const [comboInputValue, setComboInputValue] = useState('')

  // Bulk URL modal
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false)
  const [urlPasteInput, setUrlPasteInput] = useState('')
  const [urlPasteError, setUrlPasteError] = useState('')

  // Website switch confirmation modal
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false)
  const [pendingSwitchData, setPendingSwitchData] = useState<PendingSwitchData | null>(null)

  // Missing leading slash modal
  const [isMissingSlashModalOpen, setIsMissingSlashModalOpen] = useState(false)
  const [pendingMissingSlash, setPendingMissingSlash] = useState<string | null>(null)

  const isSelectingRef = useRef(false)

  const [searchParams] = useSearchParams()
  const { findMatchingWebsite, normalizeDomain: normalizeDomainHelper } = useWebsiteMatching()

  const normalizeDomain = useCallback(
    (domain: string) =>
      normalizeDomainHelper
        ? normalizeDomainHelper(domain)
        : domain
            .toLowerCase()
            .replace(/^(https?:\/\/)?(www\.)?/, '')
            .split('/')[0],
    [normalizeDomainHelper],
  )

  const handleSiteSwitch = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (website: any, path: string) => {
      const newParams = new URLSearchParams(searchParams)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      newParams.set('websiteId', website.id as string)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      newParams.set('domain', website.domain as string)
      if (path && path !== '/') {
        newParams.set('urlPath', path)
      } else {
        newParams.delete('urlPath')
      }
      window.location.search = newParams.toString()
    },
    [searchParams],
  )

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const pastedText = e.clipboardData.getData('text')

      if (!hasMultipleValues(pastedText) && pastedText.match(/^https?:\/\//)) {
        e.preventDefault()

        const match = await findMatchingWebsite(pastedText)
        const currentDomain = selectedWebsiteDomain ? normalizeDomain(selectedWebsiteDomain) : null

        if (match && currentDomain) {
          const matchDomain = normalizeDomain(match.website.domain)
          if (matchDomain !== currentDomain) {
            setPendingSwitchData({
              website: match.website,
              path: match.path,
              originalUrl: pastedText,
            })
            setIsSwitchModalOpen(true)
            return
          }
        }

        try {
          const url = new URL(pastedText)
          const path = decodeURIComponent(url.pathname)
          if (!uniqueUrlPaths.includes(path)) {
            onUrlPathsChange([...uniqueUrlPaths, path])
            setComboInputValue('')
          }
        } catch {
          const path = pastedText
          if (!uniqueUrlPaths.includes(path)) {
            onUrlPathsChange([...uniqueUrlPaths, path])
            setComboInputValue('')
          }
        }
        return
      }

      if (hasMultipleValues(pastedText)) {
        e.preventDefault()

        const { paths, invalid } = parseMultipleUrls(pastedText, selectedWebsiteDomain, normalizeDomain)

        if (invalid.length > 0) {
          setUrlPasteInput(pastedText)
          setUrlPasteError(
            `Noen URL-er tilhører ikke valgt nettside eller er ugyldige. Sjekk: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`,
          )
          setIsUrlModalOpen(true)
          return
        }

        if (paths.length > 0) {
          const uniqueNewPaths = new Set([...uniqueUrlPaths, ...paths])
          onUrlPathsChange(Array.from(uniqueNewPaths))
          setComboInputValue('')
        }
      }
    },
    [findMatchingWebsite, selectedWebsiteDomain, normalizeDomain, uniqueUrlPaths, onUrlPathsChange],
  )

  const handleBulkAddUrls = useCallback(() => {
    if (!urlPasteInput.trim()) {
      setIsUrlModalOpen(false)
      return
    }

    const { paths, invalid } = parseMultipleUrls(urlPasteInput, selectedWebsiteDomain, normalizeDomain)

    if (invalid.length > 0) {
      setUrlPasteError(
        `Noen URL-er tilhører ikke valgt nettside (${selectedWebsiteDomain}) eller er ugyldige. Sjekk: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`,
      )
      return
    }

    const uniqueNewPaths = new Set([...uniqueUrlPaths, ...paths])
    onUrlPathsChange(Array.from(uniqueNewPaths))

    setUrlPasteInput('')
    setUrlPasteError('')
    setIsUrlModalOpen(false)
  }, [urlPasteInput, selectedWebsiteDomain, normalizeDomain, uniqueUrlPaths, onUrlPathsChange])

  const handleToggleSelected = useCallback(
    (option: string, isSelected: boolean) => {
      const rawOption = option === '/ (forsiden)' ? '/' : option
      isSelectingRef.current = true

      if (isSelected) {
        const normalized = normalizeUrlToPath(rawOption)
        if (normalized && !normalized.startsWith('/')) {
          setPendingMissingSlash(normalized)
          setIsMissingSlashModalOpen(true)
          setComboInputValue('')
          setTimeout(() => {
            isSelectingRef.current = false
          }, 100)
          return
        }
        if (normalized && !uniqueUrlPaths.includes(normalized)) {
          onUrlPathsChange([...uniqueUrlPaths, normalized])
        }
      } else {
        let normalized = normalizeUrlToPath(rawOption)
        if (normalized && !normalized.startsWith('/')) {
          normalized = '/' + normalized
        }
        const newPaths = uniqueUrlPaths.filter((p) => p !== rawOption && p !== normalized)
        onUrlPathsChange(newPaths)
      }

      setComboInputValue('')
      setTimeout(() => {
        isSelectingRef.current = false
      }, 100)
    },
    [uniqueUrlPaths, onUrlPathsChange],
  )

  const handleBlur = useCallback(() => {
    setTimeout(async () => {
      const trimmedValue = comboInputValue.trim()
      if (trimmedValue && !isSelectingRef.current) {
        if (trimmedValue.match(/^https?:\/\//)) {
          const match = await findMatchingWebsite(trimmedValue)
          const currentDomain = selectedWebsiteDomain ? normalizeDomain(selectedWebsiteDomain) : null
          if (match && currentDomain) {
            const matchDomain = normalizeDomain(match.website.domain)
            if (matchDomain !== currentDomain) {
              setPendingSwitchData({
                website: match.website,
                path: match.path,
                originalUrl: trimmedValue,
              })
              setIsSwitchModalOpen(true)
              return
            }
          }
        }
        const normalized = normalizeUrlToPath(trimmedValue)
        if (normalized && !normalized.startsWith('/')) {
          setPendingMissingSlash(normalized)
          setIsMissingSlashModalOpen(true)
          setComboInputValue('')
          return
        }
        if (normalized && !uniqueUrlPaths.includes(normalized)) {
          onUrlPathsChange([...uniqueUrlPaths, normalized])
        }
        setComboInputValue('')
      }
    }, 150)
  }, [comboInputValue, findMatchingWebsite, selectedWebsiteDomain, normalizeDomain, uniqueUrlPaths, onUrlPathsChange])

  // Modal actions
  const closeBulkModal = useCallback(() => {
    setIsUrlModalOpen(false)
    setUrlPasteError('')
    setUrlPasteInput('')
  }, [])

  const closeSwitchModal = useCallback(() => {
    setIsSwitchModalOpen(false)
    setPendingSwitchData(null)
    setComboInputValue('')
  }, [])

  const confirmSwitch = useCallback(() => {
    if (pendingSwitchData) {
      handleSiteSwitch(pendingSwitchData.website, pendingSwitchData.path)
    }
    closeSwitchModal()
  }, [pendingSwitchData, handleSiteSwitch, closeSwitchModal])

  const declineSwitch = useCallback(() => {
    if (pendingSwitchData?.path) {
      let path = pendingSwitchData.path
      if (path && !path.startsWith('/')) {
        path = '/' + path
      }
      if (path && !uniqueUrlPaths.includes(path)) {
        onUrlPathsChange([...uniqueUrlPaths, path])
      }
    }
    closeSwitchModal()
  }, [pendingSwitchData, uniqueUrlPaths, onUrlPathsChange, closeSwitchModal])

  const closeMissingSlashModal = useCallback(() => {
    setIsMissingSlashModalOpen(false)
    setPendingMissingSlash(null)
  }, [])

  const confirmMissingSlash = useCallback(() => {
    if (pendingMissingSlash && !uniqueUrlPaths.includes('/' + pendingMissingSlash)) {
      onUrlPathsChange([...uniqueUrlPaths, '/' + pendingMissingSlash])
    }
    closeMissingSlashModal()
  }, [pendingMissingSlash, uniqueUrlPaths, onUrlPathsChange, closeMissingSlashModal])

  return {
    uniqueUrlPaths,
    comboInputValue,
    setComboInputValue,

    // Bulk modal
    isUrlModalOpen,
    urlPasteInput,
    setUrlPasteInput,
    urlPasteError,
    setUrlPasteError,
    handleBulkAddUrls,
    closeBulkModal,

    // Switch modal
    isSwitchModalOpen,
    pendingSwitchData,
    confirmSwitch,
    declineSwitch,
    closeSwitchModal,

    // Missing slash modal
    isMissingSlashModalOpen,
    pendingMissingSlash,
    confirmMissingSlash,
    closeMissingSlashModal,

    // Handlers
    handlePaste,
    handleToggleSelected,
    handleBlur,
  }
}
