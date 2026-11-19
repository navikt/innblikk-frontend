import { Link } from '@navikt/ds-react'
import { ChevronRightIcon } from '@navikt/aksel-icons'
import { Link as RouterLink } from 'react-router-dom'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface PageBreadcrumbsProps {
  items: ReadonlyArray<BreadcrumbItem>
}

export function PageBreadcrumbs({ items }: PageBreadcrumbsProps) {
  return (
    <nav aria-label="Brødsmulesti">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg leading-7">
        {items.map((item, index) => (
          <li key={item.to ?? index} className="flex min-w-0 max-w-full items-center gap-2">
            {index > 0 && <ChevronRightIcon aria-hidden className="shrink-0" />}
            {index < items.length - 1 && item.to ? (
              <Link as={RouterLink} to={item.to} className="min-w-0 break-words">
                {item.label}
              </Link>
            ) : (
              <span aria-current={index === items.length - 1 ? 'page' : undefined} className="min-w-0 break-words">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
