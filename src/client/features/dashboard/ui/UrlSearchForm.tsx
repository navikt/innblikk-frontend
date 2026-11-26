import {
  Search,
  Alert,
  BodyShort,
  Link,
  ReadMore,
  List,
  Skeleton,
  UNSAFE_Combobox,
  Button,
  HStack,
  Label,
} from '@navikt/ds-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MagnifyingGlassIcon } from '@navikt/aksel-icons'
import { useNavigate } from 'react-router-dom'
import type { Website } from '../model/types.ts'
import { fetchWebsites } from '../api/bigquery.ts'
import { PROD_TEAM_ID } from '../../settings/model/constants.ts'
import { DEFAULT_WEBSITE_ID, normalizeDomain } from '../../../shared/lib/domain.ts'
import { columnValuesSuggestions } from '../../cohortmanager/hooks/useColumnValueSuggestions.ts'

interface UrlSearchFormProps {
  children?: React.ReactNode
}

function parseSearchUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    return new URL(
      trimmed.startsWith('/')
        ? `https://www.nav.no${trimmed}`
        : /^https?:\/\//i.test(trimmed)
          ? trimmed
          : `https://${trimmed}`,
    )
  } catch {
    return null
  }
}

function matchWebsite(websites: Website[], url: URL, pathOnly: boolean): Website | undefined {
  if (pathOnly) return websites.find((website) => website.id === DEFAULT_WEBSITE_ID.prod)
  const domain = normalizeDomain(url.hostname)
  return (
    websites.find((website) => normalizeDomain(website.domain) === domain) ??
    websites
      .filter((website) => domain.endsWith(`.${normalizeDomain(website.domain)}`))
      .sort((a, b) => normalizeDomain(b.domain).length - normalizeDomain(a.domain).length)[0]
  )
}

