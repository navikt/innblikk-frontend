import { useState } from 'react'
import { Button, Alert, Loader, Table, Heading, Tabs, Switch, ReadMore, Pagination, VStack } from '@navikt/ds-react'
import ChartLayout from './ChartLayoutOriginal.tsx'
import WebsitePicker from './WebsitePicker.tsx'
import PeriodPicker from './PeriodPicker.tsx'
import { PATTERNS } from '../utils/privacyPatterns.ts'
import { getEmailStats, getTableColumnGroups } from '../utils/privacy.ts'
import { usePrivacyCheck } from '../hooks/usePrivacyCheck.ts'
import { SqlViewer } from '../../chartbuilder'

const HighlightedText = ({ text, type }: { text: string; type: string }) => {
  const sourcePattern = PATTERNS[type]
  if (!sourcePattern) return <span>{text}</span>

  const pattern = new RegExp(sourcePattern.source, sourcePattern.flags)

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${key++}`}>{text.substring(lastIndex, match.index)}</span>)
    }
    parts.push(
      <mark key={`mark-${key++}`} className="bg-yellow-400 px-1 rounded">
        {match[0]}
      </mark>,
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`text-${key++}`}>{text.substring(lastIndex)}</span>)
  }

  return <>{parts}</>
}

const ExampleList = ({ examples, type }: { examples?: string[]; type: string }) => {
  const [showAll, setShowAll] = useState(false)

  if (!examples || examples.length === 0) return null

  const renderItem = (ex: string) => (
    <div className="py-1.5 px-2 bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-subtle)] rounded mb-2 overflow-x-auto">
      <HighlightedText text={ex} type={type} />
    </div>
  )

  if (examples.length === 1) return renderItem(examples[0])

  return (
    <div className="flex flex-col gap-1">
      {renderItem(examples[0])}
      {examples.length > 1 && (
        <div className="flex flex-col gap-1">
          {showAll ? (
            <>
              {examples.slice(1).map((ex, i) => (
                <div key={i}>{renderItem(ex)}</div>
              ))}
              <Button size="xsmall" variant="tertiary" onClick={() => setShowAll(false)} className="self-start mt-1">
                Vis færre
              </Button>
            </>
          ) : (
            <Button size="xsmall" variant="tertiary" onClick={() => setShowAll(true)} className="self-start">
              + {examples.length - 1} til
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

const PathList = ({ paths }: { paths?: string[] }) => {
  const [showAll, setShowAll] = useState(false)

  if (!paths || paths.length === 0) {
    return <span className="text-[var(--ax-text-subtle)]">-</span>
  }

  if (paths.length === 1) {
    return <div className="font-mono text-sm break-all">{paths[0]}</div>
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-sm break-all">{paths[0]}</div>
      {showAll ? (
        <>
          {paths.slice(1).map((path, i) => (
            <div key={i} className="font-mono text-sm break-all">
              {path}
            </div>
          ))}
          <Button size="xsmall" variant="tertiary" onClick={() => setShowAll(false)} className="self-start mt-1">
            Vis færre
          </Button>
        </>
      ) : (
        <Button size="xsmall" variant="tertiary" onClick={() => setShowAll(true)} className="self-start">
          + {paths.length - 1} til
        </Button>
      )}
    </div>
  )
}

const MetadataOverview = ({
  data,
  showWebsites,
}: {
  data: { website_id?: string; website_name?: string; table_name: string; column_name: string }[]
  showWebsites: boolean
}) => {
  const tableColumns = getTableColumnGroups(data)

  return (
    <div className="space-y-4">
      {showWebsites && (
        <div>
          <Heading level="4" size="xsmall" className="mb-2">
            Unike nettsteder ({new Set(data.map((row) => row.website_id)).size})
          </Heading>
          <ul className="list-disc list-inside space-y-1">
            {Array.from(new Set(data.map((row) => row.website_name || row.website_id)))
              .sort()
              .map((websiteName, idx) => (
                <li key={idx} className="text-sm">
                  {websiteName}
                </li>
              ))}
          </ul>
        </div>
      )}
      <div>
        <Heading level="4" size="xsmall" className="mb-2">
          Involverte tabeller og kolonner
        </Heading>
        <ul className="list-disc list-inside space-y-2">
          {Object.entries(tableColumns)
            .sort()
            .map(([table, columns]) => (
              <li key={table} className="text-sm">
                <strong>{table}</strong>
                <ul className="list-circle list-inside ml-6 mt-1">
                  {Array.from(columns)
                    .sort()
                    .map((column, idx) => (
                      <li key={idx} className="text-sm text-[var(--ax-text-default)]">
                        {column}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}

const PrivacyCheck = () => {
  const {
    selectedWebsite,
    setSelectedWebsite,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    data,
    loading,
    error,
    queryStats,
    generatedSql,
    dryRunStats,
    showDryRunWarning,
    setShowDryRunWarning,
    activeTab,
    setActiveTab,
    matchTypes,
    hasRedactions,
    selectedType,
    setSelectedType,
    showEmpty,
    setShowEmpty,
    visibleData,
    paginatedDetailsData,
    detailsPage,
    setDetailsPage,
    detailsTotalPages,
    paginatedRedactedData,
    redactedPage,
    setRedactedPage,
    redactedTotalPages,
    redactedSummary,
    fetchData,
    handleExplore,
  } = usePrivacyCheck()

  const emailStats = selectedType === 'E-post' ? getEmailStats(visibleData) : null

  return (
    <ChartLayout
      title="Personvernssjekk"
      description="Søk etter potensielle personopplysninger."
      currentPage="personvern"
      onFiltersSubmit={() => {
        if (loading) return
        void fetchData(false)
      }}
      filters={
        <>
          <WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} variant="minimal" />
          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            startDate={customStartDate}
            onStartDateChange={setCustomStartDate}
            endDate={customEndDate}
            onEndDateChange={setCustomEndDate}
          />
          <div className="flex items-end pb-[2px] mt-8 sm:mt-0">
            <Button onClick={() => fetchData(false)} disabled={loading} loading={loading} size="small">
              {selectedWebsite ? 'Kjør personvernssjekk' : 'Søk i alle nettsteder'}
            </Button>
          </div>
        </>
      }
    >
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {showDryRunWarning && dryRunStats && (
        <Alert variant="warning" className="mb-4">
          <Heading level="3" size="small">
            Stor datamengde
          </Heading>
          <p className="mt-2">
            Denne spørringen vil prosessere ca. <strong>{dryRunStats.totalBytesProcessedGB} GB</strong> data. Dette kan
            ta litt tid. Vil du fortsette?
          </p>
          <div className="mt-4 flex gap-4">
            <Button variant="primary" size="small" onClick={() => fetchData(true)}>
              Ja, kjør på!
            </Button>
            <Button variant="secondary" size="small" onClick={() => setShowDryRunWarning(false)}>
              Avbryt
            </Button>
          </div>
        </Alert>
      )}

      {loading && (
        <div className="flex flex-col justify-center items-center h-full gap-4">
          <Loader size="xlarge" title="Søker etter personopplysninger..." />
          <div className="text-center text-[var(--ax-text-subtle)]">
            <p className="font-medium">Dette kan ta noen sekunder</p>
            <p className="text-sm">
              {dryRunStats
                ? `Vi analyserer ${dryRunStats.totalBytesProcessedGB} GB data i valgt periode`
                : 'Vi analyserer alle data i valgt periode'}
            </p>
          </div>
        </div>
      )}

      {!loading && data && (
        <>
          {data.length === 0 || (matchTypes.length === 0 && !hasRedactions) ? (
            <Alert variant="success">Ingen treff funnet i valgt periode.</Alert>
          ) : (
            <Tabs value={activeTab} onChange={setActiveTab}>
              <Tabs.List>
                {matchTypes.length > 0 && <Tabs.Tab value="summary" label="Oppsummering" />}
                {matchTypes.length > 0 && <Tabs.Tab value="details" label="Detaljer" />}
                {hasRedactions && <Tabs.Tab value="redacted-summary" label="PII-oppsummering" />}
                {hasRedactions && <Tabs.Tab value="redacted" label="PII-filtrering" />}
              </Tabs.List>

              <Tabs.Panel value="redacted-summary" className="mt-4">
                <Alert variant="info" className="mb-4">
                  Oppsummering av hvilke redigeringsnøkler som er brukt i klammer (f.eks. [redacted: uuid]).
                </Alert>
                <div className="overflow-x-auto">
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Nøkkel</Table.HeaderCell>
                        <Table.HeaderCell>Totalt antall</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {redactedSummary.map((item) => (
                        <Table.Row key={item.key}>
                          <Table.DataCell className="font-mono">{item.key}</Table.DataCell>
                          <Table.DataCell>{item.count.toLocaleString('no-NO')}</Table.DataCell>
                        </Table.Row>
                      ))}
                      <Table.Row className="font-bold">
                        <Table.DataCell>Totalt</Table.DataCell>
                        <Table.DataCell>
                          {redactedSummary.reduce((sum, item) => sum + item.count, 0).toLocaleString('no-NO')}
                        </Table.DataCell>
                      </Table.Row>
                    </Table.Body>
                  </Table>
                </div>
              </Tabs.Panel>

              <Tabs.Panel value="summary" className="mt-4">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Type</Table.HeaderCell>
                      <Table.HeaderCell>Totalt antall forekomster</Table.HeaderCell>
                      <Table.HeaderCell>Handling</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {matchTypes.map((type) => {
                      const totalCount = data.filter((r) => r.match_type === type).reduce((sum, r) => sum + r.count, 0)
                      return (
                        <Table.Row key={type}>
                          <Table.DataCell>{type}</Table.DataCell>
                          <Table.DataCell>{totalCount.toLocaleString('no-NO')}</Table.DataCell>
                          <Table.DataCell>
                            <Button size="small" variant="secondary" onClick={() => handleExplore(type)}>
                              Utforsk
                            </Button>
                          </Table.DataCell>
                        </Table.Row>
                      )
                    })}
                    <Table.Row className="font-bold">
                      <Table.DataCell>Totalt</Table.DataCell>
                      <Table.DataCell>
                        {data
                          .filter((r) => r.match_type !== 'Redacted')
                          .reduce((sum, r) => sum + r.count, 0)
                          .toLocaleString('no-NO')}
                      </Table.DataCell>
                      <Table.DataCell></Table.DataCell>
                    </Table.Row>
                  </Table.Body>
                </Table>

                <ReadMore header="Metadata oversikt" className="mt-6">
                  <MetadataOverview data={data} showWebsites={!selectedWebsite} />
                </ReadMore>
              </Tabs.Panel>

              <Tabs.Panel value="details" className="mt-4">
                {emailStats && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                      <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">
                        Totalt antall e-poster
                      </div>
                      <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                        {emailStats.total.toLocaleString('no-NO')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Unike: {emailStats.uniqueTotal.toLocaleString('no-NO')}
                      </div>
                    </div>
                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                      <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Nav e-poster</div>
                      <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                        {emailStats.navCount.toLocaleString('no-NO')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Unike: {emailStats.uniqueNavCount.toLocaleString('no-NO')}
                      </div>
                    </div>
                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                      <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Andre e-poster</div>
                      <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                        {emailStats.otherCount.toLocaleString('no-NO')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Unike: {emailStats.uniqueOtherCount.toLocaleString('no-NO')}
                      </div>
                    </div>
                  </div>
                )}

                {!selectedWebsite && selectedType && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                      <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">
                        Antall unike nettsteder
                      </div>
                      <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                        {new Set(visibleData.map((row) => row.website_id)).size.toLocaleString('no-NO')}
                      </div>
                    </div>
                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                      <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Antall variasjoner</div>
                      <div className="text-2xl font-bold text-[var,--ax-text-default]">
                        {visibleData.length.toLocaleString('no-NO')}
                      </div>
                    </div>
                  </div>
                )}

                {selectedType && (
                  <ReadMore header="Metadata oversikt" className="mb-6">
                    <MetadataOverview data={visibleData} showWebsites={!selectedWebsite} />
                  </ReadMore>
                )}

                <div className="flex justify-between items-end mb-4">
                  {selectedType ? (
                    <div className="flex items-center gap-4 p-2 px-4 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)]">
                      <div className="text-[var(--ax-text-default)]">
                        Viser detaljer for: <strong>{selectedType}</strong>
                      </div>
                      <Button size="small" variant="tertiary" onClick={() => setSelectedType(null)}>
                        Vis alle
                      </Button>
                    </div>
                  ) : (
                    <div></div>
                  )}
                  <Switch checked={showEmpty} onChange={() => setShowEmpty(!showEmpty)} size="small">
                    Vis rader uten treff
                  </Switch>
                </div>

                <VStack gap="space-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <Table.Header>
                        <Table.Row>
                          {!selectedWebsite && <Table.HeaderCell>Nettside</Table.HeaderCell>}
                          <Table.HeaderCell>Tabell</Table.HeaderCell>
                          <Table.HeaderCell>Kolonne</Table.HeaderCell>
                          <Table.HeaderCell>Sti</Table.HeaderCell>
                          {!selectedType && <Table.HeaderCell>Type</Table.HeaderCell>}
                          <Table.HeaderCell>Antall</Table.HeaderCell>
                          <Table.HeaderCell>Eksempler</Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {paginatedDetailsData.map((row, index) => (
                          <Table.Row key={index}>
                            {!selectedWebsite && (
                              <Table.DataCell className="whitespace-nowrap">{row.website_name}</Table.DataCell>
                            )}
                            <Table.DataCell className="whitespace-nowrap">{row.table_name}</Table.DataCell>
                            <Table.DataCell className="whitespace-nowrap">{row.column_name}</Table.DataCell>
                            <Table.DataCell>
                              <PathList paths={row.related_paths} />
                            </Table.DataCell>
                            {!selectedType && (
                              <Table.DataCell className="whitespace-nowrap">{row.match_type}</Table.DataCell>
                            )}
                            <Table.DataCell className="whitespace-nowrap">
                              {row.count.toLocaleString('no-NO')}
                            </Table.DataCell>
                            <Table.DataCell className="font-mono text-sm">
                              <ExampleList examples={row.examples} type={row.match_type} />
                            </Table.DataCell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  </div>
                  {detailsTotalPages > 1 && (
                    <Pagination
                      page={detailsPage}
                      onPageChange={setDetailsPage}
                      count={detailsTotalPages}
                      size="small"
                    />
                  )}
                </VStack>
              </Tabs.Panel>

              <Tabs.Panel value="redacted" className="mt-4">
                <Alert variant="info" className="mb-4">
                  Her vises forekomster som er fanget opp av PII-filtrering (f.eks. [redacted]).
                </Alert>
                <VStack gap="space-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <Table.Header>
                        <Table.Row>
                          {!selectedWebsite && <Table.HeaderCell>Nettside</Table.HeaderCell>}
                          <Table.HeaderCell>Tabell</Table.HeaderCell>
                          <Table.HeaderCell>Kolonne</Table.HeaderCell>
                          <Table.HeaderCell>Sti</Table.HeaderCell>
                          <Table.HeaderCell>Antall</Table.HeaderCell>
                          <Table.HeaderCell>Eksempler</Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {paginatedRedactedData.map((row, index) => (
                          <Table.Row key={index}>
                            {!selectedWebsite && (
                              <Table.DataCell className="whitespace-nowrap">{row.website_name}</Table.DataCell>
                            )}
                            <Table.DataCell className="whitespace-nowrap">{row.table_name}</Table.DataCell>
                            <Table.DataCell className="whitespace-nowrap">{row.column_name}</Table.DataCell>
                            <Table.DataCell>
                              <PathList paths={row.related_paths} />
                            </Table.DataCell>
                            <Table.DataCell className="whitespace-nowrap">
                              {row.count.toLocaleString('no-NO')}
                            </Table.DataCell>
                            <Table.DataCell className="font-mono text-sm">
                              <ExampleList examples={row.examples} type={row.match_type} />
                            </Table.DataCell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  </div>
                  {redactedTotalPages > 1 && (
                    <Pagination
                      page={redactedPage}
                      onPageChange={setRedactedPage}
                      count={redactedTotalPages}
                      size="small"
                    />
                  )}
                </VStack>
              </Tabs.Panel>
            </Tabs>
          )}

          {queryStats && (
            <div className="mt-5 pt-4text-sm text-gray-500 flex justify-between">
              <div>Data prosessert: {queryStats.totalBytesProcessedGB} GB</div>
            </div>
          )}

          {generatedSql && <SqlViewer sql={generatedSql} showEditButton seksjon="personvernsjekk" />}
        </>
      )}
    </ChartLayout>
  )
}

export default PrivacyCheck
