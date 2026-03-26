export type AnalyticsPage =
  | 'brukerreiser'
  | 'trakt'
  | 'brukerlojalitet'
  | 'grafbygger'
  | 'brukersammensetning'
  | 'event-explorer'
  | 'trafikkanalyse'
  | 'markedsanalyse'
  | 'diagnose'
  | 'enkeltbrukere'
  | 'personvern'
  | 'hendelsesreiser'
  | 'clickmap'
  | 'sql'
  | 'grafdeling'
  | 'odelagte-lenker'
  | 'stavekontroll'
export const analyticsPages = [
  {
    id: 'grafbygger',
    href: '/grafbygger',
    label: 'Tilpasset analyse',
    description: 'Lag egne grafer eller tabeller',
  },
  {
    id: 'trafikkanalyse',
    href: '/trafikkanalyse',
    label: 'Trafikkoversikt',
    description: 'Se besøk over tid og trafikkilder',
  },
  {
    id: 'brukersammensetning',
    href: '/brukersammensetning',
    label: 'Brukerdetaljer',
    description: 'Se informasjon om besøkende',
  },
  {
    id: 'brukerreiser',
    href: '/brukerreiser',
    label: 'Navigasjonsflyt',
    description: 'Se hvilke veier folk tar på nettsiden',
  },
  {
    id: 'hendelsesreiser',
    href: '/hendelsesreiser',
    label: 'Hendelsesforløp',
    description: 'Se rekkefølgen av hendelser på en side',
  },
  {
    id: 'trakt',
    href: '/trakt',
    label: 'Trakt',
    description: 'Se hvor folk faller fra i en prosess',
  },
  {
    id: 'enkeltbrukere',
    href: '/brukerprofiler',
    label: 'Enkeltbrukere',
    description: 'Se info om individuelle besøkende',
  },
  {
    id: 'brukerlojalitet',
    href: '/brukerlojalitet',
    label: 'Gjenbesøk',
    description: 'Se hvor mange som kommer tilbake',
  },
  {
    id: 'clickmap',
    href: '/klikkoversikt',
    label: 'Klikkoversikt',
    description: 'Se hvor brukerne klikker på en side',
  },
  {
    id: 'event-explorer',
    href: '/utforsk-hendelser',
    label: 'Egendefinerte hendelser',
    description: 'Utforsk egendefinerte hendelser',
  },
  {
    id: 'markedsanalyse',
    href: '/markedsanalyse',
    label: 'Kampanjer',
    description: 'Analyser trafikk basert på UTM-parametere',
  },
  {
    id: 'sql',
    href: '/sql',
    label: 'SQL-spørringer',
    description: 'Kjør SQL-spørringer mot Umami datasettet',
  },
  {
    id: 'diagnose',
    href: '/diagnose',
    label: 'Diagnoseverktøy',
    description: 'Oversikt over aktivitet på alle nettsteder og apper',
  },
  {
    id: 'personvern',
    href: '/personvernssjekk',
    label: 'Personvernssjekk',
    description: 'Søk etter potensielle personopplysninger',
  },
  {
    id: 'odelagte-lenker',
    href: '/kvalitet/odelagte-lenker',
    label: 'Ødelagte lenker',
    description: 'Se ødelagte lenker fra Siteimprove',
  },
  {
    id: 'stavekontroll',
    href: '/kvalitet/stavekontroll',
    label: 'Stavekontroll',
    description: 'Se stavefeil fra Siteimprove',
  },
]
