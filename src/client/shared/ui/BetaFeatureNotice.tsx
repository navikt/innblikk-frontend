import { useState } from 'react'
import { BodyShort, Box, Button, Heading, HStack, Link } from '@navikt/ds-react'
import { TestFlaskIcon, XMarkIcon } from '@navikt/aksel-icons'
import { dismissAlert, isAlertDismissed } from '../lib/dismissedAlerts.ts'

export const RESEARCHOPS_SLACK_URL = 'https://nav-it.slack.com/archives/C02UGFS2J4B'

interface BetaFeatureNoticeProps {
  /** Dismissal key, must match an entry in shared/lib/betaFeatures.ts. */
  id: string
  /** e.g. «Grafbyggeren er i beta». */
  title: string
  children: React.ReactNode
  /**
   * Dismissable (default, used where the feature is mounted, persists in
   * localStorage) or static (used in the /profil overview, always visible,
   * no close button).
   */
  variant?: 'dismissable' | 'static'
  className?: string
}

/**
 * Purple flask banner marking a *feature* as being in beta. Beta is a
 * per-feature state, not a user opt-in: everyone sees these, and dismissing
 * one only hides that feature's notice on this device.
 *
 * The static variant doubles as the content of the «Funksjoner i beta»
 * overview on /profil, so the notice copy lives in exactly one place.
 */
export function BetaFeatureNotice({ id, title, children, variant = 'dismissable', className }: BetaFeatureNoticeProps) {
  const [dismissed, setDismissed] = useState(() => variant === 'dismissable' && isAlertDismissed(id))

  // Static variant (overview on /profil) always renders; dismissable hides once dismissed.
  if (variant === 'dismissable' && dismissed) return null

  const handleDismiss = () => {
    dismissAlert(id)
    setDismissed(true)
  }

  return (
    <Box
      data-color="meta-purple"
      role="status"
      className={className}
      style={{
        background: 'var(--ax-bg-moderate)',
        border: '1px solid var(--ax-border-subtleA)',
        borderRadius: 'var(--ax-radius-12)',
        padding: 'var(--ax-space-12) var(--ax-space-16)',
      }}
    >
      <HStack gap="space-12" align="start" wrap={false}>
        <TestFlaskIcon
          aria-hidden
          fontSize="1.5rem"
          style={{ color: 'var(--ax-text-decoration)', flexShrink: 0, marginBlockStart: 'var(--ax-space-2)' }}
        />
        <div style={{ flexGrow: 1 }}>
          <Heading level="2" size="xsmall" style={{ color: 'var(--ax-text-default)' }}>
            {title}
          </Heading>
          <BodyShort size="small" style={{ color: 'var(--ax-text-default)' }}>
            {children}
          </BodyShort>
        </div>
        {variant === 'dismissable' && (
          <Button
            variant="tertiary"
            size="small"
            icon={<XMarkIcon aria-hidden />}
            onClick={handleDismiss}
            aria-label="Lukk melding"
            style={{
              marginBlockStart: 'calc(-1 * var(--ax-space-4))',
              marginInlineEnd: 'calc(-1 * var(--ax-space-8))',
            }}
          />
        )}
      </HStack>
    </Box>
  )
}

/** Standard closing line for beta notices, with the Slack feedback link. */
export function BetaFeedbackLine() {
  return (
    <>
      {' '}
      Tilbakemelding? Si ifra i{' '}
      <Link href={RESEARCHOPS_SLACK_URL} target="_blank">
        #researchops
      </Link>{' '}
      på Slack.
    </>
  )
}

export default BetaFeatureNotice
