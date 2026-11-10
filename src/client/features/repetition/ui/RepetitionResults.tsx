import { useState } from 'react'
import { Alert, BodyShort, Box, Heading, Link, ReadMore, Select, Table, Tag, VStack } from '@navikt/ds-react'
import { signalActions, signalExplanations, signalLabels } from '../model/repetition'
import type { RepetitionResult, RepetitionSignal } from '../model/repetition'
import { SqlViewer } from '../../chartbuilder-next'
import EpisodeActivity from './EpisodeActivity'

const count = (value: number) => value.toLocaleString('nb-NO')

export default function RepetitionResults({ result, search }: { result: RepetitionResult; search: string }) {
  const { summary } = result
  const [signalFilter, setSignalFilter] = useState<RepetitionSignal | 'all'>('all')
  const percentage = summary.totalVisitors ? (100 * result.affectedVisitors) / summary.totalVisitors : 0
  const visibleFindings =
    signalFilter === 'all' ? result.findings : result.findings.filter((finding) => finding.signal === signalFilter)
  const filteredTotal = signalFilter === 'all' ? result.totalFindings : result.signalFindings[signalFilter]

  return (
    <VStack gap="space-24">
      {result.isGeneratedData && (
        <Alert variant="info">Dette er genererte eksempeldata, ikke funn fra nettstedet ditt.</Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [
            'Berørte besøkende (estimert)',
            count(result.affectedVisitors),
            `${percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} % av ${count(summary.totalVisitors)} besøkende med sporet aktivitet i valgt utvalg`,
          ],
          ['Episoder', count(result.totalEpisodes), 'Overlappende tidsvinduer er slått sammen.'],
          ['Unike funn', count(result.totalFindings), 'Én rad per side, hendelse og mål.'],
        ].map(([label, value, description]) => (
          <Box key={label} padding="space-20" borderRadius="12" background="neutral-soft">
            <BodyShort size="small">{label}</BodyShort>
            <Heading level="2" size="large">
              {value}
            </Heading>
            <BodyShort size="small" textColor="subtle">
              {description}
            </BodyShort>
          </Box>
        ))}
      </div>

      {summary.interactionEvents === 0 && (
        <Alert variant="info" size="small">
          Ingen gjenkjente klikkhendelser i utvalget.
        </Alert>
      )}

      <section aria-labelledby="repetition-findings">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <Heading id="repetition-findings" level="2" size="medium">
            Funn
          </Heading>
          {result.findings.length > 0 && (
            <Select
              label="Vis signal"
              size="small"
              value={signalFilter}
              onChange={(event) => setSignalFilter(event.target.value as RepetitionSignal | 'all')}
            >
              <option value="all">Alle signaler ({count(result.totalFindings)})</option>
              {(Object.keys(signalLabels) as RepetitionSignal[]).map((signal) => (
                <option key={signal} value={signal}>
                  {signalLabels[signal]} ({count(result.signalFindings[signal])})
                </option>
              ))}
            </Select>
          )}
        </div>
        {result.findings.length === 0 ? (
          <Alert variant="info">
            {summary.totalEvents === 0
              ? 'Ingen sporet aktivitet i valgt periode og utvalg.'
              : 'Ingen gjentakelser over tersklene i dette utvalget. Det betyr ikke at siden er uten problemer.'}
          </Alert>
        ) : (
          <>
            {filteredTotal > visibleFindings.length && (
              <BodyShort size="small" textColor="subtle" spacing>
                Viser de {count(visibleFindings.length)} største av {count(filteredTotal)} funn
                {signalFilter === 'all' ? ' (opptil 100 per signal)' : ''}. Snevre inn URL eller periode for å se mer.
              </BodyShort>
            )}
            {visibleFindings.length === 0 ? (
              <Alert variant="info" size="small">
                Ingen funn for dette signalet.
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table size="small">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell scope="col">
                        <span className="sr-only">Detaljer</span>
                      </Table.HeaderCell>
                      <Table.HeaderCell scope="col">Signal</Table.HeaderCell>
                      <Table.HeaderCell scope="col">Side og interaksjon</Table.HeaderCell>
                      <Table.HeaderCell scope="col" align="right">
                        Besøkende
                      </Table.HeaderCell>
                      <Table.HeaderCell scope="col" align="right">
                        Episoder
                      </Table.HeaderCell>
                      <Table.HeaderCell scope="col" align="right">
                        Flest gjentakelser
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {visibleFindings.map((finding, index) => {
                      const params = new URLSearchParams(search)
                      params.set('urlPath', finding.page)
                      params.set('pathOperator', 'equals')
                      params.delete('pagePath')
                      if (finding.eventName) params.set('event', finding.eventName)
                      const href = `/utforsk-hendelser?${params.toString()}`
                      return (
                        <Table.ExpandableRow
                          key={`${finding.signal}:${finding.hostname}${finding.page}:${finding.eventName}:${finding.target}:${index}`}
                          expandOnRowClick
                          content={
                            <VStack gap="space-16" align="start">
                              <ReadMore size="small" header="Om dette signalet">
                                <VStack gap="space-8">
                                  <BodyShort size="small">{signalExplanations[finding.signal]}</BodyShort>
                                  <BodyShort size="small">{signalActions[finding.signal]}</BodyShort>
                                  {finding.signal !== 'pageviews' && !finding.hasTarget && (
                                    <BodyShort size="small">
                                      Lavere sikkerhet: samme hendelsesnavn, men målet er ukjent.
                                    </BodyShort>
                                  )}
                                </VStack>
                              </ReadMore>
                              <div className="w-full max-w-5xl">
                                <Heading level="3" size="xsmall" spacing>
                                  Eksempler
                                </Heading>
                                <div className="overflow-x-auto">
                                  <Table size="small" aria-label="Eksempler" className="w-auto">
                                    <Table.Header>
                                      <Table.Row>
                                        <Table.HeaderCell scope="col">Tidspunkt</Table.HeaderCell>
                                        <Table.HeaderCell scope="col">Utvalg</Table.HeaderCell>
                                        <Table.HeaderCell scope="col">
                                          <span className="sr-only">Aktivitetslogg</span>
                                        </Table.HeaderCell>
                                        <Table.HeaderCell scope="col" align="right">
                                          Antall
                                        </Table.HeaderCell>
                                        <Table.HeaderCell scope="col" align="right">
                                          Varighet
                                        </Table.HeaderCell>
                                        <Table.HeaderCell scope="col">Enhet og nettleser</Table.HeaderCell>
                                      </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                      {finding.examples.map((example) => (
                                        <EpisodeActivity
                                          key={`${example.sessionId}:${example.startedAt}`}
                                          example={example}
                                          finding={finding}
                                          search={search}
                                        />
                                      ))}
                                    </Table.Body>
                                  </Table>
                                </div>
                              </div>
                              {finding.eventName && <Link href={href}>Utforsk hendelsen</Link>}
                            </VStack>
                          }
                        >
                          <Table.DataCell>
                            <Tag size="small" variant={finding.signal === 'duplicates' ? 'warning' : 'neutral'}>
                              {signalLabels[finding.signal]}
                            </Tag>
                          </Table.DataCell>
                          <Table.DataCell className="max-w-[360px] break-words">
                            <BodyShort size="small">
                              {finding.hostname}
                              {finding.page}
                            </BodyShort>
                            {finding.eventName && (
                              <BodyShort size="small" textColor="subtle">
                                {finding.eventName}: {finding.target || 'Ukjent mål'}
                              </BodyShort>
                            )}
                          </Table.DataCell>
                          <Table.DataCell align="right">{count(finding.affectedVisitors)}</Table.DataCell>
                          <Table.DataCell align="right">{count(finding.episodes)}</Table.DataCell>
                          <Table.DataCell align="right">{count(finding.maxRepetitions)}</Table.DataCell>
                        </Table.ExpandableRow>
                      )
                    })}
                  </Table.Body>
                </Table>
              </div>
            )}
          </>
        )}
      </section>
      {result.queryStats && (
        <BodyShort size="small" textColor="subtle">
          Behandlet {result.queryStats.totalBytesProcessedGB.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} GB.{' '}
          Estimert kostnad: USD {result.queryStats.estimatedCostUSD.toFixed(3)}.
        </BodyShort>
      )}
      <SqlViewer sql={result.generatedSql} seksjon="gjentatt-aktivitet" />
    </VStack>
  )
}
