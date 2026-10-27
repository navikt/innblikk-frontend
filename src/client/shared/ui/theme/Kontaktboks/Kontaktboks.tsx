import { List, Link, Heading, VStack } from '@navikt/ds-react'
import { BOOKING_URL, SLACK_URL, trackKontakt } from '../Kontakt/trackKontakt.ts'

export default function Kontaktboks() {
  return (
    <VStack gap="space-2" className="mt-12">
      <Heading as="h3" size="medium">
        Ønsker du noen å sparre med?
      </Heading>
      <List as="ul">
        <List.Item>
          <strong>Slack:</strong> Bli med i kanalen{' '}
          <Link href={SLACK_URL} target="_blank" onClick={() => trackKontakt('slack', '#researchops', 'kontaktboks')}>
            #researchops
          </Link>
          .
        </List.Item>
        <List.Item>
          <strong>Samtale:</strong>{' '}
          <Link
            href={BOOKING_URL}
            target="_blank"
            onClick={() => trackKontakt('book-prat', 'Book en prat 1:1 eller workshop', 'kontaktboks')}
          >
            Book en prat 1:1 eller workshop
          </Link>
          .
        </List.Item>
      </List>
    </VStack>
  )
}
