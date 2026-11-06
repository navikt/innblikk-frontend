export type RepetitionSignal = 'pageviews' | 'interactions' | 'duplicates'

export interface RepetitionExample {
  startedAt: string
  endedAt: string
  eventCount: number
  durationSeconds: number
  sessionId: string
  visitId: string
  visitorType: 'cookie' | 'fingerprint'
  device: string
  browser: string
  eventIds: string[]
  kind: 'largest' | 'latest'
}

export interface RepetitionFinding {
  signal: RepetitionSignal
  hostname: string
  page: string
  eventName: string
  target: string
  hasTarget: boolean
  episodes: number
  affectedVisitors: number
  maxRepetitions: number
  examples: RepetitionExample[]
}

export interface RepetitionResult {
  summary: {
    totalVisitors: number
    totalVisits: number
    cookieVisitors: number
    fingerprintVisitors: number
    eventsWithoutVisit: number
    totalEvents: number
    customEvents: number
    interactionEvents: number
    targetedInteractionEvents: number
    tiedTimestamps: number
  }
  affectedVisitors: number
  totalEpisodes: number
  duplicateEpisodes: number
  totalFindings: number
  signalFindings: Record<RepetitionSignal, number>
  findings: RepetitionFinding[]
  generatedSql: string
  isGeneratedData: boolean
  queryStats: { totalBytesProcessedGB: number; estimatedCostUSD: number } | null
}

export const signalLabels: Record<RepetitionSignal, string> = {
  pageviews: 'Gjentatte sidevisninger',
  interactions: 'Gjentatte interaksjoner',
  duplicates: 'Mulig dobbelsporing',
}

export const signalExplanations: Record<RepetitionSignal, string> = {
  pageviews:
    'Minst 3 påfølgende sidevisninger av samme side innen 30 sekunder i ett besøk. Kan skyldes oppdatering, navigasjon, flere faner eller dobbelsporing – ikke nødvendigvis frustrasjon.',
  interactions:
    'Minst 3 like, sporede interaksjoner på samme side innen 5 sekunder i ett besøk. Kontroller om gjentakelsen er forventet, for eksempel i en karusell eller en teller.',
  duplicates:
    'Minst 2 hendelser med ulike hendelses-ID-er og like funksjonelle egenskaper innen 100 millisekunder i ett besøk. Kontroller sporingsoppsettet og tidsstemplenes presisjon før du konkluderer.',
}

export const signalSummaries: Record<RepetitionSignal, string> = {
  pageviews: 'minst 3 påfølgende visninger av samme side innen 30 sekunder.',
  interactions: 'minst 3 like klikk (navigere, klikk m.fl.) på samme side innen 5 sekunder.',
  duplicates: 'minst 2 like hendelser innen 100 millisekunder, som kan tyde på dobbelsporing.',
}

export const signalActions: Record<RepetitionSignal, string> = {
  pageviews:
    'Se etter manglende status, lastetid eller feil før oppdateringene. Sjekk også om sidevisningen sendes flere ganger automatisk.',
  interactions:
    'Sjekk hva knappen eller lenken skulle gjøre, og om neste registrerte aktivitet tyder på at handlingen kom videre. Gjentatte klikk kan også være forventet.',
  duplicates:
    'Kontroller om flere sporingskoder sender samme hendelse, eller om en hendelseslytter registreres flere ganger. Sammenlign egenskapene i aktivitetsloggen.',
}

export interface RepetitionActivity {
  events: {
    id: string
    createdAt: string
    eventType: number
    eventName: string
    path: string
    title: string
    hostname: string
    phase: 'before' | 'during' | 'after'
    highlighted: boolean
    properties: { key: string; value: string }[]
    propertyCount: number
  }[]
  omittedEvents: number
  isGeneratedData: boolean
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Analysen mottok et ugyldig datasvar.')
  return value as Record<string, unknown>
}

function number(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
    throw new Error('Analysen mottok en ugyldig tallverdi.')
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Analysen mottok en ugyldig tallverdi.')
  return parsed
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Analysen mottok en ugyldig tekstverdi.')
  return value
}

function timestamp(value: unknown): string {
  const parsed = text(typeof value === 'string' ? value : record(value).value)
  if (!Number.isFinite(Date.parse(parsed))) throw new Error('Analysen mottok et ugyldig tidspunkt.')
  return parsed
}

