import { Link } from '@navikt/ds-react'
import { ArrowDownRightIcon, ArrowLeftIcon, ChevronRightIcon } from '@navikt/aksel-icons'
import { Link as RouterLink } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { useFeatureFlag } from '../hooks/useFeatureFlag.ts'
import styles from './PageBreadcrumbs.module.css'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface PageBreadcrumbsProps {
  items: ReadonlyArray<BreadcrumbItem>
}

export function PageBreadcrumbs({ items }: PageBreadcrumbsProps) {
  const verticalExperiment = useFeatureFlag('breadcrumbs_vertical_overflow')
  let parentIndex = -1
  items.forEach((item, index) => {
    if (index < items.length - 1 && item.to) parentIndex = index
  })

  return (
    <nav
      aria-label="Brødsmulesti"
      className={styles.breadcrumbs}
      data-has-parent={parentIndex >= 0 || undefined}
      data-vertical-experiment={verticalExperiment || undefined}
    >
      <ol className={`${styles.list} ${styles.trail} text-base leading-6`}>
        {items.map((item, index) => (
          <li
            key={item.to ?? index}
            className={styles.item}
            data-parent={index === parentIndex || undefined}
            style={{ '--breadcrumb-depth': index } as CSSProperties}
          >
            {index > 0 && (
              <>
                <ChevronRightIcon aria-hidden className={`${styles.separator} ${styles.horizontalSeparator}`} />
                <ArrowDownRightIcon aria-hidden className={`${styles.separator} ${styles.verticalSeparator}`} />
              </>
            )}
            {index < items.length - 1 && item.to ? (
              <Link
                as={RouterLink}
                to={item.to}
                underline={index !== parentIndex}
                className={`${styles.target} min-h-6 min-w-6`}
              >
                {index === parentIndex && (
                  <ArrowLeftIcon aria-hidden className={`${styles.separator} ${styles.backSeparator}`} />
                )}
                <span className={index === parentIndex ? styles.linkLabel : undefined}>{item.label}</span>
              </Link>
            ) : (
              <span aria-current={index === items.length - 1 ? 'page' : undefined} className={styles.label}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Measure the full nonwrapping trail without duplicate links or screen-reader content. */}
      <div className={styles.measurement} aria-hidden>
        <div className={`${styles.list} ${styles.measurementList} text-base leading-6`}>
          {items.map((item, index) => (
            <span key={item.to ?? index} className={styles.item}>
              {index > 0 && <ChevronRightIcon aria-hidden className={styles.separator} />}
              <span
                data-label={item.label}
                className={`${styles.measurementLabel} ${index < items.length - 1 && item.to ? `${styles.target} min-h-6 min-w-6` : styles.label}`}
              />
            </span>
          ))}
        </div>
      </div>
    </nav>
  )
}
