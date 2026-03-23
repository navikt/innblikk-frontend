import { useState } from 'react'
import { Heading, Button, BodyShort, Table, Tabs, Skeleton, Loader } from '@navikt/ds-react'
import { ArrowLeft } from 'lucide-react'
import type { EventProperty, ParameterValue, LatestEvent, QueryStats } from '../model/types.ts'

interface EventPropertiesSectionProps {
  propertiesData: EventProperty[]
  allParameterValues: Record<string, ParameterValue[]>
  loadingValues: boolean
  hasLoadedValues: boolean
  latestEvents: LatestEvent[]
  selectedParameterForDrilldown: string | null
  parameterValuesQueryStats: QueryStats | null
  onDrilldown: (parameterName: string | null) => void
  onFetchValues: () => void
}

const EventPropertiesSection = ({
  propertiesData,
  allParameterValues,
  loadingValues,
  hasLoadedValues,
  latestEvents,
  selectedParameterForDrilldown,
  parameterValuesQueryStats,
  onDrilldown,
  onFetchValues,
}: EventPropertiesSectionProps) => {
  const [parameterValuesTab, setParameterValuesTab] = useState<string>('latest')

  if (selectedParameterForDrilldown) {
    return (
      <ParameterDrilldown
        parameterName={selectedParameterForDrilldown}
        values={allParameterValues[selectedParameterForDrilldown]?.slice(0, 20) || []}
        onBack={() => onDrilldown(null)}
      />
    )
  }

  return (
    <>
      <Heading level="3" size="small" className="mb-4">
        Hendelsesdetaljer
      </Heading>

      {!hasLoadedValues && propertiesData.length > 0 && (
        <div className="mt-2 mb-4">
          <Button size="small" variant="secondary" onClick={onFetchValues} loading={loadingValues}>
            Vis utsnitt av verdier
          </Button>
        </div>
      )}

      {propertiesData.length > 0 ? (
        <div className="overflow-x-auto">
          <Table size="small">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Navn</Table.HeaderCell>
                <Table.HeaderCell align="right">Antall</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {propertiesData.map((prop, idx) => (
                <Table.Row key={idx}>
                  <Table.DataCell>{prop.propertyName}</Table.DataCell>
                  <Table.DataCell align="right">{prop.total.toLocaleString('nb-NO')}</Table.DataCell>
                  <Table.DataCell>
                    <Button size="xsmall" variant="secondary" onClick={() => onDrilldown(prop.propertyName)}>
                      Utforsk
                    </Button>
                  </Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      ) : (
        <BodyShort>Ingen parametere funnet for denne hendelsen.</BodyShort>
      )}

      {loadingValues && (
        <div className="flex justify-center items-center py-8">
          <Loader size="large" title="Henter verdier..." />
        </div>
      )}

      {hasLoadedValues && (Object.keys(allParameterValues).length > 0 || latestEvents.length > 0) && (
        <div className="mt-6 pt-6 border-t">
          <Tabs value={parameterValuesTab} onChange={setParameterValuesTab}>
            <Tabs.List>
              <Tabs.Tab value="latest" label="Siste 20" />
              <Tabs.Tab value="top" label="Topp verdier" />
            </Tabs.List>

            <Tabs.Panel value="latest" className="pt-4">
              <LatestEventsTable latestEvents={latestEvents} propertiesData={propertiesData} />
            </Tabs.Panel>

            <Tabs.Panel value="top" className="pt-4">
              <TopValuesView propertiesData={propertiesData} allParameterValues={allParameterValues} />
            </Tabs.Panel>
          </Tabs>
          {parameterValuesQueryStats && (
            <div className="text-sm text-[var(--ax-text-subtle)] text-right mt-4">
              Data prosessert: {parameterValuesQueryStats.totalBytesProcessedGB} GB
            </div>
          )}
        </div>
      )}
    </>
  )
}

// --- Sub-components ---

const LatestEventsTable = ({
  latestEvents,
  propertiesData,
}: {
  latestEvents: LatestEvent[]
  propertiesData: EventProperty[]
}) => (
  <>
    <Heading level="4" size="small" className="mb-4">
      Siste 20 registrerte hendelser
    </Heading>
    {latestEvents.length > 0 ? (
      <div className="overflow-x-auto max-w-full">
        <Table size="small" className="min-w-full">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Tidspunkt</Table.HeaderCell>
              {propertiesData.map((prop, idx) => (
                <Table.HeaderCell key={idx}>{prop.propertyName}</Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {latestEvents.map((event, eventIdx) => (
              <Table.Row key={eventIdx}>
                <Table.DataCell className="whitespace-nowrap">
                  {new Date(event.created_at).toLocaleString('nb-NO')}
                </Table.DataCell>
                {propertiesData.map((prop, propIdx) => (
                  <Table.DataCell
                    key={propIdx}
                    className="max-w-xs truncate"
                    title={event.properties?.[prop.propertyName] || '-'}
                  >
                    {event.properties?.[prop.propertyName] || '-'}
                  </Table.DataCell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    ) : (
      <BodyShort>Ingen hendelser funnet.</BodyShort>
    )}
  </>
)

const TopValuesView = ({
  propertiesData,
  allParameterValues,
}: {
  propertiesData: EventProperty[]
  allParameterValues: Record<string, ParameterValue[]>
}) => (
  <>
    <Heading level="4" size="small" className="mb-4">
      Topp 20 verdier per hendelsesdetaljer
    </Heading>
    <div className="space-y-6">
      {propertiesData.map((prop, propIdx) => {
        const values = allParameterValues[prop.propertyName]?.slice(0, 20) || []
        if (values.length === 0) return null

        return (
          <div key={propIdx} className="border rounded-lg p-4">
            <Heading level="5" size="xsmall" className="mb-3">
              {prop.propertyName}
            </Heading>
            <div className="overflow-x-auto">
              <Table size="small">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Verdi</Table.HeaderCell>
                    <Table.HeaderCell align="right">Antall</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {values.map((val, valIdx) => (
                    <Table.Row key={valIdx}>
                      <Table.DataCell className="max-w-md truncate" title={val.value || '(tom)'}>
                        {val.value || '(tom)'}
                      </Table.DataCell>
                      <Table.DataCell align="right">{val.count.toLocaleString('nb-NO')}</Table.DataCell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </div>
        )
      })}
    </div>
  </>
)

const ParameterDrilldown = ({
  parameterName,
  values,
  onBack,
}: {
  parameterName: string
  values: ParameterValue[]
  onBack: () => void
}) => (
  <>
    <div className="flex items-center gap-4 mb-4">
      <Button variant="tertiary" size="small" icon={<ArrowLeft aria-hidden />} onClick={onBack}>
        Alle hendelsesdetaljer
      </Button>
    </div>

    <Heading level="3" size="medium" className="mb-6">
      {parameterName}
    </Heading>

    <div className="border rounded-lg p-4">
      <Heading level="4" size="small" className="mb-4">
        Topp 20 verdier
      </Heading>
      {values.length > 0 ? (
        <div className="overflow-x-auto">
          <Table size="small">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Verdi</Table.HeaderCell>
                <Table.HeaderCell align="right">Antall</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {values.map((val, idx) => (
                <Table.Row key={idx}>
                  <Table.DataCell className="max-w-md truncate" title={val.value || '(tom)'}>
                    {val.value || '(tom)'}
                  </Table.DataCell>
                  <Table.DataCell align="right">{val.count.toLocaleString('nb-NO')}</Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      ) : (
        <>
          <Skeleton variant="text" width={80} height={20} />
          <Skeleton variant="text" width={100} height={20} />
        </>
      )}
    </div>
  </>
)

export default EventPropertiesSection