function example(value: unknown): RepetitionExample {
  const row = record(value)
  if (row.visitor_type !== 'cookie' && row.visitor_type !== 'fingerprint')
    throw new Error('Analysen mottok en ukjent ID-type.')
  if (
    !Array.isArray(row.event_ids) ||
    row.event_ids.length === 0 ||
    row.event_ids.length > 100 ||
    row.event_ids.some((id) => typeof id !== 'string' || !id || id.length > 100)
  )
    throw new Error('Analysen mangler hendelsene som inngår i funnet. Kjør analysen på nytt.')
  if (row.example_kind !== 'largest' && row.example_kind !== 'latest')
    throw new Error('Analysen mottok en ukjent eksempeltype.')
  return {
    startedAt: timestamp(row.started_at),
    endedAt: timestamp(row.ended_at),
    eventCount: number(row.event_count),
    durationSeconds: number(row.duration_seconds),
    sessionId: text(row.session_id),
    visitId: text(row.visit_id),
    visitorType: row.visitor_type,
    device: text(row.device),
    browser: text(row.browser),
    eventIds: row.event_ids.map(text),
    kind: row.example_kind,
  }
}

function finding(value: unknown): RepetitionFinding {
  const row = record(value)
  if (row.signal !== 'pageviews' && row.signal !== 'interactions' && row.signal !== 'duplicates') {
    throw new Error('Analysen mottok en ukjent funntype.')
  }
  if (!Array.isArray(row.examples)) throw new Error('Analysen mangler eksempler.')
  return {
    signal: row.signal,
    hostname: text(row.hostname),
    page: text(row.page),
    eventName: text(row.event_name),
    target: text(row.target),
    hasTarget: number(row.has_target) === 1,
    episodes: number(row.episodes),
    affectedVisitors: number(row.affected_visitors),
    maxRepetitions: number(row.max_repetitions),
    examples: row.examples.map(example),
  }
}

export function parseRepetitionResult(value: unknown): RepetitionResult {
  const row = record(value)
  const summary = record(row.summary)
  if (!Array.isArray(row.findings) || typeof row.is_generated_data !== 'boolean') {
    throw new Error('Analysen mottok et ugyldig datasvar.')
  }
  const stats = row.queryStats == null ? null : record(row.queryStats)
  const signalFindings = record(row.signal_findings)
  return {
    summary: {
      totalVisitors: number(summary.total_visitors),
      totalVisits: number(summary.total_visits),
      cookieVisitors: number(summary.cookie_visitors),
      fingerprintVisitors: number(summary.fingerprint_visitors),
      eventsWithoutVisit: number(summary.events_without_visit),
      totalEvents: number(summary.total_events),
      customEvents: number(summary.custom_events),
      interactionEvents: number(summary.interaction_events),
      targetedInteractionEvents: number(summary.targeted_interaction_events),
      tiedTimestamps: number(summary.tied_timestamps),
    },
    affectedVisitors: number(row.affected_visitors),
    totalEpisodes: number(row.total_episodes),
    duplicateEpisodes: number(row.duplicate_episodes),
    totalFindings: number(row.total_findings),
    signalFindings: {
      pageviews: number(signalFindings.pageviews),
      interactions: number(signalFindings.interactions),
      duplicates: number(signalFindings.duplicates),
    },
    findings: row.findings.map(finding),
    generatedSql: text(row.generatedSql),
    isGeneratedData: row.is_generated_data,
    queryStats: stats
      ? { totalBytesProcessedGB: number(stats.totalBytesProcessedGB), estimatedCostUSD: number(stats.estimatedCostUSD) }
      : null,
  }
}

export function parseRepetitionActivity(value: unknown): RepetitionActivity {
  const row = record(value)
  if (!Array.isArray(row.activity) || typeof row.is_generated_data !== 'boolean')
    throw new Error('Aktivitetsloggen mottok et ugyldig datasvar.')
  return {
    omittedEvents: number(row.omitted_events),
    isGeneratedData: row.is_generated_data,
    events: row.activity.map((value: unknown) => {
      const event = record(value)
      if (event.phase !== 'before' && event.phase !== 'during' && event.phase !== 'after')
        throw new Error('Aktivitetsloggen mottok en ukjent fase.')
      if (!Array.isArray(event.properties)) throw new Error('Aktivitetsloggen mangler hendelsesegenskaper.')
      if (typeof event.is_highlighted !== 'boolean') throw new Error('Aktivitetsloggen mangler markering av funnet.')
      return {
        id: text(event.event_id),
        createdAt: timestamp(event.created_at),
        eventType: number(event.event_type),
        eventName: text(event.event_name),
        path: text(event.url_path),
        title: text(event.page_title),
        hostname: text(event.hostname),
        phase: event.phase,
        highlighted: event.is_highlighted,
        propertyCount: number(event.property_count),
        properties: event.properties.map((value: unknown) => {
          const property = record(value)
          return { key: text(property.key), value: text(property.value) }
        }),
      }
    }),
  }
}
