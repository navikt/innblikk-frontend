import type { BigQueryTableDoc, SqlBuildingBlock } from './types'

export const getFullTableName = (projectId: string, datasetTable: string) => `\`${projectId}.${datasetTable}\``

export const getInitialSqlQuery = (projectId: string) =>
  `SELECT\nFROM ${getFullTableName(projectId, 'umami_views.event')}\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]`

export const isInitialSqlQuery = (query: string, projectId: string) =>
  query === getInitialSqlQuery(projectId) || /^\s*SELECT\s*$/i.test(query)

export const INITIAL_CURSOR = { lineNumber: 1, column: 'SELECT'.length + 1 }

export const getBigQueryTables = (projectId: string): BigQueryTableDoc[] => [
  {
    id: 'event',
    title: 'Hendelser',
    shortName: 'umami_views.event',
    datasetTable: 'umami_views.event',
    summary: 'Sidevisninger, klikk og andre hendelser. Én rad per hendelse.',
    columns: [
      { name: 'url_path', label: 'Sidesti (f.eks. /minside)' },
      { name: 'url_query', label: 'Parametere i adressen' },
      { name: 'page_title', label: 'Sidetittel' },
      { name: 'session_id', label: 'Besøkende-ID fra fingeravtrykk' },
      { name: 'visit_id', label: 'Økt-ID' },
      { name: 'event_id', label: 'Hendelse-ID' },
      { name: 'event_name', label: 'Navn på klikk / hendelse' },
      { name: 'event_type', label: '1 = sidevisning, 2 = hendelse' },
      { name: 'referrer_domain', label: 'Hvor besøket kom fra' },
      { name: 'referrer_path', label: 'Sidesti besøket kom fra' },
      { name: 'referrer_query', label: 'Adresseparametere besøket kom fra' },
      { name: 'utm_source', label: 'Kampanje (utm_source)' },
      { name: 'utm_medium', label: 'Kampanjekanal' },
      { name: 'utm_campaign', label: 'Kampanjenavn' },
      { name: 'utm_content', label: 'Kampanjeinnhold' },
      { name: 'utm_term', label: 'Søkeord i kampanjen' },
      { name: 'gclid', label: 'Klikk-ID fra Google' },
      { name: 'fbclid', label: 'Klikk-ID fra Facebook' },
      { name: 'msclkid', label: 'Klikk-ID fra Microsoft' },
      { name: 'ttclid', label: 'Klikk-ID fra TikTok' },
      { name: 'li_fat_id', label: 'Klikk-ID fra LinkedIn' },
      { name: 'twclid', label: 'Klikk-ID fra X' },
      { name: 'tag', label: 'Merking av hendelsen' },
      { name: 'hostname', label: 'Vertsnavn' },
      { name: 'created_at', label: 'Tidspunkt' },
      { name: 'website_id', label: 'Nettside-ID' },
    ],
  },
  {
    id: 'session',
    title: 'Brukerdetaljer',
    shortName: 'umami_views.session',
    datasetTable: 'umami_views.session',
    summary: 'Mobil eller PC, nettleser, språk og operativsystem.',
    relationLabel: 'session_id',
    joinSnippet: `LEFT JOIN \`${projectId}.umami_views.session\` ON \`${projectId}.umami_views.event\`.session_id = \`${projectId}.umami_views.session\`.session_id`,
    columns: [
      { name: 'device', label: 'Enhet (desktop, mobile, tablet)' },
      { name: 'browser', label: 'Nettleser (chrome, safari, ...)' },
      { name: 'os', label: 'Operativsystem (iOS, Windows, ...)' },
      { name: 'screen', label: 'Skjermstørrelse' },
      { name: 'language', label: 'Språk i nettleseren' },
      { name: 'country', label: 'Land' },
      { name: 'distinct_id', label: 'Besøkende-ID fra cookie (nav.no)' },
      { name: 'session_id', label: 'Kobles mot event.session_id' },
      { name: 'website_id', label: 'Nettside-ID' },
      { name: 'created_at', label: 'Tidspunkt' },
      { name: 'session_parameters', label: 'Liste med ekstra detaljer om besøkende' },
      { name: 'sp.data_key', label: 'Navn på detalj (UNNEST session_parameters AS sp)' },
      { name: 'sp.string_value', label: 'Verdi som tekst (UNNEST session_parameters AS sp)' },
      { name: 'sp.number_value', label: 'Verdi som tall (UNNEST session_parameters AS sp)' },
      { name: 'sp.date_value', label: 'Verdi som dato (UNNEST session_parameters AS sp)' },
      { name: 'sp.data_type', label: 'Verditype (UNNEST session_parameters AS sp)' },
    ],
  },
  {
    id: 'event_data',
    title: 'Detaljer på hendelser',
    shortName: 'umami_views.event_data',
    datasetTable: 'umami_views.event_data',
    summary: 'Ekstra informasjon lagret på en hendelse (f.eks. tekst på en knapp eller valg i et skjema).',
    relationLabel: 'event_id → website_event_id',
    joinSnippet: `JOIN \`${projectId}.umami_views.event_data\` ON \`${projectId}.umami_views.event_data\`.website_event_id = \`${projectId}.umami_views.event\`.event_id\nCROSS JOIN UNNEST(\`${projectId}.umami_views.event_data\`.event_parameters) AS ep`,
    columns: [
      { name: 'website_event_id', label: 'Kobles mot event.event_id' },
      { name: 'website_id', label: 'Nettside-ID' },
      { name: 'event_parameters', label: 'Liste med ekstra detaljer på hendelsen' },
      { name: 'ep.data_key', label: 'Navn på detalj' },
      { name: 'ep.string_value', label: 'Verdi (tekst)' },
      { name: 'ep.number_value', label: 'Verdi (tall)' },
      { name: 'ep.date_value', label: 'Verdi (dato)' },
      { name: 'ep.data_type', label: 'Verditype' },
      { name: 'created_at', label: 'Tidspunkt' },
    ],
  },
  {
    id: 'website',
    title: 'Nettsider',
    shortName: 'umami.public_website',
    datasetTable: 'umami.public_website',
    summary: 'Navn og domene for alle nettsider og apper i Innblikk.',
    relationLabel: 'website_id',
    joinSnippet: `LEFT JOIN \`${projectId}.umami.public_website\` ON \`${projectId}.umami_views.event\`.website_id = \`${projectId}.umami.public_website\`.website_id`,
    columns: [
      { name: 'website_id', label: 'Kobles mot event.website_id' },
      { name: 'name', label: 'Navn på nettsiden' },
      { name: 'domain', label: 'Domene (f.eks. aksel.nav.no)' },
      { name: 'share_id', label: 'Delings-ID' },
      { name: 'reset_at', label: 'Tidspunkt for nullstilling' },
      { name: 'user_id', label: 'Eierens bruker-ID' },
      { name: 'team_id', label: 'Team-ID' },
      { name: 'created_by', label: 'Opprettet av (bruker-ID)' },
      { name: 'created_at', label: 'Opprettet' },
      { name: 'updated_at', label: 'Sist oppdatert' },
      { name: 'deleted_at', label: 'Slettet' },
    ],
  },
]

