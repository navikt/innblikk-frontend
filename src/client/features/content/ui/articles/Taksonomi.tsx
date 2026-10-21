import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  BodyLong,
  Box,
  Heading,
  HStack,
  Link,
  List,
  Loader,
  Tag,
  UNSAFE_Combobox,
  VStack,
} from '@navikt/ds-react'
import { DataGrid } from '@navikt/ds-react/PREVIEW'
import { HelpTextButton } from '../../../../shared/ui/HelpTextButton.tsx'
import { KontaktSeksjon } from '../../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx'
import { Skyra } from '../../../../shared/ui/theme/Skyra/Skyra.tsx'
import { PageHeader } from '../../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { AppBlock } from '../../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { SnippetBlock } from '../../../settings/ui/SnippetBlock.tsx'

const SKILL_URL = 'https://cdn.nav.no/team-researchops/skills/reops-add-tracking/SKILL.md'

type TaxonomyProperty = {
  name: string
  type: string
  optional: boolean
  description?: string
  inherited?: boolean
}

type TaxonomyEvent = {
  name: string
  constantName: string
  propertiesType: string
  description?: string
  category: string
  source: string
  properties: TaxonomyProperty[]
}

type TaxonomyDoc = {
  version: string
  eventCount: number
  events: TaxonomyEvent[]
}

/** Dummy value per property type, for the code snippet. */
function dummyValue(prop: TaxonomyProperty): string {
  if (prop.type.includes('privatperson')) return `'privatperson'`
  if (prop.type === 'number') return '3'
  if (prop.type === 'boolean') return 'true'
  if (prop.type.includes('readonly string[]')) return `['filter a', 'filter b']`
  if (prop.type.includes('string[]')) return `['verdi 1', 'verdi 2']`
  if (prop.type.includes('string')) {
    switch (prop.name) {
      case 'lenketekst':
        return `'Les mer om dagpenger'`
      case 'destinasjon':
        return `'/dagpenger/soknad'`
      case 'skjemanavn':
        return `'dagpengesoknad'`
      case 'tittel':
        return `'Om stønaden'`
      case 'tekst':
        return `'Send inn søknad'`
      case 'sokeord':
      case 'sokefrase':
      case 'søkeord':
        return `'dagpenger'`
      case 'komponentId':
        return `'hovedmeny'`
      case 'kontekst':
        return `'forsiden'`
      case 'seksjon':
        return `'pensjon'`
      case 'innholdstype':
        return `'artikkel'`
      case 'opprinnelse':
        return `'navno-frontend'`
      case 'kategori':
        return `'ytelse'`
      default:
        return `'${prop.name}-eksempel'`
    }
  }
  return `'verdi'`
}

function buildSnippet(event: TaxonomyEvent): string {
  const props = event.properties
  const lines = props.map((p) => `  ${p.name}: ${dummyValue(p)},`)
  return [
    `import { Events, type ${event.propertiesType} } from '@navikt/analytics-types'`,
    ``,
    `const properties: ${event.propertiesType} = {`,
    ...lines,
    `}`,
    ``,
    `window.sporing?.track(Events.${event.constantName.replace(/_EVENT$/, '')}, properties)`,
  ].join('\n')
}

