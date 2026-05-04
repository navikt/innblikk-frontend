export const FILTER_COLUMNS = {
  eventBasics: {
    label: 'Basisdetaljer',
    table: 'base_query',
    columns: [
      { label: 'Hendelsesnavn', value: 'event_name' },
      { label: 'Hendelsestype', value: 'event_type' },
      { label: 'Unike hendelser (ID)', value: 'event_id' },
      { label: 'Dato', value: 'created_at' },
    ],
  },
  pageDetails: {
    label: 'Sidedetaljer',
    table: 'base_query',
    columns: [
      { label: 'URL-sti', value: 'url_path' },
      { label: 'URL-spørring', value: 'url_query' },
      { label: 'URL-sti og spørring', value: 'url_fullpath' },
      /* { label: 'URL fullstendig adresse', value: 'url_fullurl' },*/
      { label: 'Sidetittel', value: 'page_title' },
      { label: 'Henvisningsdomene', value: 'referrer_domain' },
      { label: 'Henvisningssti', value: 'referrer_path' },
      { label: 'Henvisningsspørring', value: 'referrer_query' },
      { label: 'Henvisning sti og spørring', value: 'referrer_fullpath' },
      { label: 'Henvisning fullstendig URL', value: 'referrer_fullurl' },
    ],
  },
  visitorDetails: {
    label: 'Besøksdetaljer',
    table: 'session',
    columns: [
      { label: 'Unike besøkende / personer (ID)', value: 'session_id' },
      { label: 'Unike besøk / økter (ID)', value: 'visit_id' },
      { label: 'Nettlesertype', value: 'browser' },
      { label: 'Operativsystem', value: 'os' },
      { label: 'Enhet (mobil, laptop ++)', value: 'device' },
      { label: 'Skjermstørrelse', value: 'screen' },
      { label: 'Språk', value: 'language' },
      { label: 'Land', value: 'country' },
      { label: 'Besøksvarighet', value: 'visit_duration' },
    ],
  },
}

export const OPERATORS = [
  { label: 'er lik', value: '=' },
  { label: 'er ikke lik', value: '!=' },
  { label: 'inneholder', value: 'LIKE' },
  { label: 'inneholder ikke', value: 'NOT LIKE' },
  { label: 'er tom', value: 'IS NULL' },
  { label: 'er ikke tom', value: 'IS NOT NULL' },
  { label: 'starter med', value: 'STARTS_WITH' },
  { label: 'slutter med', value: 'ENDS_WITH' },
]
