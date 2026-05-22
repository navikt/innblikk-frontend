import React from 'react'
import { BodyShort } from '@navikt/ds-react'
import type { Granularity } from '../../model/types.ts'
import { Code, SectionLabel } from './popoverPrimitives.tsx'

interface UnitForms {
  /** «per time» */
  singular: string
  /** «antall timer» */
  plural: string
  /** «timene» */
  pluralDefinite: string
}

const UNIT_FORMS: Record<Granularity, UnitForms> = {
  hour: { singular: 'time', plural: 'timer', pluralDefinite: 'timene' },
  day: { singular: 'dag', plural: 'dager', pluralDefinite: 'dagene' },
  week: { singular: 'uke', plural: 'uker', pluralDefinite: 'ukene' },
  month: { singular: 'måned', plural: 'måneder', pluralDefinite: 'månedene' },
}

// ─── per-metric bodies ────────────────────────────────────────────────────────

const VisitorsAvgBody: React.FC<{ u: UnitForms }> = ({ u }) => (
  <>
    <SectionLabel>Beregning</SectionLabel>
    <BodyShort size="small">
      <strong>Aritmetisk gjennomsnitt</strong> — summen av unike besøkende per {u.singular} delt på antall{' '}
      <Code>{u.plural}</Code> i perioden. Tomme {u.plural} (null besøkende) er inkludert i nevneren og trekker snittet
      ned.
    </BodyShort>

    <SectionLabel>Hvorfor stemmer ikke snitt × antall {u.plural} = totalt?</SectionLabel>
    <BodyShort size="small">
      <strong>«Totalt»</strong> er en <strong>mengdekardinalitet</strong> — den teller hver person{' '}
      <strong>én gang</strong> på tvers av hele perioden, uansett hvor mange {u.plural} personen dukker opp i.
    </BodyShort>
    <BodyShort size="small">
      <strong>Snittet</strong> summerer derimot <strong>aktivitet per {u.singular}</strong>: en person som besøker siden
      i ti ulike {u.plural} bidrar med <Code>10</Code> til summen — ikke <Code>1</Code>. Dermed er{' '}
      <Code>
        snitt × {u.plural} {'>'} totalt
      </Code>{' '}
      så lenge noen besøkende kommer tilbake.
    </BodyShort>
    <BodyShort size="small" style={{ color: 'var(--ax-text-neutral-subtle)' }}>
      Eneste unntaket: hvis ingen besøkende returnerer innenfor perioden, er de to størrelsene like.
    </BodyShort>
  </>
)

const VisitsAvgBody: React.FC<{ u: UnitForms }> = ({ u }) => (
  <>
    <SectionLabel>Beregning</SectionLabel>
    <BodyShort size="small">
      <strong>Aritmetisk gjennomsnitt</strong> — summen av økter per {u.singular} delt på antall <Code>{u.plural}</Code>{' '}
      i perioden. Tomme {u.plural} teller med i nevneren.
    </BodyShort>

    <SectionLabel>Hvorfor stemmer ikke snitt × antall {u.plural} = totalt?</SectionLabel>
    <BodyShort size="small">
      <strong>«Totalt»</strong> er antall <strong>distinkte økter</strong> over hele perioden — beregnet i én enkelt
      spørring mot hele tidsvinduet.
    </BodyShort>
    <BodyShort size="small">
      <strong>Snittet</strong> summerer <strong>antall øktstart per {u.singular}</strong> og deler på antall {u.plural}.
      En økt som starter sent på kvelden og slutter neste {u.singular} kan potensielt telles i begge {u.pluralDefinite},
      slik at <Code>sum(per-{u.singular}) ≥ totalt</Code>.
    </BodyShort>
  </>
)

const PageviewsAvgBody: React.FC<{ u: UnitForms }> = ({ u }) => (
  <>
    <SectionLabel>Beregning</SectionLabel>
    <BodyShort size="small">
      <strong>Aritmetisk gjennomsnitt</strong> — summen av sidevisninger per {u.singular} delt på antall{' '}
      <Code>{u.plural}</Code> i perioden. Tomme {u.plural} teller med i nevneren.
    </BodyShort>
    <BodyShort size="small" style={{ color: 'var(--ax-text-neutral-subtle)' }}>
      Sidevisninger er additive og overlapper ikke på tvers av {u.pluralDefinite} — her vil{' '}
      <Code>snitt × {u.plural} = totalt</Code> stemme eksakt (forutsatt at ingen {u.plural} er beskåret i kantene av
      perioden).
    </BodyShort>
  </>
)

const ProportionAvgBody: React.FC<{ u: UnitForms }> = ({ u }) => (
  <>
    <SectionLabel>Beregning</SectionLabel>
    <BodyShort size="small">
      <strong>Median</strong> — midtverdien når alle {u.pluralDefinite} andeler sorteres fra laveste til høyeste.
      Halvparten av <Code>{u.pluralDefinite}</Code> hadde lavere andel, halvparten hadde høyere.
    </BodyShort>
    <BodyShort size="small">
      Median er valgt fremfor gjennomsnitt fordi én ekstremt høy eller lav {u.singular} ikke drar verdien ut av kurs.
    </BodyShort>
    <SectionLabel>Hva er en «andel»?</SectionLabel>
    <BodyShort size="small">
      For hver {u.singular}: <Code>unike besøkende til URL-stien ÷ unike besøkende totalt</Code>. Beregnes separat per{' '}
      {u.singular} — derfor kreves en URL-sti.
    </BodyShort>
  </>
)

// ─── main export ─────────────────────────────────────────────────────────────

interface Props {
  metricType: string
  granularity: Granularity
}

export const AvgExplainerPopover: React.FC<Props> = ({ metricType, granularity }) => {
  const u = UNIT_FORMS[granularity] ?? UNIT_FORMS.day

  const body = (() => {
    switch (metricType) {
      case 'visits':
        return <VisitsAvgBody u={u} />
      case 'pageviews':
        return <PageviewsAvgBody u={u} />
      case 'proportion':
        return <ProportionAvgBody u={u} />
      default:
        return <VisitorsAvgBody u={u} />
    }
  })()

  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: '400px' }} tabIndex={-1}>
      {body}
    </div>
  )
}

export default AvgExplainerPopover
