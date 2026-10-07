import { Heading, Link } from '@navikt/ds-react'
import { AppBlock } from '../AppBlock/AppBlock.tsx'
import styles from './KontaktSeksjon.module.css'

interface KontaktSeksjonProps {
  narrowContent?: boolean
}

export const KontaktSeksjon = ({ narrowContent = false }: KontaktSeksjonProps) => {
  const contentWrapperClass = narrowContent
    ? `${styles.contentWrapper} ${styles.contentWrapperNarrow}`
    : styles.contentWrapper

  return (
    <div className={styles.section}>
      <AppBlock>
        <div className={contentWrapperClass}>
          <Heading as="h2" size="medium" className={styles.heading}>
            Ønsker du noen å sparre med?
          </Heading>

          <div className={styles.cardsGrid}>
            {/* Chat med oss - Slack */}
            <div className={styles.card}>
              <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B" target="_blank">
                <Heading as="h2" size="medium" className={styles.cardHeading}>
                  Chat med ResearchOps
                </Heading>
              </Link>
              <p className={styles.cardText}>
                Bli med i Slack-kanalen{' '}
                <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B" target="_blank">
                  #researchops
                </Link>{' '}
                for å stille spørsmål og få hjelp.
              </p>
            </div>

            {/* Book en samtale */}
            <div className={styles.card}>
              <Link href="https://outlook.office365.com/owa/calendar/TeamResearchOps@nav.no/bookings/" target="_blank">
                <Heading as="h2" size="medium" className={styles.cardHeading}>
                  Du kan også booke en samtale
                </Heading>
              </Link>
              <p className={styles.cardText}>
                <Link
                  href="https://outlook.office365.com/owa/calendar/TeamResearchOps@nav.no/bookings/"
                  target="_blank"
                >
                  Book en prat 1:1 eller workshop
                </Link>{' '}
                med ResearchOps-teamet.
              </p>
            </div>
          </div>
        </div>
      </AppBlock>
    </div>
  )
}
