import { Heading, LinkCard, Tag } from '@navikt/ds-react'
import { Link, useLocation } from 'react-router-dom'
import { analyticsPages } from '../../analysis/model/analyticsNavigation.ts'
import { preserveSharedAnalysisParams } from '../../../shared/lib/analysisNavigation.ts'
import './Features.css'

type Feature = { href: string; label: string; description: string; beta?: boolean; preserveParams?: boolean }

const analysis = (id: string, description: string): Feature => {
  const page = analyticsPages.find((item) => item.id === id)
  if (!page) throw new Error(`Unknown analysis page: ${id}`)
  return { ...page, description, preserveParams: true }
}

const groups = [
  {
    id: 'trafikk',
    title: 'Trafikk',
    question: 'Hvor mange besøker oss, og hvor kommer de fra?',
    features: [
      analysis('trafikkanalyse', 'Følg besøk over tid, populære sider og hvor trafikken kommer fra.'),
      analysis('markedsanalyse', 'Se hvilke kampanjer og kanaler som sender folk til tjenesten.'),
    ],
  },
  {
    id: 'brukere',
    title: 'Besøkende',
    question: 'Hva vet vi om de besøkende?',
    features: [
      analysis('brukersammensetning', 'Se hvilke enheter, nettlesere og land besøkene kommer fra.'),
      analysis('enkeltbrukere', 'Undersøk enkeltbesøk for å forstå konkrete brukerreiser.'),
    ],
  },
  {
    id: 'brukerreiser',
    title: 'Brukeratferd',
    question: 'Hva gjør de besøkende?',
    features: [
      analysis('brukerreiser', 'Se hvilke sider folk kommer fra, og hvor de går videre.'),
      analysis('clickmap', 'Se hvilke lenker og elementer folk klikker på.'),
      analysis('event-explorer', 'Utforsk handlinger som teamet har satt opp måling av.'),
      analysis('hendelsesreiser', 'Se rekkefølgen på handlinger og hvordan folk bruker en side.'),
      analysis('trakt', 'Sett opp en serie steg og se hvor folk faller fra underveis.'),
      analysis('maloppnaelse', 'Se hvor mange som kommer fra en valgt startside til målsiden.'),
      analysis('brukerlojalitet', 'Se hvor mange som vender tilbake til tjenesten over tid.'),
    ],
  },
  {
    id: 'kvalitet',
    title: 'Kvalitet og personvern',
    question: 'Hva bør vi kvalitetssikre?',
    features: [
      analysis('stavekontroll', 'Finn mulige stavefeil i innholdet med data fra Siteimprove.'),
      analysis('odelagte-lenker', 'Finn lenker som ikke virker, med data fra Siteimprove.'),
      { ...analysis('wcag', 'Se tilgjengelighetsfunn fra Siteimprove og hva som bør følges opp.'), beta: false },
      analysis('personvern', 'Søk etter mulige personopplysninger i innsamlede analysedata.'),
    ],
  },
  {
    id: 'innsikt',
    title: 'Egne analyser',
    question: 'Hvordan kan vi bygge og dele egne analyser?',
    features: [
      {
        ...analysis('grafbygger', 'Lag egne grafer og tabeller med målene og filtrene som er relevante for teamet.'),
        label: 'Grafbygger',
      },
      {
        href: '/dashboard',
        label: 'Dashboard',
        description: 'Samle grafer og nøkkeltall i en oversikt som teamet kan følge sammen.',
      },
      {
        href: '/canvas',
        label: 'Canvas',
        description: 'Samle grafer, tekst og funn på et lerret som du kan dele og presentere.',
      },
      {
        href: '/sidegrupper',
        label: 'Sidegrupper',
        description: 'Samle sider som hører sammen, og bruk gruppen i analyser.',
      },
      {
        href: '/brukergrupper',
        label: 'Brukergrupper',
        description: 'Samle besøkende med felles kjennetegn for mer målrettede analyser.',
      },
      analysis('sql', 'Undersøk egne spørsmål direkte i datasettet med SQL.'),
      {
        href: '/sporingskoder',
        label: 'Sporingskoder',
        description: 'Finn koden som trengs for å måle besøk og handlinger i tjenesten.',
      },
    ],
  },
] satisfies { id: string; title: string; question: string; features: Feature[] }[]

export default function Features() {
  const { search } = useLocation()

  return (
    <div className="feature-catalog" data-color="neutral">
      <header className="feature-catalog__intro">
        <div>
          <Heading as="h1" size="xlarge">
            Funksjoner i Innblikk
          </Heading>
          <p className="feature-catalog__lead">
            Forstå brukeradferd med Innblikk. Mål det som teller, og bruk innsikten til å ta bedre beslutninger.
          </p>
        </div>
      </header>

      {groups.map((group) => (
        <section
          key={group.id}
          id={group.id}
          className="feature-catalog__section"
          aria-labelledby={`${group.id}-title`}
        >
          <Heading as="h2" size="medium" id={`${group.id}-title`} className="feature-catalog__section-heading">
            {group.question}
          </Heading>
          <div className="feature-catalog__grid">
            {group.features.map((feature: Feature) => (
              <LinkCard key={feature.href} className="feature-catalog__card" data-color="neutral">
                <LinkCard.Title as="h3">
                  <LinkCard.Anchor asChild>
                    <Link
                      to={feature.preserveParams ? preserveSharedAnalysisParams(feature.href, search) : feature.href}
                    >
                      {feature.label}
                    </Link>
                  </LinkCard.Anchor>
                </LinkCard.Title>
                <LinkCard.Description>{feature.description}</LinkCard.Description>
                {feature.beta && (
                  <LinkCard.Footer>
                    <Tag size="xsmall" variant="alt1">
                      Beta
                    </Tag>
                  </LinkCard.Footer>
                )}
              </LinkCard>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
