import { useEffect, useState } from 'react'
import { getFromLocalStorage, saveToLocalStorage, WEBSITES_CACHE_KEY } from '../storage/localStorage.ts'
import type { Website } from '../model/types.ts'
import { fetchWebsites } from '../api/bigquery.ts'

export const useWebsites = () => {
  const [websites, setWebsites] = useState<Website[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isLoaded, setIsLoaded] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded) return

    setIsLoading(true)

    const cachedWebsites = getFromLocalStorage<Website[]>(WEBSITES_CACHE_KEY)

    if (cachedWebsites && cachedWebsites.length > 0) {
      setWebsites(cachedWebsites)
      setIsLoaded(true)
      setIsLoading(false)
      return
    }

    fetchWebsites()
      .then((websitesData) => {
        const uniqueWebsites = websitesData.filter(
          (website, index, self) => index === self.findIndex((w) => w.name === website.name),
        )

        setWebsites(uniqueWebsites)
        saveToLocalStorage(WEBSITES_CACHE_KEY, uniqueWebsites)
        setIsLoaded(true)
      })
      .catch((error) => {
        console.error('Error fetching websites:', error)
        setError('Feil ved lasting av nettsteder.')
        setIsLoaded(true)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [isLoaded])

  return { websites, setWebsites, isLoading, isLoaded, error }
}
