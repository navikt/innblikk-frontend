import { BarChartIcon, MagnifyingGlassIcon } from '@navikt/aksel-icons'
import React from 'react'

export interface ChartGroup {
  title: string
  icon: React.ReactNode
  ids: string[]
}

// Trafikkanalyse (trafikkoversikt/klikkoversikt/navigasjonsflyt/trakt), Hendelser
// (event-explorer/hendelsesreiser), and Brukere (brukersammensetning/enkeltbrukere/
// brukerlojalitet/maloppnaelse) live in the global left Sidebar (see
// shared/ui/theme/Sidebar/Sidebar.tsx) — this in-page selector deliberately shows
// only items with no Sidebar entry (Kampanjer, and the Innholdskvalitet group) to
// avoid duplicate navigation.
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
