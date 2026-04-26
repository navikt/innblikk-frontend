import type { SentenceState, TokenOption } from './types'

export const SLOT_LABELS: Record<keyof SentenceState, string> = {
  metric: 'Måltall',
  timeBucket: 'Tidsnivå',
  groupBy: 'Gruppering',
  period: 'Periode',
  limit: 'Maks rader',
}

export const TOKENS: TokenOption[] = [
  { id: 'metric-users', label: 'Unike brukere', value: 'users', slot: 'metric' },
  { id: 'metric-visits', label: 'Økter / besøk', value: 'visits', slot: 'metric' },
  { id: 'metric-pageviews', label: 'Sidevisninger', value: 'pageviews', slot: 'metric' },
  { id: 'metric-events', label: 'Hendelser', value: 'events', slot: 'metric' },

  { id: 'time-day', label: 'Per dag', value: 'day', slot: 'timeBucket' },
  { id: 'time-week', label: 'Per uke', value: 'week', slot: 'timeBucket' },
  { id: 'time-month', label: 'Per måned', value: 'month', slot: 'timeBucket' },

  { id: 'group-none', label: 'Ingen gruppering', value: 'none', slot: 'groupBy' },
  { id: 'group-event', label: 'Hendelsesnavn', value: 'event_name', slot: 'groupBy' },
  { id: 'group-event-type', label: 'Hendelsestype', value: 'event_type', slot: 'groupBy' },
  { id: 'group-event-id', label: 'Unike hendelser (ID)', value: 'event_id', slot: 'groupBy' },
  { id: 'group-url', label: 'Side (URL-sti)', value: 'url_path', slot: 'groupBy' },
  { id: 'group-url-query', label: 'URL-spørring', value: 'url_query', slot: 'groupBy' },
  { id: 'group-url-fullpath', label: 'URL-sti og spørring', value: 'url_fullpath', slot: 'groupBy' },
  { id: 'group-page-title', label: 'Sidetittel', value: 'page_title', slot: 'groupBy' },
  { id: 'group-ref-domain', label: 'Henvisningsdomene', value: 'referrer_domain', slot: 'groupBy' },
  { id: 'group-ref-path', label: 'Henvisningssti', value: 'referrer_path', slot: 'groupBy' },
  { id: 'group-ref-query', label: 'Henvisningsspørring', value: 'referrer_query', slot: 'groupBy' },
  { id: 'group-ref-fullpath', label: 'Henvisning sti og spørring', value: 'referrer_fullpath', slot: 'groupBy' },
  { id: 'group-ref-fullurl', label: 'Henvisning fullstendig URL', value: 'referrer_fullurl', slot: 'groupBy' },
  { id: 'group-session-id', label: 'Unike besøkende / personer (ID)', value: 'session_id', slot: 'groupBy' },
  { id: 'group-visit-id', label: 'Unike besøk / økter (ID)', value: 'visit_id', slot: 'groupBy' },
  { id: 'group-browser', label: 'Nettleser', value: 'browser', slot: 'groupBy' },
  { id: 'group-os', label: 'Operativsystem', value: 'os', slot: 'groupBy' },
  { id: 'group-device', label: 'Enhetstype', value: 'device', slot: 'groupBy' },
  { id: 'group-screen', label: 'Skjermstørrelse', value: 'screen', slot: 'groupBy' },
  { id: 'group-language', label: 'Språk', value: 'language', slot: 'groupBy' },
  { id: 'group-country', label: 'Land', value: 'country', slot: 'groupBy' },
  { id: 'group-visit-duration', label: 'Besøksvarighet', value: 'visit_duration', slot: 'groupBy' },

  { id: 'period-7', label: 'Siste 7 dager', value: '7', slot: 'period' },
  { id: 'period-30', label: 'Siste 30 dager', value: '30', slot: 'period' },
  { id: 'period-90', label: 'Siste 90 dager', value: '90', slot: 'period' },

  { id: 'limit-25', label: '25 rader', value: '25', slot: 'limit' },
  { id: 'limit-100', label: '100 rader', value: '100', slot: 'limit' },
  { id: 'limit-250', label: '250 rader', value: '250', slot: 'limit' },
]

export const DEFAULT_SENTENCE: SentenceState = {
  metric: '',
  timeBucket: '',
  groupBy: '',
  period: '',
  limit: '',
}
