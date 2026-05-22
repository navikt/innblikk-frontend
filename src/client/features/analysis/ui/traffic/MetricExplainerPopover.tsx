import React from 'react'
import { BodyShort, Detail, Link } from '@navikt/ds-react'
import { METRIC_DOCS_URL } from '../../utils/trafficStats.ts'
import type { MetricExplainer, TotalExplainer } from '../../utils/trafficStats.ts'

interface Props {
  metricExplainer: MetricExplainer
  totalExplainer: TotalExplainer
  metricType: string
}

/** Inline monospace chip for technical terms */
const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code
    style={{
      fontFamily: 'monospace',
      fontSize: '0.8em',
      background: 'var(--ax-bg-neutral-moderate)',
      borderRadius: '3px',
      padding: '1px 4px',
    }}
  >
    {children}
  </code>
)

/** Muted uppercase label above a block */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Detail
    as="p"
    style={{
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--ax-text-neutral-subtle)',
      marginBottom: '2px',
    }}
  >
    {children}
  </Detail>
)

const VisitorsBody: React.FC = () => (
  <>
    <BodyShort size="small">
      Antall ulike personer som besøkte siden i den valgte perioden. Hver person telles <strong>én gang</strong>,
      uavhengig av hvor mange ganger de kom tilbake.
    </BodyShort>

    <SectionLabel>Uten samtykkebanner</SectionLabel>
    <BodyShort size="small">
      Personen identifiseres via en hash av <Code>IP-adresse</Code> + <Code>User-Agent</Code>, saltet per måned — ID-en
      nullstilles ved månedsskiftet. IP-adressen lagres aldri: den brukes kun til å lage hashen og til geo-oppslag
      (land/by), og forkastes deretter. Ingen canvas, skrifttyper eller plugins leses — dette er ikke fingerprinting.
    </BodyShort>

    <SectionLabel>Med samtykkebanner</SectionLabel>
    <BodyShort size="small">
      En stabil <Code>cookie</Code> brukes i stedet, slik at samme person gjenkjennes på tvers av måneder og nettlesere
      som deler cookie-jar.
    </BodyShort>
  </>
)

const VisitsBody: React.FC = () => (
  <BodyShort size="small">
    En økt er én sammenhengende periode med aktivitet fra samme nettleser. Inaktivitet i mer enn <Code>30 min</Code>{' '}
    starter en ny økt. Samme person kan ha flere økter i samme periode.
  </BodyShort>
)

const PageviewsBody: React.FC = () => (
  <BodyShort size="small">
    Antall ganger sider ble lastet. Hver sideoppdatering teller som én ny sidevisning — inkludert om samme person ser
    samme side flere ganger.
  </BodyShort>
)

const ProportionBody: React.FC = () => (
  <>
    <BodyShort size="small">
      For hver tidsenhet: antall unike besøkende til den valgte URL-stien delt på antall unike besøkende totalt.
      Beregnes separat per tidsenhet — derfor kreves en URL-sti.
    </BodyShort>
    <BodyShort size="small" style={{ color: 'var(--ax-text-neutral-subtle)' }}>
      «Gjennomsnittlig andel» i kortet er snittet av brøkene per tidsenhet, ikke andelen for hele perioden samlet.
    </BodyShort>
  </>
)

const MetricBody: React.FC<{ metricType: string }> = ({ metricType }) => {
  switch (metricType) {
    case 'visits':
      return <VisitsBody />
    case 'pageviews':
      return <PageviewsBody />
    case 'proportion':
      return <ProportionBody />
    default:
      return <VisitorsBody />
  }
}

export const MetricExplainerPopover: React.FC<Props> = ({ metricExplainer, totalExplainer, metricType }) => (
  /* tabIndex={-1} prevents focus escaping to skip-link target on click */
  <div className="flex flex-col gap-3" style={{ maxWidth: '400px' }} tabIndex={-1}>
    <div className="flex flex-col gap-2">
      <BodyShort size="small">
        <strong>{metricExplainer.title}</strong>
      </BodyShort>
      <MetricBody metricType={metricType} />
    </div>

    <div className="flex flex-col gap-1">
      <BodyShort size="small">
        <strong>{totalExplainer.title}</strong>
      </BodyShort>
      <BodyShort size="small">{totalExplainer.body}</BodyShort>
    </div>

    <BodyShort size="small">
      <Link href={`${METRIC_DOCS_URL}${metricExplainer.docsAnchor}`} target="_blank">
        {metricExplainer.docsLinkText}
      </Link>
    </BodyShort>
  </div>
)

export default MetricExplainerPopover
