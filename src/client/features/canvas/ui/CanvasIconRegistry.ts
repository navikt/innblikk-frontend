import type { ComponentType, SVGProps } from 'react'
import {
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChatIcon,
  CheckmarkCircleIcon,
  ClockIcon,
  CogIcon,
  EnvelopeClosedIcon,
  FileTextIcon,
  GlobeIcon,
  HeartIcon,
  HouseIcon,
  ImageIcon,
  LightBulbIcon,
  LinkIcon,
  LocationPinIcon,
  MagnifyingGlassIcon,
  PersonIcon,
  PhoneIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  TasklistIcon,
  ThumbUpIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowRightLeftIcon,
  ArrowUpIcon,
  ArrowsAllDirectionsIcon,
  ArrowsUpDownIcon,
} from '@navikt/aksel-icons'

type CanvasIconComponent = ComponentType<SVGProps<SVGSVGElement>>

export type CanvasIconOption = {
  id: string
  label: string
  keywords: string
  Icon: CanvasIconComponent
}

export type CanvasIconColorOption = {
  id: string
  label: string
  value: string
}

export const CANVAS_ICON_OPTIONS: CanvasIconOption[] = [
  { id: 'sparkles', label: 'Sparkles', keywords: 'glitter feiring', Icon: SparklesIcon },
  { id: 'house', label: 'Hus', keywords: 'hjem bolig', Icon: HouseIcon },
  { id: 'person', label: 'Person', keywords: 'bruker profil', Icon: PersonIcon },
  { id: 'calendar', label: 'Kalender', keywords: 'dato plan', Icon: CalendarIcon },
  { id: 'clock', label: 'Klokke', keywords: 'tid frist', Icon: ClockIcon },
  { id: 'tasklist', label: 'Oppgaver', keywords: 'to-do sjekkliste', Icon: TasklistIcon },
  { id: 'checkmark-circle', label: 'Fullført', keywords: 'ok ferdig', Icon: CheckmarkCircleIcon },
  { id: 'file-text', label: 'Dokument', keywords: 'tekst notat', Icon: FileTextIcon },
  { id: 'image', label: 'Bilde', keywords: 'foto illustrasjon', Icon: ImageIcon },
  { id: 'chat', label: 'Chat', keywords: 'melding dialog', Icon: ChatIcon },
  { id: 'envelope-closed', label: 'E-post', keywords: 'mail brev', Icon: EnvelopeClosedIcon },
  { id: 'phone', label: 'Telefon', keywords: 'ring kontakt', Icon: PhoneIcon },
  { id: 'bell', label: 'Varsel', keywords: 'notifikasjon alarm', Icon: BellIcon },
  { id: 'magnifying-glass', label: 'Søk', keywords: 'finn analyse', Icon: MagnifyingGlassIcon },
  { id: 'location-pin', label: 'Lokasjon', keywords: 'sted kart', Icon: LocationPinIcon },
  { id: 'globe', label: 'Nettsted', keywords: 'web internett', Icon: GlobeIcon },
  { id: 'briefcase', label: 'Arbeid', keywords: 'jobb prosjekt', Icon: BriefcaseIcon },
  { id: 'light-bulb', label: 'Ide', keywords: 'forslag innsikt', Icon: LightBulbIcon },
  { id: 'thumb-up', label: 'Anbefalt', keywords: 'like bra', Icon: ThumbUpIcon },
  { id: 'heart', label: 'Favoritt', keywords: 'elsker prioritet', Icon: HeartIcon },
  { id: 'star', label: 'Viktig', keywords: 'stjerne markering', Icon: StarIcon },
  { id: 'link', label: 'Lenke', keywords: 'kobling URL', Icon: LinkIcon },
  { id: 'cog', label: 'Innstillinger', keywords: 'opsjoner oppsett', Icon: CogIcon },
  { id: 'rocket', label: 'Lansering', keywords: 'start vekst', Icon: RocketIcon },
  { id: 'arrow-right', label: 'Pil hoyre', keywords: 'arrow fremover retning', Icon: ArrowRightIcon },
  { id: 'arrow-left', label: 'Pil venstre', keywords: 'arrow tilbake retning', Icon: ArrowLeftIcon },
  { id: 'arrow-up', label: 'Pil opp', keywords: 'arrow opp retning', Icon: ArrowUpIcon },
  { id: 'arrow-down', label: 'Pil ned', keywords: 'arrow ned retning', Icon: ArrowDownIcon },
  { id: 'arrow-right-left', label: 'Pil hoyre venstre', keywords: 'arrow begge retninger', Icon: ArrowRightLeftIcon },
  { id: 'arrows-up-down', label: 'Pil opp ned', keywords: 'arrow vertikal begge retninger', Icon: ArrowsUpDownIcon },
  {
    id: 'arrows-all-directions',
    label: 'Piler alle retninger',
    keywords: 'arrow flytt navigasjon',
    Icon: ArrowsAllDirectionsIcon,
  },
]

export const CANVAS_ICON_COLOR_OPTIONS: CanvasIconColorOption[] = [
  { id: 'black', label: 'Svart', value: '#111111' },
  { id: 'blue', label: 'Bla', value: '#0072B2' },
  { id: 'green', label: 'Gronn', value: '#009E73' },
  { id: 'orange', label: 'Oransje', value: '#E69F00' },
  { id: 'vermillion', label: 'Rod', value: '#D55E00' },
  { id: 'purple', label: 'Lilla', value: '#CC79A7' },
  { id: 'sky', label: 'Lysebla', value: '#56B4E9' },
]

const FALLBACK_CANVAS_ICON_OPTION: CanvasIconOption = {
  id: 'sparkles',
  label: 'Sparkles',
  keywords: 'glitter feiring',
  Icon: SparklesIcon,
}

export const DEFAULT_CANVAS_ICON_ID = CANVAS_ICON_OPTIONS[0]?.id ?? FALLBACK_CANVAS_ICON_OPTION.id
export const DEFAULT_CANVAS_ICON_COLOR = CANVAS_ICON_COLOR_OPTIONS[0]?.value ?? '#111111'

export const getCanvasIconOptionById = (id?: string | null): CanvasIconOption => {
  const matched = CANVAS_ICON_OPTIONS.find((option) => option.id === id)
  return matched ?? CANVAS_ICON_OPTIONS[0] ?? FALLBACK_CANVAS_ICON_OPTION
}

export const getCanvasIconColor = (value?: string | null): string => {
  if (!value) return DEFAULT_CANVAS_ICON_COLOR
  return CANVAS_ICON_COLOR_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_CANVAS_ICON_COLOR
}