export const getSqlBuildingBlocks = (projectId: string, _selectedWebsiteId?: string): SqlBuildingBlock[] => {
  const eventTable = `\`${projectId}.umami_views.event\``
  const sessionTable = `\`${projectId}.umami_views.session\``
  const eventDataTable = `\`${projectId}.umami_views.event_data\``
  const websiteTable = `\`${projectId}.umami.public_website\``

  return [
    // 1. SQL-kommandoer (Keywords)
    { id: 'kw-select', section: 'keywords', label: 'SELECT', code: 'SELECT\n  ' },
    { id: 'kw-from', section: 'keywords', label: 'FROM', code: '\nFROM\n  ' },
    { id: 'kw-where', section: 'keywords', label: 'WHERE', code: '\nWHERE\n  ' },
    { id: 'kw-and', section: 'keywords', label: 'AND', code: '\n  AND ' },
    { id: 'kw-group', section: 'keywords', label: 'GROUP BY', code: '\nGROUP BY\n  1' },
    { id: 'kw-order', section: 'keywords', label: 'ORDER BY', code: '\nORDER BY\n  ' },
    { id: 'kw-desc', section: 'keywords', label: 'DESC', code: ' DESC' },
    { id: 'kw-asc', section: 'keywords', label: 'ASC', code: ' ASC' },
    { id: 'kw-join', section: 'keywords', label: 'LEFT JOIN', code: '\nLEFT JOIN ' },

    // 2. Felter og tellinger (Fields & Metrics)
    { id: 'fld-all', section: 'fields', label: '* (alle felter)', code: '*' },
    { id: 'fld-url', section: 'fields', label: 'url_path (sidesti)', code: 'url_path' },
    { id: 'fld-title', section: 'fields', label: 'page_title (sidetittel)', code: 'page_title' },
    { id: 'fld-event-name', section: 'fields', label: 'event_name (hendelse)', code: 'event_name' },
    {
      id: 'fld-visitors-cookie',
      section: 'fields',
      label: 'Unike besøkende (cookie)',
      code: "COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende",
    },
    {
      id: 'fld-visitors',
      section: 'fields',
      label: 'Unike besøkende (fingeravtrykk)',
      code: 'COUNT(DISTINCT session_id) AS unike_besokende',
    },
    {
      id: 'fld-views',
      section: 'fields',
      label: 'Tell rader / visninger',
      code: 'COUNT(*) AS antall',
    },
    {
      id: 'fld-visits',
      section: 'fields',
      label: 'Tell økter',
      code: 'COUNT(DISTINCT visit_id) AS okter',
    },
    {
      id: 'fld-date',
      section: 'fields',
      label: 'Dato (per dag)',
      code: "DATE(created_at, 'Europe/Oslo') AS dato",
    },
    { id: 'fld-device', section: 'fields', label: 'device (mobil/pc)', code: 'device' },
    { id: 'fld-browser', section: 'fields', label: 'browser (nettleser)', code: 'browser' },

    // 3. Tabeller (Tables)
    {
      id: 'tbl-event',
      section: 'tables',
      label: 'Hendelser',
      code: eventTable,
    },
    {
      id: 'tbl-session',
      section: 'tables',
      label: 'Brukerdetaljer',
      code: sessionTable,
    },
    {
      id: 'tbl-event-data',
      section: 'tables',
      label: 'Hendelsesdetaljer',
      code: eventDataTable,
    },
    {
      id: 'tbl-website',
      section: 'tables',
      label: 'Nettsider',
      code: websiteTable,
    },

    {
      id: 'flt-pageviews',
      section: 'filters',
      label: 'Bare sidevisninger',
      description: 'Sidevisninger uten klikk og andre hendelser',
      code: 'event_type = 1',
    },
    {
      id: 'flt-events',
      section: 'filters',
      label: 'Bare hendelser',
      description: 'Klikk og andre hendelser uten sidevisninger',
      code: 'event_type = 2',
    },
    {
      id: 'flt-url-like',
      section: 'filters',
      label: 'Sidesti starter med',
      description: 'Filtrer på starten av en sidesti',
      code: "url_path LIKE '/%'",
    },
  ]
}