function categoryLabel(category: string): string {
  // 'events/aksel/accordion' -> 'Aksel: Accordion', 'events/skjema' -> 'Skjema'
  const parts = category.split('/').filter(Boolean)
  if (parts[1] === 'aksel' && parts[2]) {
    const name = parts[2]
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')
    return `Aksel: ${name}`
  }
  const name = parts[1] ?? 'annet'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

const propertyColumns: DataGrid.Columns<TaxonomyProperty> = [
  {
    id: 'name',
    header: 'Navn',
    isRowHeader: true,
    width: { defaultValue: 200 },
    bodyCell: (p) => (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <code>{p.name}</code>
        {p.optional ? '' : ' *'}
        {p.inherited && (
          <HelpTextButton label="felles" title="Felles-egenskap" placement="right">
            «{p.name}» er en felles-egenskap fra BaseProperties og finnes på alle hendelser. Alltid valgfri — brukes til
            å sammenligne data på tvers av apper.
          </HelpTextButton>
        )}
      </span>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    width: { defaultValue: 220 },
    bodyCell: (p) => (
      <code
        className="text-xs px-1 py-0.5 rounded bg-[var(--ax-bg-neutral-moderate)] text-[var(--ax-text-default)]"
        style={{ overflowWrap: 'normal', wordBreak: 'normal', whiteSpace: 'normal' }}
      >
        {p.type}
      </code>
    ),
  },
  {
    id: 'description',
    header: 'Beskrivelse',
    bodyCell: (p) => p.description ?? '',
  },
]

const TaksonomiPage = () => {
  const [doc, setDoc] = useState<TaxonomyDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analytics-events')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: TaxonomyDoc) => {
        setDoc(data)
        if (data.events.length > 0) {
          setSelectedEventName(data.events[0].name)
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Ukjent feil'))
  }, [])

  const selectedEvent = useMemo(
    () => doc?.events.find((e) => e.name === selectedEventName) ?? null,
    [doc, selectedEventName],
  )

  return (
    <>
      <PageHeader
        title="Navs taksonomi for produktanalyse"
        description="Felles hendelser for sporing på tvers av team — søk, kopier kode og send inn."
        variant="article"
      />

      <AppBlock className="pb-24 px-4">
        <div className="max-w-[800px] mx-auto">
          <VStack gap="space-20">
            <section className="pt-12">
              <BodyLong spacing>
                En felles taksonomi gjør det enklere å sammenligne data, gjenbruke kode og forstå hva hendelsene betyr —
                på tvers av team og løsninger.
              </BodyLong>
              <BodyLong>
                Alle hendelsene under kommer fra{' '}
                <Link href="https://github.com/navikt/analytics-types" target="_blank">
                  @navikt/analytics-types
                </Link>
                {doc ? ` (versjon ${doc.version}, ${doc.eventCount} hendelser)` : ''}. Bruk gjerne AI-agenten din til å
                legge inn sporing i appen din:{' '}
                <Link href={SKILL_URL} target="_blank">
                  last ned skill-en «reops-add-tracking»
                </Link>{' '}
                og pek agenten på den, så finner den komponentene dine og kobler på riktige hendelser.
              </BodyLong>
            </section>

            <section>
              <Heading level="2" size="medium" spacing>
                Finn en hendelse
              </Heading>

              {error && (
                <Alert variant="error" className="mb-4">
                  Kunne ikke laste hendelsene ({error}). Prøv igjen senere, eller se{' '}
                  <Link href="https://github.com/navikt/analytics-types" target="_blank">
                    GitHub-repoet
                  </Link>
                  .
                </Alert>
              )}

              {!doc && !error && (
                <HStack justify="center" className="py-12">
                  <Loader size="xlarge" title="Laster hendelser..." />
                </HStack>
              )}

              {doc && (
                <VStack gap="space-12">
                  <UNSAFE_Combobox
                    label="Søk i hendelser"
                    hideLabel={false}
                    options={doc.events.map((e) => ({
                      label: e.name,
                      value: e.name,
                    }))}
                    selectedOptions={selectedEventName ? [selectedEventName] : []}
                    onToggleSelected={(option, isSelected) => {
                      if (isSelected) setSelectedEventName(option)
                    }}
                  />

                  {selectedEvent && (
                    <Box className="p-8 border border-[var(--ax-border-subtle)] rounded-medium bg-[var(--ax-bg-neutral-soft)]">
                      <VStack gap="space-6">
                        <div>
                          <HStack gap="space-4" align="center" className="mb-4">
                            <Heading level="3" size="small">
                              {selectedEvent.name}
                            </Heading>
                            <Tag data-color="info" variant="moderate" size="small">
                              {categoryLabel(selectedEvent.category)}
                            </Tag>
                          </HStack>
                          {selectedEvent.description && <BodyLong>{selectedEvent.description}</BodyLong>}
                        </div>

                        <SnippetBlock text={buildSnippet(selectedEvent)} language="tsx" />

                        <div className="mt-6">
                          <Heading level="4" size="xsmall" spacing>
                            Egenskaper
                          </Heading>
                          <DataGrid
                            columns={propertyColumns}
                            data={selectedEvent.properties}
                            getRowId={(p) => p.name}
                            defaultSettings={{ rowDensity: 'standard', truncateContent: false }}
                          >
                            <DataGrid.Table layout="auto" />
                          </DataGrid>
                        </div>
                      </VStack>
                    </Box>
                  )}
                </VStack>
              )}
            </section>

            <section className="pt-12">
              <Heading level="2" size="medium" spacing>
                Kom i gang
              </Heading>
              <List as="ol">
                <List.Item>
                  <strong>
                    <Link href="/public">Hent sporingskode</Link>
                  </strong>{' '}
                  fra Innblikk forsiden og legg den inn i appen din
                </List.Item>
                <List.Item>
                  <strong>Velg hendelser</strong> fra listen over og lim inn koden der brukeren gjør handlingen
                </List.Item>
                <List.Item>
                  <strong>
                    <Link href="/grafbygger">Verifiser i Grafbygger</Link>
                  </strong>{' '}
                  at hendelsene kommer inn som forventet
                </List.Item>
              </List>
              <BodyLong className="mt-4">
                Vil du legge til en ny hendelse i taksonomien? Se{' '}
                <Link href="https://github.com/navikt/analytics-types/blob/main/CONTRIBUTING.md" target="_blank">
                  bidragsguiden
                </Link>
                .
              </BodyLong>
            </section>
          </VStack>
        </div>
      </AppBlock>
      <Skyra />
      <KontaktSeksjon narrowContent />
    </>
  )
}

export default TaksonomiPage
