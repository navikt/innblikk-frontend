import { Events } from '@navikt/analytics-types'
import { trackEvent } from '../../../lib/trackEvent.ts'

export const SLACK_URL = 'https://nav-it.slack.com/archives/C02UGFS2J4B'
export const BOOKING_URL = 'https://outlook.office365.com/owa/calendar/TeamResearchOps@nav.no/bookings/'

export function trackKontakt(kanal: 'slack' | 'book-prat', lenketekst: string, kilde: string) {
  trackEvent(Events.NAVIGERE, {
    lenketekst,
    destinasjon: kanal === 'slack' ? SLACK_URL : BOOKING_URL,
    lenkegruppe: `kontakt-${kanal}`,
    komponentId: kilde,
    seksjon: window.location.pathname.split('/').filter(Boolean)[0] ?? 'forside',
  })
}
