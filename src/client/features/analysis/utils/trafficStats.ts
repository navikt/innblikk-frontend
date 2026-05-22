import type { SeriesPoint, Granularity } from '../model/types.ts'

const DOCS_URL = 'https://reops-docs.ansatt.dev.nav.no/interndokumentasjon/trafikkanalyse-malinger/'

export const METRIC_DOCS_URL = DOCS_URL

export interface MetricExplainer {
  /** Korte ord til HelpText-tittel, brukt som aria-label */
  title: string
  /** Hovedforklaring i HelpText-popoveren */
  body: string
  /** Lenke-tekst og anker i dokumentasjonen */
  docsAnchor: string
  docsLinkText: string
}

const VISITORS_EXPLAINER: MetricExplainer = {
  title: 'Hva er unike besøkende?',
  body:
    'Antall ulike personer som besøkte siden i den valgte perioden. Hver person telles én gang, ' +
    'uavhengig av hvor mange ganger de kom tilbake. ' +
    'På nettsteder uten samtykkebanner identifiseres en person via en hash av IP-adresse og nettlesertype (User-Agent), ' +
    'saltet per måned – ID-en nullstilles ved månedsskiftet. IP-adressen lagres aldri: ' +
    'den brukes kun til å lage hashen og til geo-oppslag (land/by), og forkastes deretter. ' +
    'Ingen canvas, skrifttyper eller plugins leses – dette er ikke fingerprinting. ' +
    'På nettsteder med samtykkebanner brukes en stabil cookie som lar oss kjenne igjen samme person over flere måneder.',
  docsAnchor: '#unike-besøkende',
  docsLinkText: 'Les mer om hvordan unike besøkende telles',
}

const VISITS_EXPLAINER: MetricExplainer = {
  title: 'Hva er en økt / et besøk?',
  body:
    'En økt er én sammenhengende periode med aktivitet fra samme nettleser. ' +
    'Hvis personen er inaktiv i mer enn 30 minutter, regnes neste hendelse som starten på en ny økt. ' +
    'Samme person kan ha flere økter i samme periode.',
  docsAnchor: '#økter--besøk',
  docsLinkText: 'Les mer om økter og besøk',
}

const PAGEVIEWS_EXPLAINER: MetricExplainer = {
  title: 'Hva er sidevisninger?',
  body:
    'Antall ganger sider ble lastet. Hver sideoppdatering teller som en ny sidevisning. ' +
    'Hvis samme person ser samme side flere ganger, telles det like mange ganger.',
  docsAnchor: '#sidevisninger',
  docsLinkText: 'Les mer om sidevisninger',
}

const PROPORTION_EXPLAINER: MetricExplainer = {
  title: 'Hva er andel?',
  body:
    'For hver tidsenhet (dag/uke/måned/time): antall unike besøkende til den valgte URL-stien, delt på antall unike besøkende totalt. ' +
    'Beregnes på hver tidsenhet separat – derfor må du oppgi en URL-sti. ' +
    'Merk: «Gjennomsnittlig andel» i kortet er snittet av brøkene per tidsenhet, ikke andelen for hele perioden samlet.',
  docsAnchor: '#andel',
  docsLinkText: 'Les mer om andel-beregningen',
}

export const getMetricExplainer = (metricType: string): MetricExplainer => {
  switch (metricType) {
    case 'visits':
      return VISITS_EXPLAINER
    case 'pageviews':
      return PAGEVIEWS_EXPLAINER
    case 'proportion':
      return PROPORTION_EXPLAINER
    case 'visitors':
    default:
      return VISITORS_EXPLAINER
  }
}

export interface TotalExplainer {
  /** Tittel på HelpText-popoveren over Totalt-kortet */
  title: string
  /** Forklaring av hva «Totalt» faktisk er for valgt visning */
  body: string
}

