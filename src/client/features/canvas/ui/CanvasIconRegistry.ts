import * as AkselIcons from '@navikt/aksel-icons'
import type { ComponentType, SVGProps } from 'react'
import akselIconMetadata from '../../../../data/aksel-icon-medatata.json'

type CanvasIconComponent = ComponentType<SVGProps<SVGSVGElement>>

type AkselIconMetadataEntry = {
  id: string
  name: string
  category?: string
  sub_category?: string
  keywords?: string[]
  variant?: string
}

export type CanvasIconOption = {
  id: string
  label: string
  keywords: string
  category: string
  subCategory: string
  variant: 'Stroke' | 'Fill'
  Icon: CanvasIconComponent
}

export type CanvasIconColorOption = {
  id: string
  label: string
  value: string
}

const LEGACY_ICON_ID_ALIASES: Record<string, string> = {
  sparkles: 'Sparkles',
  house: 'House',
  person: 'Person',
  calendar: 'Calendar',
  clock: 'Clock',
  tasklist: 'Tasklist',
  'checkmark-circle': 'CheckmarkCircle',
  'file-text': 'FileText',
  image: 'Image',
  chat: 'Chat',
  'envelope-closed': 'EnvelopeClosed',
  phone: 'Phone',
  bell: 'Bell',
  'magnifying-glass': 'MagnifyingGlass',
  'location-pin': 'LocationPin',
  globe: 'Globe',
  briefcase: 'Briefcase',
  'light-bulb': 'LightBulb',
  'thumb-up': 'ThumbUp',
  heart: 'Heart',
  star: 'Star',
  link: 'Link',
  cog: 'Cog',
  rocket: 'Rocket',
  'arrow-right': 'ArrowRight',
  'arrow-left': 'ArrowLeft',
  'arrow-up': 'ArrowUp',
  'arrow-down': 'ArrowDown',
  'arrow-right-left': 'ArrowRightLeft',
  'arrows-up-down': 'ArrowsUpDown',
  'arrows-all-directions': 'ArrowsAllDirections',
}

const formatIconLabel = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()

const metadataEntries = Object.values(akselIconMetadata as Record<string, AkselIconMetadataEntry>)

export const CANVAS_ICON_OPTIONS: CanvasIconOption[] = metadataEntries
  .map((entry) => {
    const componentName = `${entry.id}Icon` as keyof typeof AkselIcons
    const Icon = AkselIcons[componentName] as CanvasIconComponent | undefined
    if (!Icon) return null

    const label = formatIconLabel(entry.name || entry.id)
    const keywords = [
      entry.id,
      entry.name,
      label,
      entry.category,
      entry.sub_category,
      ...(entry.keywords ?? []),
      entry.variant,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase()

    return {
      id: entry.id,
      label,
      keywords,
      category: entry.category || 'Other',
      subCategory: entry.sub_category || 'General',
      variant: entry.variant === 'Fill' ? 'Fill' : 'Stroke',
      Icon,
    }
  })
  .filter((option): option is CanvasIconOption => option !== null)
  .sort((a, b) => a.label.localeCompare(b.label, 'nb-NO'))

const FALLBACK_CANVAS_ICON_OPTION: CanvasIconOption = {
  id: 'Sparkles',
  label: 'Sparkles',
  keywords: 'sparkles glitter feiring',
  category: 'Other',
  subCategory: 'General',
  variant: 'Stroke',
  Icon: AkselIcons.SparklesIcon,
}

export const CANVAS_ICON_COLOR_OPTIONS: CanvasIconColorOption[] = [
  { id: 'black', label: 'Svart', value: '#111111' },
  { id: 'blue', label: 'Bla', value: '#0072B2' },
  { id: 'green', label: 'Gronn', value: '#009E73' },
  { id: 'orange', label: 'Oransje', value: '#E69F00' },
  { id: 'vermillion', label: 'Rod', value: '#D55E00' },
  { id: 'purple', label: 'Lilla', value: '#CC79A7' },
  { id: 'sky', label: 'Lysebla', value: '#56B4E9' },
]

export const DEFAULT_CANVAS_ICON_ID = CANVAS_ICON_OPTIONS.find((option) => option.id === 'Sparkles')?.id ?? 'Sparkles'
export const DEFAULT_CANVAS_ICON_COLOR = CANVAS_ICON_COLOR_OPTIONS[0]?.value ?? '#111111'

export const getCanvasIconOptionById = (id?: string | null): CanvasIconOption => {
  if (!id) return CANVAS_ICON_OPTIONS[0] ?? FALLBACK_CANVAS_ICON_OPTION

  const normalizedId = LEGACY_ICON_ID_ALIASES[id] ?? id
  const matched = CANVAS_ICON_OPTIONS.find((option) => option.id === normalizedId)
  return matched ?? CANVAS_ICON_OPTIONS[0] ?? FALLBACK_CANVAS_ICON_OPTION
}

export const getCanvasIconColor = (value?: string | null): string => {
  if (!value) return DEFAULT_CANVAS_ICON_COLOR
  return CANVAS_ICON_COLOR_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_CANVAS_ICON_COLOR
}
