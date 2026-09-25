export interface Sidegroup {
  id: string
  name: string
  description?: string
  websiteId: string
  include?: string[]
  exclude?: string[]
  exact?: string[]
  startWith?: string[]
  endWith?: string[]
}

export type SidegroupRequest = Omit<Sidegroup, 'id'>

export const sidegroupMatchFields = [
  { key: 'include', label: 'Inkluder' },
  { key: 'exclude', label: 'Ekskluder' },
  { key: 'exact', label: 'Er eksakt' },
  { key: 'startWith', label: 'Starter med' },
  { key: 'endWith', label: 'Slutter med' },
] as const

export type SidegroupMatchField = (typeof sidegroupMatchFields)[number]['key']