export const getTotalExplainer = (metricType: string): TotalExplainer => {
  switch (metricType) {
    case 'visitors':
      return {
        title: 'Hva betyr «Totalt» her?',
        body:
          'Antall unike besøkende over hele den valgte perioden, telt én gang per person. ' +
          'Dette er ikke summen av dagstallene i grafen – samme person kan dukke opp på flere dager, ' +
          'men telles likevel kun én gang i totalen.',
      }
    case 'visits':
      return {
        title: 'Hva betyr «Totalt» her?',
        body:
          'Antall økter over hele den valgte perioden. Beregnes som ett samlet antall over hele tidsvinduet, ' +
          'ikke som summen av dagstallene.',
      }
    case 'pageviews':
      return {
        title: 'Hva betyr «Totalt» her?',
        body: 'Sum av alle sidevisninger i perioden. Sidevisninger er additive, så summen er korrekt.',
      }
    case 'proportion':
      return {
        title: 'Hva betyr «Gjennomsnittlig andel»?',
        body:
          'Snittet av andelene per tidsenhet (dag/uke/måned/time). ' +
          'Merk at dette ikke nødvendigvis er det samme som andelen for hele perioden samlet – ' +
          'de er bare like hvis trafikken fordeler seg jevnt over tid.',
      }
    default:
      return {
        title: 'Hva betyr «Totalt» her?',
        body: 'Samlet verdi for hele den valgte perioden.',
      }
  }
}

export const formatMetricValue = (val: number, metricType: string): string => {
  if (metricType === 'proportion') {
    return `${(val * 100).toFixed(1)}%`
  }
  return Math.round(val).toLocaleString('nb-NO')
}

export const getMetricLabel = (type: string): string => {
  switch (type) {
    case 'pageviews':
      return 'sidevisninger'
    case 'visits':
      return 'økter'
    default:
      return 'unike besøkende'
  }
}

export const getTimeUnitLabel = (granularity: Granularity): string => {
  switch (granularity) {
    case 'hour':
      return 'time'
    case 'week':
      return 'uke'
    case 'month':
      return 'måned'
    default:
      return 'dag'
  }
}

const formatMaxLabel = (time: string, granularity: Granularity): string => {
  const date = new Date(time)
  if (granularity === 'hour') {
    const timeStr = date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
    return `${date.toLocaleDateString('nb-NO')} ${timeStr}`
  }
  if (granularity === 'month') {
    return date.toLocaleString('nb-NO', { month: 'long', year: 'numeric' })
  }
  return date.toLocaleDateString('nb-NO')
}

export interface TrafficStatsBoxes {
  box1Label: string
  box1Value: number
  box2Label: string
  box2Value: number
  box2Suffix: string
  box3Label: string
  box3Value: number
  box3Subtext: string
  valueSuffix: string
}

export const computeTrafficStats = (
  data: SeriesPoint[],
  metricType: string,
  totalOverride: number | undefined,
  granularity: Granularity,
): TrafficStatsBoxes | null => {
  if (!data || data.length === 0) return null

  const values = data.map((item) => item.count)
  const sum = values.reduce((a, b) => a + b, 0)
  const avg = sum / values.length

  const maxItem = data.reduce((prev, current) => (prev.count > current.count ? prev : current), data[0])
  const max = maxItem.count
  const maxLabelText = formatMaxLabel(maxItem.time, granularity)

  const sortedValues = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sortedValues.length / 2)
  const median = sortedValues.length % 2 !== 0 ? sortedValues[mid] : (sortedValues[mid - 1] + sortedValues[mid]) / 2

  const valueSuffix = metricType === 'proportion' ? '' : getMetricLabel(metricType)
  const timeUnitLabel = getTimeUnitLabel(granularity)

  if (metricType === 'proportion') {
    return {
      box1Label: 'Gjennomsnittlig andel',
      box1Value: avg,
      box2Label: 'Median andel',
      box2Value: median,
      box2Suffix: '',
      box3Label: 'Høyeste andel',
      box3Value: max,
      box3Subtext: maxLabelText,
      valueSuffix,
    }
  }

  let box3Label = 'Topp-periode'
  if (granularity === 'day') box3Label = 'Toppdag'
  if (granularity === 'hour') box3Label = 'Topp-time'

  return {
    box1Label: 'Totalt',
    box1Value: totalOverride !== undefined ? totalOverride : sum,
    box2Label: `Snitt per ${timeUnitLabel}`,
    box2Value: avg,
    box2Suffix: `${valueSuffix} (median: ${formatMetricValue(median, metricType)})`,
    box3Label: `${box3Label} ${maxLabelText}`,
    box3Value: max,
    box3Subtext: '',
    valueSuffix,
  }
}
