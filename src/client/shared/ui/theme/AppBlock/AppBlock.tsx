import { Page } from '@navikt/ds-react'
import React from 'react'

/**
 * AppBlock wraps Aksel's Page.Block and applies the app-wide max-width.
 *
 * The max-width is controlled by the CSS variable `--app-max-width` in App.css.
 * Change it in one place to affect every layout, header, footer and section.
 *
 * `gutters` accepts `true` (Aksel default: 16px / 48px desktop), `false`
 * (no inline padding), or `'compact'` (16px / 24px desktop) — used by the
 * left-Sidebar layout where the sidebar already takes up horizontal
 * space and the default 48px gutters feel excessive.
 */
interface AppBlockProps {
  as?: React.ElementType
  gutters?: boolean | 'compact'
  className?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

export const AppBlock = ({ as, gutters = true, className = '', children, style }: AppBlockProps) => {
  const gutterClass = gutters === 'compact' ? ' app-block--compact-gutters' : ''
  const combinedClassName = `app-block${gutterClass}${className ? ` ${className}` : ''}`
  // 'compact' still turns Aksel's gutters on — the compact class just
  // overrides the inline-padding variable.
  const guttersEnabled = gutters === true || gutters === 'compact'

  if (as) {
    return (
      <Page.Block as={as} width="2xl" gutters={guttersEnabled} className={combinedClassName} style={style}>
        {children}
      </Page.Block>
    )
  }

  return (
    <Page.Block width="2xl" gutters={guttersEnabled} className={combinedClassName} style={style}>
      {children}
    </Page.Block>
  )
}
