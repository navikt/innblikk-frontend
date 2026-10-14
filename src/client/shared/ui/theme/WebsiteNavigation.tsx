import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Select } from '@navikt/ds-react'

const WebsiteNavigationContext = createContext<HTMLElement | null | undefined>(undefined)

export function WebsiteNavigation({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const { hostname } = window.location
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  const isDev = hostname.includes('.dev.')
  const isProd = hostname.includes('.nav.no') && !isDev

  const switchEnvironment = (target: string) => {
    const { pathname, search, hash } = window.location
    const targetHostname = isLocalhost
      ? 'innblikk.ansatt.dev.nav.no'
      : target === 'dev'
        ? hostname.replace('.nav.no', '.dev.nav.no')
        : hostname.replace('.dev.nav.no', '.nav.no')
    window.location.href = `https://${targetHostname}${pathname}${search}${hash}`
  }

  return (
    <WebsiteNavigationContext.Provider value={container}>
      <header
        aria-label="Valgt nettside"
        className="website-navigation flex h-16 shrink-0 items-center gap-3 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-4 md:px-6"
      >
        <div ref={setContainer} className="min-w-0 w-full max-w-[260px] empty:hidden [&_label]:sr-only" />
        {(isLocalhost || isDev || isProd) && (
          <Select
            label="Miljø"
            hideLabel
            size="small"
            className={`shrink-0 ${isDev ? '[&_select]:bg-[var(--ax-bg-warning-moderate)] [&_select]:border-[var(--ax-border-warning)]' : ''}`}
            value={isLocalhost ? 'localhost' : isDev ? 'dev' : 'prod'}
            onChange={(event) => switchEnvironment(event.target.value)}
          >
            {isLocalhost ? <option value="localhost">local</option> : <option value="prod">prod</option>}
            <option value="dev">dev</option>
          </Select>
        )}
      </header>
      {children}
    </WebsiteNavigationContext.Provider>
  )
}

export function WebsiteNavigationSlot({ children }: { children: ReactNode }) {
  const container = useContext(WebsiteNavigationContext)

  if (container === undefined) return children
  if (container === null) return null

  return createPortal(<div>{children}</div>, container)
}
