import { BarChartIcon, MagnifyingGlassIcon, PersonGroupIcon, SparklesIcon } from '@navikt/aksel-icons'
import React from 'react'

export interface ChartGroup {
  title: string
  icon: React.ReactNode
  ids: string[]
}

// Trafikkanalyse (trafikkoversikt/klikkoversikt/navigasjonsflyt/trakt), Hendelser
// (event-explorer/hendelsesreiser), and Brukere (brukersammensetning/enkeltbrukere/
// brukerlojalitet/maloppnaelse) live in the global left Sidebar (see
// shared/ui/theme/Sidebar/Sidebar.tsx) — when that Sidebar is enabled (alpha flag
// `alpha_new_nav`), this in-page selector deliberately shows only items with no
// Sidebar entry (Kampanjer, and the Innholdskvalitet group) to avoid duplicate
// navigation. With the alpha flag OFF there is no global Sidebar, so consumers
// must fall back to `chartGroupsLegacy` (handled inside useChartNavigation).
export const chartGroups: ChartGroup[] = [
  {
    title: 'Trafikk',
    icon: <BarChartIcon fontSize="1.125rem" />,
    ids: ['markedsanalyse'],
  },
  {
    title: 'Innholdskvalitet',
    icon: <MagnifyingGlassIcon fontSize="1.125rem" />,
    ids: ['odelagte-lenker', 'stavekontroll', 'wcag'],
  },
]

// Pre-Sidebar full set (from before commit c48f15a4, re-created with aksel icons).
// Used when the alpha left Sidebar is off — every analysis link must be reachable
// from the in-page selector again.
export const chartGroupsLegacy: ChartGroup[] = [
  {
    title: 'Trafikk',
    icon: <BarChartIcon fontSize="1.125rem" />,
    ids: ['trafikkanalyse', 'markedsanalyse', 'clickmap', 'brukerreiser', 'trakt'],
  },
  {
    title: 'Hendelser',
    icon: <SparklesIcon fontSize="1.125rem" />,
    ids: ['event-explorer', 'hendelsesreiser'],
  },
  {
    title: 'Brukere',
    icon: <PersonGroupIcon fontSize="1.125rem" />,
    ids: ['brukersammensetning', 'enkeltbrukere', 'brukerlojalitet', 'maloppnaelse'],
  },
  {
    title: 'Innholdskvalitet',
    icon: <MagnifyingGlassIcon fontSize="1.125rem" />,
    ids: ['odelagte-lenker', 'stavekontroll', 'wcag'],
  },
]

export interface ChartGroupSimple {
  title: string
  ids: string[]
}

export const chartGroupsOriginal: ChartGroupSimple[] = [
  {
    title: 'Trafikk & hendelser',
    ids: ['trafikkanalyse', 'markedsanalyse', 'event-explorer'],
  },
  {
    title: 'Brukerreiser',
    ids: ['brukerreiser', 'hendelsesreiser', 'trakt'],
  },
  {
    title: 'Brukere & lojalitet',
    ids: ['brukerprofiler', 'brukerlojalitet', 'maloppnaelse', 'brukersammensetning'],
  },
  {
    title: 'Innholdskvalitet',
    ids: ['odelagte-lenker', 'stavekontroll', 'wcag'],
  },
]
