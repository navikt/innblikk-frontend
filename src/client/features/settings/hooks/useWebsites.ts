import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Website, GroupedWebsite, FilterType } from '../model'
import { fetchWebsites } from '../api'
import { groupWebsites } from '../utils'

export function useWebsites() {
  const [data, setData] = useState<Website[] | null>(null)
  const [filteredData, setFilteredData] = useState<GroupedWebsite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let isMounted = true

    fetchWebsites()
      .then((websites) => {
        if (isMounted) {
          setData(websites)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to fetch websites'))
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Group websites by base name using useMemo
  const groupedData = useMemo(() => {
    if (!data) return []
    return groupWebsites(data)
  }, [data])

  return {
    data,
    groupedData,
    filteredData,
    setFilteredData,
    isLoading,
    error,
  }
}

export function useWebsiteFilters(groupedData: GroupedWebsite[], setFilteredData: (data: GroupedWebsite[]) => void) {
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [filter, setFilter] = useState<FilterType>('all')

  // Apply filters
  useEffect(() => {
    let filtered = groupedData

    // Apply environment filter
    switch (filter) {
      case 'prod-only':
        filtered = filtered.filter((g) => g.prod && !g.dev)
        break
      case 'dev-only':
        filtered = filtered.filter((g) => g.dev && !g.prod)
        break
      case 'both':
        filtered = filtered.filter((g) => g.prod && g.dev)
        break
      // 'all' shows everything
    }

    // Apply search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase()
      filtered = filtered.filter((g) => {
        // Check if search matches ID exactly
        if (g.prod?.id.toLowerCase() === searchLower || g.dev?.id.toLowerCase() === searchLower) {
          return true
        }
        // Check name and domain
        const nameMatches = g.baseName.toLowerCase().includes(searchLower)
        const domainMatches = g.domain?.toLowerCase().includes(searchLower)
        return nameMatches || domainMatches
      })
    }

    setFilteredData(filtered)
  }, [groupedData, searchQuery, filter, setFilteredData])

  return {
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
  }
}

export function useWebsiteModal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const pendingSporingskode = searchParams.get('sporingskode')

  const openModal = (id: string) => {
    setSearchParams({ sporingskode: id })
  }

  const closeModal = () => {
    setSearchParams({})
  }

  return {
    pendingSporingskode,
    openModal,
    closeModal,
  }
}
