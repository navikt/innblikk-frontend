import React from 'react'
import { BarChart2, FileSearch } from 'lucide-react'

export interface ChartGroup {
  title: string
  icon: React.ReactNode
  ids: string[]
}

// Trafikkanalyse (trafikkoversikt/klikkoversikt/navigasjonsflyt/trakt), Hendelser
// (event-explorer/hendelsesreiser), and Brukere (brukersammensetning/enkeltbrukere/
// brukerlojalitet/maloppnaelse) now live in the global left Sidebar (see
// shared/ui/theme/Sidebar/Sidebar.tsx) — deliberately NOT repeated here to avoid
// duplicate navigation on every analysis page. Only items with no Sidebar entry
// (Kampanjer, and the Innholdskvalitet group) remain in this in-page selector.
export const chartGroups: ChartGroup[] = [
  {
    title: 'Trafikk',
    icon: <BarChart2 size={18} />,
    ids: ['markedsanalyse'],
  },
  {
    title: 'Innholdskvalitet',
    icon: <FileSearch size={18} />,
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
