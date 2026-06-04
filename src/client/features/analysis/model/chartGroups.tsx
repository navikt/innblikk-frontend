import React from 'react'
import { BarChart2, Users, FileSearch, Activity } from 'lucide-react'

export interface ChartGroup {
  title: string
  icon: React.ReactNode
  ids: string[]
}

export const chartGroups: ChartGroup[] = [
  {
    title: 'Trafikk',
    icon: <BarChart2 size={18} />,
    ids: ['trafikkanalyse', 'markedsanalyse', 'clickmap', 'brukerreiser', 'trakt'],
  },
  {
    title: 'Hendelser',
    icon: <Activity size={18} />,
    ids: ['event-explorer', 'hendelsesreiser'],
  },
  {
    title: 'Brukere',
    icon: <Users size={18} />,
    ids: ['brukersammensetning', 'enkeltbrukere', 'brukerlojalitet', 'maloppnaelse'],
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
