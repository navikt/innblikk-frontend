import { createContext, useContext, type ReactNode } from 'react'
import { useLocation, useMatches, type Params } from 'react-router-dom'
import { PageBreadcrumbs, type BreadcrumbItem } from './PageBreadcrumbs.tsx'

export type BreadcrumbResolver = (params: Params, search: string) => BreadcrumbItem[]

const BreadcrumbContext = createContext<ReadonlyArray<BreadcrumbItem>>([])

/** Route metadata owns the hierarchy; page headers only render it. */
export function RouteBreadcrumbsProvider({ children }: { children: ReactNode }) {
  const matches = useMatches()
  const { search } = useLocation()
  const match = [...matches]
    .reverse()
    .find((entry) => (entry.handle as { breadcrumbs?: BreadcrumbResolver })?.breadcrumbs)
  const resolve = (match?.handle as { breadcrumbs?: BreadcrumbResolver } | undefined)?.breadcrumbs
  const items = resolve && match ? resolve(match.params, search) : []

  return <BreadcrumbContext.Provider value={items}>{children}</BreadcrumbContext.Provider>
}

export function RouteBreadcrumbs({ className }: { className?: string }) {
  const items = useContext(BreadcrumbContext)
  return items.length > 1 ? (
    <div className={className}>
      <PageBreadcrumbs items={items} />
    </div>
  ) : null
}
