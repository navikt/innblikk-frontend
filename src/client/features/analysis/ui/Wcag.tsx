import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  Table,
  Alert,
  Loader,
  Tabs,
  TextField,
  Button,
  Link as DsLink,
  ActionMenu,
  Heading,
  Tooltip,
} from '@navikt/ds-react'
import { MoreVertical, Search } from 'lucide-react'

import ChartLayout from './ChartLayout.tsx'
import WebsitePicker from './WebsitePicker.tsx'
import type { WcagIssue } from '../model/types.ts'
import { downloadCsv } from '../utils/siteimprove.ts'
import { useWcag } from '../hooks/useWcag.ts'

const toConformanceLabel = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-'

  if (typeof value === 'string' || typeof value === 'number') {
    return `WCAG ${String(value).toUpperCase()}`
  }

  return '-'
}

const Wcag = () => {
  const {
    selectedWebsite,
    setSelectedWebsite,
    siteimproveId,
    activeTab,
    setActiveTab,
    pageId,
    confirmedIssues,
    potentialIssues,
    passedIssues,
    hasAttemptedFetch,
    loading,
    error,
    urlPath,
    setUrlPath,
    fetchWcagData,
  } = useWcag()

  const [confirmedSearch, setConfirmedSearch] = useState('')
  const [potentialSearch, setPotentialSearch] = useState('')
  const [passedSearch, setPassedSearch] = useState('')
  const [showConfirmedSearch, setShowConfirmedSearch] = useState(false)
  const [showPotentialSearch, setShowPotentialSearch] = useState(false)
  const [showPassedSearch, setShowPassedSearch] = useState(false)
  const confirmedSearchInputRef = useRef<HTMLInputElement>(null)
  const potentialSearchInputRef = useRef<HTMLInputElement>(null)
  const passedSearchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showConfirmedSearch) confirmedSearchInputRef.current?.focus()
  }, [showConfirmedSearch])

  useEffect(() => {
    if (showPotentialSearch) potentialSearchInputRef.current?.focus()
  }, [showPotentialSearch])

  useEffect(() => {
    if (showPassedSearch) passedSearchInputRef.current?.focus()
  }, [showPassedSearch])

  const renderTable = (
    items: WcagIssue[],
    emptyMsg: string,
    filename: string,
    title: string,
    search: string,
    setSearch: (value: string) => void,
    showSearch: boolean,
    setShowSearch: (value: boolean) => void,
    searchInputRef: RefObject<HTMLInputElement | null>,
  ) => {
    const q = search.toLowerCase()
    const filteredItems = items.filter((item) => {
      const level = toConformanceLabel(item.conformance)
      const titleText = item.help?.title ?? ''
      const description = item.help?.description ?? ''

      return [level, titleText, description].some((value) => value.toLowerCase().includes(q))
    })

    if (filteredItems.length === 0) {
      return <Alert variant="success">{emptyMsg}</Alert>
    }

    return (
      <div className="border border-[var(--ax-border-neutral-subtle)] rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
        <div className="p-4 pb-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Heading level="3" size="small">
              {title}
            </Heading>
            <div className="flex items-center gap-1">
              <Tooltip content="Søk" placement="top">
                <Button
                  type="button"
                  variant={showSearch ? 'secondary' : 'tertiary'}
                  size="xsmall"
                  icon={<Search aria-hidden />}
                  aria-label={`Søk i ${title.toLowerCase()}`}
                  aria-pressed={showSearch}
                  onClick={() => {
                    setShowSearch(!showSearch)
                    if (showSearch) setSearch('')
                  }}
                />
              </Tooltip>
              <ActionMenu>
                <Tooltip content="Flere valg" placement="top">
                  <ActionMenu.Trigger>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="xsmall"
                      icon={<MoreVertical aria-hidden />}
                      aria-label={`Flere valg for ${title.toLowerCase()}`}
                    />
                  </ActionMenu.Trigger>
                </Tooltip>
                <ActionMenu.Content align="end">
                  <ActionMenu.Item
                    onClick={() => {
                      downloadCsv(
                        `${filename}_${selectedWebsite?.name || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`,
                        ['Niva', 'Forekomster', 'Funn', 'Beskrivelse'],
                        filteredItems.map((item) => [
                          toConformanceLabel(item.conformance),
                          String(item.occurrences ?? 0),
                          `"${item.help?.title || ''}"`,
                          `"${item.help?.description || ''}"`,
                        ]),
                      )
                    }}
                    disabled={filteredItems.length === 0}
                  >
                    Last ned
                  </ActionMenu.Item>
                </ActionMenu.Content>
              </ActionMenu>
            </div>
          </div>
          {showSearch && (
            <div className="w-full sm:w-64 min-w-0">
              <TextField
                label="Søk"
                hideLabel
                placeholder="Søk..."
                size="small"
                value={search}
                ref={searchInputRef}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="overflow-x-auto px-4 pb-4">
          <Table size="small" zebraStripes>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Nivå</Table.HeaderCell>
                <Table.HeaderCell>Forekomster</Table.HeaderCell>
                <Table.HeaderCell>Funn</Table.HeaderCell>
                <Table.HeaderCell>Beskrivelse</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredItems.map((item, idx) => (
                <Table.Row key={`${item.rule_id || 'rule'}-${idx}`}>
                  <Table.DataCell>{toConformanceLabel(item.conformance)}</Table.DataCell>
                  <Table.DataCell>{item.occurrences ?? 0}</Table.DataCell>
                  <Table.DataCell>{item.help?.title || '-'}</Table.DataCell>
                  <Table.DataCell>{item.help?.description || '-'}</Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>
    )
  }

  return (
    <ChartLayout
      title="Universell utforming"
      description="Oversikt over universell utforming fra Siteimprove."
      currentPage="wcag"
      websiteId={selectedWebsite?.id}
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={
        <WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} variant="minimal" />
      }
      onFiltersSubmit={() => {
        if (!selectedWebsite || loading) return
        void fetchWcagData()
      }}
      filters={
        <>
          <TextField size="small" label="URL" value={urlPath} onChange={(e) => setUrlPath(e.target.value)} />

          <div className="mt-8">
            <Button
              onClick={fetchWcagData}
              disabled={!selectedWebsite || loading}
              loading={loading}
              className="w-full"
              size="small"
            >
              Kjør UU-sjekk
            </Button>
          </div>
        </>
      }
    >
      {!loading && error && (
        <Alert variant="info" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && (
        <div className="flex justify-center items-center h-64">
          <Loader size="xlarge" title="Henter data..." />
        </div>
      )}

      {!loading && !error && selectedWebsite && hasAttemptedFetch && (
        <>
          {!urlPath && (
            <Alert variant="info" className="mb-4">
              Legg til en URL-sti i filteret over for å se UU-resultater for en side.
            </Alert>
          )}

          {urlPath && pageId && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                  <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Bekreftede funn</div>
                  <div className="text-2xl font-bold text-[var(--ax-text-default)]">{confirmedIssues.length}</div>
                </div>
                <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                  <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Potensielle funn</div>
                  <div className="text-2xl font-bold text-[var(--ax-text-default)]">{potentialIssues.length}</div>
                </div>
                <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                  <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Beståtte sjekker</div>
                  <div className="text-2xl font-bold text-[var(--ax-text-default)]">{passedIssues.length}</div>
                </div>
              </div>

              <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List>
                  <Tabs.Tab value="confirmed" label="Bekreftet" />
                  <Tabs.Tab value="potential" label="Potensielle" />
                  <Tabs.Tab value="passed" label="Bestått" />
                </Tabs.List>

                <Tabs.Panel value="confirmed" className="pt-4">
                  {renderTable(
                    confirmedIssues,
                    confirmedSearch ? `Ingen treff for "${confirmedSearch}"` : 'Ingen bekreftede funn funnet.',
                    'wcag_bekreftet',
                    'Bekreftede funn',
                    confirmedSearch,
                    setConfirmedSearch,
                    showConfirmedSearch,
                    setShowConfirmedSearch,
                    confirmedSearchInputRef,
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="potential" className="pt-4">
                  {renderTable(
                    potentialIssues,
                    potentialSearch ? `Ingen treff for "${potentialSearch}"` : 'Ingen potensielle funn funnet.',
                    'wcag_potensielle',
                    'Potensielle funn',
                    potentialSearch,
                    setPotentialSearch,
                    showPotentialSearch,
                    setShowPotentialSearch,
                    potentialSearchInputRef,
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="passed" className="pt-4">
                  {renderTable(
                    passedIssues,
                    passedSearch ? `Ingen treff for "${passedSearch}"` : 'Ingen beståtte sjekker funnet.',
                    'wcag_bestatt',
                    'Beståtte sjekker',
                    passedSearch,
                    setPassedSearch,
                    showPassedSearch,
                    setShowPassedSearch,
                    passedSearchInputRef,
                  )}
                </Tabs.Panel>
              </Tabs>

              {siteimproveId && (
                <div className="mt-6 flex justify-end">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
                    <DsLink href="https://jira.adeo.no/plugins/servlet/desk/portal/581/create/2641" target="_blank">
                      Få tilgang til Siteimprove
                    </DsLink>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </ChartLayout>
  )
}

export default Wcag