function UrlSearchForm({ children }: UrlSearchFormProps) {
  const navigate = useNavigate()
  const inputId = useId()
  const [filteredData, setFilteredData] = useState<Website[] | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingInputValue = useRef<string | null>(null)
  const moveCaretToEnd = useRef(false)
  const [lookupWebsites, setLookupWebsites] = useState<Website[]>([])
  const websitesRequest = useRef<Promise<Website[]> | null>(null)
  const [akselSearchQuery, setAkselSearchQuery] = useState<string>('')
  const [alertVisible, setAlertVisible] = useState<boolean>(false)
  const [hasLoadedData, setHasLoadedData] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
  const isDevEnvironment = hostname.includes('.dev.nav.no')
  const isProdEnvironment = hostname.includes('.nav.no') && !isDevEnvironment
  const normalizedAkselSearchQuery = akselSearchQuery.trim().toLowerCase()
  const visibleWebsites = filteredData?.filter((item) => {
    if (!normalizedAkselSearchQuery) return true
    return (
      item.domain.toLowerCase().includes(normalizedAkselSearchQuery) ||
      item.name.toLowerCase().includes(normalizedAkselSearchQuery)
    )
  })
  const hasVisibleWebsites = (visibleWebsites?.length ?? 0) > 0
  const showNoMatches = hasLoadedData && !hasVisibleWebsites && !isLoading

  const inputValue = searchQuery
  const searchUrl = parseSearchUrl(inputValue)
  const pathOnly = inputValue.trim().startsWith('/')
  const matchedWebsite = searchUrl ? matchWebsite(lookupWebsites, searchUrl, pathOnly) : undefined
  const { values, loading, failed, load } = columnValuesSuggestions.useColumnValueSuggestions(
    matchedWebsite?.id,
    'url_path',
  )

  useEffect(() => {
    if (matchedWebsite) load()
  }, [matchedWebsite, load])

  useLayoutEffect(() => {
    if (moveCaretToEnd.current) {
      moveCaretToEnd.current = false
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(searchQuery.length, searchQuery.length)
    }
  }, [searchQuery])

  const trimmedInput = inputValue.trim().split(/[?#]/, 1)[0]
  const pathStart = trimmedInput.indexOf('/', trimmedInput.indexOf('://') >= 0 ? trimmedInput.indexOf('://') + 3 : 0)
  const urlPrefix = pathOnly ? '' : pathStart >= 0 ? trimmedInput.slice(0, pathStart) : trimmedInput
  const suggestions = matchedWebsite
    ? values.filter((path) => pathOnly || path !== '/').map((path) => `${urlPrefix}${path}`)
    : (filteredData ?? []).map((website) => website.domain)
  const filteredSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion !== inputValue.trim() && suggestion.toLocaleLowerCase().includes(trimmedInput.toLocaleLowerCase()),
  )
  const isLoadingSuggestions = isLoading || loading

  const navigateToTrafficAnalysis = (website: Website, path?: string) => {
    void navigate(
      `/trafikkanalyse?websiteId=${website.id}&domain=${website.domain}${path === undefined ? '' : `&urlPath=${encodeURIComponent(path)}`}`,
    )
  }

  const loadWebsitesData = async (): Promise<Website[]> => {
    // If we already have data, return it
    if (hasLoadedData) return lookupWebsites
    if (websitesRequest.current) return websitesRequest.current

    setIsLoading(true)

    const request = (async () => {
      try {
        const websitesData = await fetchWebsites()

        const environmentFilteredWebsites = websitesData.filter((website: Website) => {
          if (website.id === DEFAULT_WEBSITE_ID.prod) return true
          if (isProdEnvironment) {
            return website.teamId === PROD_TEAM_ID
          }

          if (isDevEnvironment) {
            return website.teamId !== PROD_TEAM_ID
          }

          return true
        })

        // Filter out exactly "nav.no" if desired, though logic below handles matching
        const filteredItems = environmentFilteredWebsites.filter((item: Website) => item.domain !== 'nav.no')

        filteredItems.sort((a, b) => {
          if (a.id === DEFAULT_WEBSITE_ID.prod) return -1
          if (b.id === DEFAULT_WEBSITE_ID.prod) return 1
          return a.domain.localeCompare(b.domain, 'nb')
        })

        // Deduplicate by domain
        const uniqueWebsites = filteredItems.filter(
          (website: Website, index: number, self: Website[]) =>
            index === self.findIndex((w) => w.domain === website.domain),
        )

        setFilteredData(uniqueWebsites)
        setLookupWebsites(uniqueWebsites)
        setHasLoadedData(true)
        setIsLoading(false)
        return uniqueWebsites
      } catch (error) {
        console.error('Error fetching data:', error)
        setIsLoading(false)
        websitesRequest.current = null
        throw error
      }
    })()
    websitesRequest.current = request
    return request
  }

  const showWebsiteLoadError = () => setSearchError('Kunne ikke hente nettsider. Prøv igjen.')

  const handleReadMoreToggle = (open: boolean) => {
    if (open && !hasLoadedData) {
      void loadWebsitesData().catch(showWebsiteLoadError)
    }
  }

  const handleSearchChange = (value: string) => {
    if (pendingInputValue.current === null) setIsSuggestionsOpen(true)
    const nextValue = pendingInputValue.current ?? value
    pendingInputValue.current = null
    setSearchQuery(nextValue)
    setAlertVisible(false)
    setSearchError(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!inputValue.trim()) {
      setSearchError('Du må sette inn en URL-adresse.')
      return
    }
    setSearchError(null)
    setAlertVisible(false)

    const urlObj = parseSearchUrl(inputValue)
    if (!urlObj) {
      setSearchError('Ugyldig URL-format.')
      return
    }

    try {
      const websites = await loadWebsitesData()
      const matchedWebsite = matchWebsite(websites, urlObj, pathOnly)

      if (matchedWebsite) {
        navigateToTrafficAnalysis(
          matchedWebsite,
          pathOnly || pathStart >= 0 ? decodeURIComponent(urlObj.pathname) : undefined,
        )
      } else {
        setAlertVisible(true)
      }
    } catch (error) {
      setSearchError('Ugyldig URL-format eller feil ved oppslag.')
      console.error('Error:', error)
    }
  }

  return (
    <div>
      <form role="search" onSubmit={handleSubmit}>
        <div>
          <div
            onFocus={(event) => {
              if (event.target instanceof HTMLInputElement) setIsSuggestionsOpen(true)
              if (!hasLoadedData && !event.currentTarget.contains(event.relatedTarget)) {
                void loadWebsitesData().catch(showWebsiteLoadError)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.defaultPrevented) event.stopPropagation()
            }}
            onKeyDownCapture={(event) => {
              if (event.target instanceof HTMLInputElement) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') setIsSuggestionsOpen(true)
                if (event.key === 'Escape') setIsSuggestionsOpen(false)
              }
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                event.target instanceof HTMLInputElement &&
                !event.target.getAttribute('aria-activedescendant')
              ) {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.closest('form')?.requestSubmit()
              }
            }}
            onKeyUpCapture={(event) => {
              if (
                event.key === 'Enter' &&
                event.target instanceof HTMLInputElement &&
                !event.target.getAttribute('aria-activedescendant')
              ) {
                event.stopPropagation()
              }
            }}
            onMouseDownCapture={(event) => {
              if ((event.target as HTMLElement).closest('[role="listbox"], .aksel-combobox__button-toggle-list')) {
                event.preventDefault()
              }
            }}
            onClickCapture={(event) => {
              if (event.target instanceof HTMLInputElement) setIsSuggestionsOpen(true)
              else if ((event.target as HTMLElement).closest('.aksel-combobox__button-toggle-list')) {
                setIsSuggestionsOpen((open) => !open)
              }
            }}
          >
            <Label id={`${inputId}-label`} htmlFor={inputId} className="block mb-2">
              Søk eller lim inn URL for å se webstatistikk
            </Label>
            <HStack
              wrap={false}
              align="start"
              className="url-search-form__controls"
              data-suggestion-mode={matchedWebsite ? 'paths' : 'websites'}
            >
              <UNSAFE_Combobox
                ref={inputRef}
                id={inputId}
                aria-labelledby={`${inputId}-label`}
                label="Søk eller lim inn URL for å se webstatistikk"
                description={matchedWebsite ? 'URL-stier' : 'Nettsider / apper'}
                hideLabel
                className="flex-1 min-w-0"
                value={searchQuery}
                selectedOptions={[]}
                options={suggestions}
                filteredOptions={filteredSuggestions}
                isListOpen={isSuggestionsOpen && (isLoadingSuggestions || filteredSuggestions.length > 0)}
                onChange={handleSearchChange}
                onClear={(event) => {
                  if (event.type === 'blur') {
                    pendingInputValue.current = searchQuery
                    setIsSuggestionsOpen(false)
                  }
                  if (event.type === 'keydown' && 'key' in event && event.key === 'Escape') {
                    pendingInputValue.current = ''
                    setIsSuggestionsOpen(false)
                  }
                }}
                onToggleSelected={(value, selected) => {
                  pendingInputValue.current = selected ? value : ''
                  const selectedUrl = parseSearchUrl(value)
                  setIsSuggestionsOpen(
                    Boolean(selected && selectedUrl && value.replace(/^https?:\/\//i, '').indexOf('/') < 0),
                  )
                  moveCaretToEnd.current = true
                  setSearchError(null)
                  setAlertVisible(false)
                }}
                error={searchError}
                isLoading={isLoadingSuggestions}
                isMultiSelect={false}
                clearButton
              />
              <Button
                type="submit"
                className="url-search-form__submit"
                aria-label="Søk"
                icon={<MagnifyingGlassIcon aria-hidden />}
              />
            </HStack>
            {failed && (
              <BodyShort size="small" className="mt-2">
                Kunne ikke hente URL-forslag. Du kan fortsatt skrive inn adressen selv.
              </BodyShort>
            )}
          </div>
          {alertVisible && (
            <Alert style={{ marginTop: '20px' }} variant="warning">
              Denne siden har ikke fått støtte for Innblikk enda. Fortvil ikke — kontakt Team ResearchOps for å få lagt
              den til :)
            </Alert>
          )}
        </div>
        {children}
        <ReadMore
          size="small"
          style={{ marginTop: '24px' }}
          header="Hvilke nettsider støttes?"
          onOpenChange={handleReadMoreToggle}
        >
          <div role="search" aria-label="Søk i Aksel" style={{ maxWidth: '460px', marginBottom: '16px' }}>
            <Search
              label="Hvilke nettsider støttes?"
              variant="simple"
              size="small"
              value={akselSearchQuery}
              onChange={setAkselSearchQuery}
              onClear={() => setAkselSearchQuery('')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                }
              }}
            />
          </div>
          {isLoading ? (
            <List as="ul" style={{ marginBottom: '16px' }}>
              {[...Array(3)].map((_, index) => (
                <List.Item key={`skeleton-${index}`}>
                  <Skeleton variant="text" width="60%" />
                </List.Item>
              ))}
            </List>
          ) : hasVisibleWebsites ? (
            <List as="ul" style={{ marginBottom: '16px' }}>
              {visibleWebsites?.map((item) => (
                <List.Item key={item.id}>
                  <Link
                    href={`/trafikkanalyse?websiteId=${item.id}&domain=${item.domain}`}
                    onClick={(event) => {
                      event.preventDefault()
                      navigateToTrafficAnalysis(item)
                    }}
                  >
                    {item.domain}
                  </Link>
                </List.Item>
              ))}
            </List>
          ) : showNoMatches ? (
            <BodyShort style={{ marginBottom: '16px' }}>Ingen nettsider matcher søket.</BodyShort>
          ) : null}
          <BodyShort className="mt-4 mb-2">
            Savner du en nettside eller app? <Link href="/komigang">Følg kom-i-gang-guiden!</Link>
          </BodyShort>
        </ReadMore>
      </form>
    </div>
  )
}

export default UrlSearchForm
