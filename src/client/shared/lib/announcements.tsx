import type { ReactNode } from 'react'
import { HStack } from '@navikt/ds-react'
import { AnnouncementButton } from '../ui/theme/AnnouncementBanner/AnnouncementButton.tsx'

export type AnnouncementAction = {
  label: string
  onClick?: () => void
}

type AnnouncementBase = {
  type: string
  version: number
}

export type InlineAnnouncement = AnnouncementBase & {
  variant: 'inline'
  title: ReactNode
  action?: AnnouncementAction
}

export type RichAnnouncement = AnnouncementBase & {
  variant: 'rich'
  title: ReactNode
  content: ReactNode
  primaryAction?: AnnouncementAction
  secondaryAction?: AnnouncementAction
}

export type Announcement = InlineAnnouncement | RichAnnouncement

export const ANNOUNCEMENTS: Announcement[] = [
  {
    type: 'beta-advert',
    version: 1,
    variant: 'inline',
    title: (
      <HStack gap="space-12" align="center" wrap={false}>
        <span>Meld deg på betaprogrammet!</span>
        <AnnouncementButton href="/profil#betaprogram">Kom i gang</AnnouncementButton>
      </HStack>
    ),
  },
]

const DISMISSED_KEY = 'innblikk_dismissed_announcements'

const getDismissed = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY)
    if (!stored) return {}
    return JSON.parse(stored) as Record<string, number>
  } catch {
    return {}
  }
}

export const getActiveAnnouncement = (): Announcement | null => {
  const dismissed = getDismissed()
  return ANNOUNCEMENTS.find((a) => (dismissed[a.type] ?? 0) < a.version) ?? null
}

export const dismissAnnouncement = (type: string, version: number): void => {
  try {
    const dismissed = getDismissed()
    dismissed[type] = version
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed))
  } catch {
    return
  }
}
