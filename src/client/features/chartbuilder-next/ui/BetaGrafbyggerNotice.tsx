import { useState } from 'react'
import { BodyShort, Box, Button, HStack, Link } from '@navikt/ds-react'
import { TestFlaskIcon, XMarkIcon } from '@navikt/aksel-icons'
import { dismissAlert, isAlertDismissed } from '../../../shared/lib/dismissedAlerts.ts'
import { getFeatureFlag } from '../../../shared/lib/featureFlags.ts'

const DISMISS_ID = 'grafbygger-next-beta-rollout'

/**
 * One-time notice for beta-opted-in users landing on the rewritten grafbygger
 * via the /grafbygger route gate (see routes.tsx GrafbyggerRoute). Purple +
 * TestFlask to match the app's other beta surfaces (Header tag, PageHeader).
 * Dismissal persists in localStorage, so it is shown once and never again.
 *
 * Only shown to beta-opted-in users: the message explains the *automatic*
 * switch, which doesn't apply to non-beta visitors on the explicit
 * /grafbygger_next route. Remove together with the route gate at full rollout.
 */
export function BetaGrafbyggerNotice() {
  const [dismissed, setDismissed] = useState(() => isAlertDismissed(DISMISS_ID))

  if (!getFeatureFlag('beta_opt_in') || dismissed) return null

  const handleDismiss = () => {
    dismissAlert(DISMISS_ID)
    setDismissed(true)
  }

  return (
    <Box
      data-color="meta-purple"
      role="status"
      className="mb-4"
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
        <BodyShort size="small" style={{ color: 'var(--ax-text-default)', flexGrow: 1 }}>
          <strong style={{ display: 'block' }}>Du ser nå den nye Grafbyggeren</strong>
          Fordi du er med i beta-programmet, har Grafbyggeren fått nytt utseende, med blant annet støtte for
          brukergrupper. Tilbakemeldinger mottas med takk i{' '}
          <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B" target="_blank">
            #researchops
          </Link>{' '}
          på Slack!
        </BodyShort>
        <Button
          variant="tertiary"
          size="small"
          icon={<XMarkIcon aria-hidden />}
          onClick={handleDismiss}
          aria-label="Lukk melding"
          style={{ marginBlockStart: 'calc(-1 * var(--ax-space-4))', marginInlineEnd: 'calc(-1 * var(--ax-space-8))' }}
        />
      </HStack>
    </Box>
  )
}

export default BetaGrafbyggerNotice
