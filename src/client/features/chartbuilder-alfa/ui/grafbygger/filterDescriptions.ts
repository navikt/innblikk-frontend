import type { OptionExplanationProps, UrlExample } from '../../../../shared/ui/DescribedCombobox/types.ts'

/** Every URL-related option uses the same address to make its parts comparable. */
const urlExample = (highlight: string): UrlExample => ({
  url: 'https://nav.no/sok?tema=jobb',
  highlight,
})

/** Labels stay separate from menu explanations so cards have short titles. */
export const FILTER_DESCRIPTIONS: Record<string, OptionExplanationProps> = {
  url_path: {
    example: urlExample('/sok'),
    description: 'Adressen uten parametere (det som står etter ?).',
  },
  sidegroup: {
    description: 'En samling sider du setter sammen selv.',
  },
  url_query: {
    example: urlExample('tema=jobb'),
    description: 'Parametere etter ? i adressen, uten spørsmålstegnet.',
  },
  url_fullpath: {
    example: urlExample('/sok?tema=jobb'),
    description: 'Siden med parametere. Domenet er ikke med.',
  },
  page_title: {
    description: 'Sidetittelen som vises i nettleserfanen, ikke adressen til siden.',
  },
  referrer_domain: {
    example: urlExample('nav.no'),
    description: 'Domenet som lenket til siden, for eksempel google.com. Direkte besøk kan mangle denne verdien.',
  },
  referrer_path: {
    example: urlExample('/sok'),
    description: 'Siden besøket kom fra, uten domene og parametere.',
  },
  referrer_query: {
    example: urlExample('tema=jobb'),
    description: 'Parametere i adressen til siden besøket kom fra, uten spørsmålstegnet.',
  },
  referrer_fullpath: {
    example: urlExample('/sok?tema=jobb'),
    description: 'Siden besøket kom fra, med parametere. Domenet er ikke med.',
  },
  event_id: {
    description: 'En teknisk ID for én enkelt hendelse. Brukes først og fremst til feilsøking.',
  },
  session_id: {
    description: 'En teknisk ID for en besøkende, ikke navn eller personnummer.',
  },
  visit_id: {
    description: 'En teknisk ID for ett besøk (en økt). Den samme besøkende kan ha flere besøk.',
  },
  browser: {
    description: 'Nettleseren den besøkende bruker, for eksempel Chrome eller Safari.',
  },
  os: {
    description: 'Operativsystemet på enheten, for eksempel Windows, Android eller iOS.',
  },
  device: {
    description: 'Typen enhet den besøkende bruker. Velg blant de registrerte verdiene.',
  },
  screen: {
    description: 'Registrert skjermstørrelse i piksler, for eksempel 1920x1080.',
  },
  language: {
    description: 'Språket nettleseren er satt til, ikke nødvendigvis språket på siden.',
  },
  country: {
    description: 'Landet besøket er registrert fra. Dette sier ikke noe om statsborgerskap.',
  },
  visit_duration: { description: 'Varigheten av besøket i sekunder.' },
  'event-options': {
    description:
      'Velg alle egne hendelser, søk etter deler av hendelsesnavn eller la mottakeren velge hendelse i dashboardet.',
  },
}
