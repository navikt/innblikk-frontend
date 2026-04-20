import { useState } from 'react'
import { GlobalAlert, Button, HStack } from '@navikt/ds-react'
import {
  getActiveAnnouncement,
  dismissAnnouncement,
  type InlineAnnouncement,
  type RichAnnouncement,
} from '../../../lib/announcements.tsx'

function InlineBanner({ announcement, onDismiss }: { announcement: InlineAnnouncement; onDismiss: () => void }) {
  return (
    <GlobalAlert status="announcement">
      <GlobalAlert.Header>
        <GlobalAlert.Title>{announcement.title}</GlobalAlert.Title>
        <GlobalAlert.CloseButton onClick={onDismiss} />
      </GlobalAlert.Header>
    </GlobalAlert>
  )
}

function RichBanner({ announcement, onDismiss }: { announcement: RichAnnouncement; onDismiss: () => void }) {
  const hasPrimary = !!announcement.primaryAction
  const hasSecondary = !!announcement.secondaryAction

  return (
    <GlobalAlert status="announcement">
      <GlobalAlert.Header>
        <GlobalAlert.Title>{announcement.title}</GlobalAlert.Title>
        <GlobalAlert.CloseButton onClick={onDismiss} />
      </GlobalAlert.Header>
      <GlobalAlert.Content>
        {announcement.content}
        {(hasPrimary || hasSecondary) && (
          <HStack gap="space-4" align="center" style={{ marginTop: '0.5rem' }}>
            {hasPrimary && (
              <Button
                size="small"
                variant="secondary-neutral"
                onClick={() => {
                  announcement.primaryAction?.onClick?.()
                  onDismiss()
                }}
              >
                {announcement.primaryAction!.label}
              </Button>
            )}
            {hasSecondary && (
              <Button
                size="small"
                variant="tertiary-neutral"
                onClick={() => {
                  announcement.secondaryAction?.onClick?.()
                  onDismiss()
                }}
              >
                {announcement.secondaryAction!.label}
              </Button>
            )}
          </HStack>
        )}
      </GlobalAlert.Content>
    </GlobalAlert>
  )
}

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState(() => getActiveAnnouncement())

  if (!announcement) return null

  const dismiss = () => {
    dismissAnnouncement(announcement.type, announcement.version)
    setAnnouncement(null)
  }

  if (announcement.variant === 'inline') {
    return <InlineBanner announcement={announcement} onDismiss={dismiss} />
  }

  return <RichBanner announcement={announcement} onDismiss={dismiss} />
}
