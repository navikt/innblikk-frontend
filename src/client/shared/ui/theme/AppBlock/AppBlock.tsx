import { Page } from '@navikt/ds-react'
import React from 'react'

/**
 * AppBlock wraps Aksel's Page.Block and applies the app-wide max-width.
 *
 * The max-width is controlled by the CSS variable `--app-max-width` in App.css.
 * Change it in one place to affect every layout, header, footer and section.
 */
interface AppBlockProps {
  as?: React.ElementType
  gutters?: boolean
  className?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

export const AppBlock = ({ as, gutters = true, className = '', children, style }: AppBlockProps) => {
  const combinedClassName = `app-block${className ? ` ${className}` : ''}`

  if (as) {
    return (
      <Page.Block as={as} width="2xl" gutters={gutters} className={combinedClassName} style={style}>
        {children}
      </Page.Block>
    )
  }

  return (
    <Page.Block width="2xl" gutters={gutters} className={combinedClassName} style={style}>
      {children}
    </Page.Block>
  )
}
