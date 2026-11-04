import { useId, type ReactNode } from 'react'
import { Button } from '@navikt/ds-react'
import { XMarkIcon } from '@navikt/aksel-icons'

/** Shared shell for filters, sidegroups and user groups in the event editor. */
export default function FilterCard({
  children,
  title,
  onRemove,
  removeLabel,
  badge,
}: {
  children: ReactNode
  title?: string
  onRemove?: () => void
  removeLabel?: string
  badge?: ReactNode
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className="filter-card-animate-in min-w-0 rounded-md border border-(--ax-border-neutral-subtle) bg-(--ax-bg-default) p-3"
    >
      {title && (
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span id={titleId} className="text-sm font-semibold">
              {title}
            </span>
            {badge}
          </div>
          {onRemove && (
            <Button
              type="button"
              variant="tertiary"
              data-color="danger"
              size="xsmall"
              className="shrink-0"
              icon={<XMarkIcon aria-hidden />}
              aria-label={removeLabel ?? `Fjern ${title.toLocaleLowerCase('nb')}`}
              onClick={onRemove}
            >
              Fjern
            </Button>
          )}
        </div>
      )}
      {children}
    </section>
  )
}
