import {
  AreaChartIcon,
  BarChartIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CogIcon,
  ExternalLinkIcon,
  FileSearchIcon,
  HouseIcon,
  LightningIcon,
  MenuHamburgerIcon,
  MoonIcon,
  OpenBookIcon,
  PersonGroupIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
  SquareGridIcon,
  SunIcon,
  WrenchIcon,
  XMarkIcon,
} from '@navikt/aksel-icons'
import { Button, Select, Tooltip } from '@navikt/ds-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import '../../../../tailwind.css'
import { useIsReopsTeamMember } from '../../../hooks/useIsReopsTeamMember.ts'

interface SidebarProps {
  theme: 'light' | 'dark'
}

type NavLink = {
  kind: 'link'
  id: string
  label: string
  to: string
  icon: ReactNode
}

type NavGroup = {
  kind: 'group'
  id: string
  label: string
  icon: ReactNode
  items: { id: string; label: string; to: string; external?: boolean }[]
}

type NavEntry = NavLink | NavGroup

// Main app navigation — single source of truth, following the "sidemeny" design
// at https://dish-sign-07547237.figma.site/. Sub-item groupings mirror the design
// (Trafikk / Hendelser / Brukere), mapped onto this app's real existing routes
// (the design used placeholder routes like /trafikkanalyse/klikk that don't exist
// here — e.g. Klikkoversikt is /klikkoversikt, not /trafikkanalyse/klikk).
//
// "Innholdskvalitet" (stavekontroll/wcag) shows the WCAG link unconditionally — WCAG is a
// registered beta feature (betaFeatures.ts), and beta features are on for everyone since the
// per-user beta opt-in was retired.
//
// "Ressurser" and "Verktøy" were originally moved here from a Header component's
// cog/"Teknisk meny" ActionMenu (guideLinks/developerLinks). That Header (top bar
// with logo + cog menu) has since been removed entirely — everything it held
// (branding, main nav, Beta/dev tags, Miljø env switch, theme toggle, Innstillinger) now
// lives exclusively in this Sidebar, so there's a single persistent nav surface.
const getNavItems = (isReopsTeamMember: boolean): NavEntry[] => [
  { kind: 'link', id: 'hjem', label: 'Hjem', to: '/', icon: <HouseIcon aria-hidden fontSize="1.25rem" /> },
  {
    kind: 'group',
    id: 'trafikkanalyse',
    label: 'Trafikkanalyse',
    icon: <BarChartIcon aria-hidden fontSize="1.25rem" />,
    items: [
      { id: 'trafikkoversikt', label: 'Trafikkoversikt', to: '/trafikkanalyse' },
      { id: 'markedsanalyse', label: 'Kampanjer', to: '/markedsanalyse' },
      { id: 'klikkoversikt', label: 'Klikkoversikt', to: '/klikkoversikt' },
      { id: 'navigasjonsflyt', label: 'Navigasjonsflyt', to: '/brukerreiser' },
      { id: 'trakt', label: 'Trakt', to: '/trakt' },
    ],
  },
  {
    kind: 'group',
    id: 'hendelser',
    label: 'Hendelser',
    icon: <LightningIcon aria-hidden fontSize="1.25rem" />,
    items: [
      { id: 'egendefinerte', label: 'Egendefinerte hendelser', to: '/utforsk-hendelser' },
      { id: 'hendelsesforlop', label: 'Hendelsesforløp', to: '/hendelsesreiser' },
    ],
  },
  {
    kind: 'group',
    id: 'brukere',
    label: 'Brukere',
    icon: <PersonGroupIcon aria-hidden fontSize="1.25rem" />,
    items: [
      { id: 'brukerdetaljer', label: 'Brukerdetaljer', to: '/brukersammensetning' },
      { id: 'enkeltbrukere', label: 'Enkeltbrukere', to: '/brukerprofiler' },
      { id: 'gjenbesok', label: 'Gjenbesøk', to: '/brukerlojalitet' },
      { id: 'maloppnaelse', label: 'Måloppnåelse', to: '/maloppnaelse' },
    ],
  },
  {
    kind: 'group',
    id: 'innholdskvalitet',
    label: 'Innholdskvalitet',
    icon: <FileSearchIcon aria-hidden fontSize="1.25rem" />,
    items: [
      { id: 'stavekontroll', label: 'Stavekontroll', to: '/kvalitet/stavekontroll' },
      { id: 'odelagte-lenker', label: 'Ødelagte lenker', to: '/kvalitet/odelagte-lenker' },
      { id: 'wcag', label: 'Universell utforming', to: '/kvalitet/wcag' },
    ],
  },
  {
    kind: 'link',
    id: 'grafbygger',
    label: 'Grafbygger',
    to: '/grafbygger',
    icon: <AreaChartIcon aria-hidden fontSize="1.25rem" />,
  },
  {
    kind: 'link',
    id: 'dashboard',
    label: 'Dashboard',
    to: '/dashboard',
    icon: <SquareGridIcon aria-hidden fontSize="1.25rem" />,
  },
  {
    kind: 'group',
    id: 'verktoy',
    label: 'Verktøy',
    icon: <WrenchIcon aria-hidden fontSize="1.25rem" />,
    items: [
      { id: 'sporingskoder', label: 'Sporingskoder', to: '/sporingskoder' },
      { id: 'sql', label: 'SQL-spørringer', to: '/sql' },
      { id: 'personvern', label: 'Personvernsjekk', to: '/personvernssjekk' },
      { id: 'kohorter', label: 'Brukergrupper', to: '/kohorter' },
      ...(isReopsTeamMember ? [{ id: 'reops-internal', label: 'ReOps-internt', to: '/reops-internal' }] : []),
    ],
  },
  {
    kind: 'group',
    id: 'ressurser',
    label: 'Ressurser',
    icon: <OpenBookIcon aria-hidden fontSize="1.25rem" />,
    items: [
      { id: 'komigang', label: 'Kom i gang', to: '/komigang' },
      {
        id: 'retningslinjer',
        label: 'Retningslinjer',
        to: 'https://navno.sharepoint.com/sites/intranett-utvikling/SitePages/Rutine-for-bruk-av-Umami.aspx',
        external: true,
      },
      { id: 'dokumentasjon', label: 'Dokumentasjon', to: 'https://reops-docs.ansatt.dev.nav.no/', external: true },
      // Moved here from Footer.tsx's link columns (Juridisk/Erklæringer/Finn oss) —
      // Footer.tsx itself is left untouched (logo/copyright + these same links),
      // since privacy/tilgjengelighet links are conventionally expected in a page
      // footer for legal/a11y reasons regardless of also being in nav.
      {
        id: 'etterlevelse',
        label: 'Innblikk i Etterlevelse',
        to: 'https://etterlevelse.ansatt.nav.no/dokumentasjon/e3757864-9720-4569-9e8e-50841950fcd6',
        external: true,
      },
      { id: 'personvernerklaering', label: 'Personvern', to: '/personvern' },
      { id: 'tilgjengelighet', label: 'Tilgjengelighet', to: '/tilgjengelighet' },
      {
        id: 'slack',
        label: '#ResearchOps på Slack',
        to: 'https://nav-it.slack.com/archives/C02UGFS2J4B',
        external: true,
      },
      { id: 'github-frontend', label: 'GitHub: Frontend', to: 'https://github.com/navikt/umami-start', external: true },
      {
        id: 'github-backend',
        label: 'GitHub: Backend',
        to: 'https://github.com/navikt/start-umami-backend',
        external: true,
      },
    ],
  },
]

const isPathActive = (pathname: string, to: string, exact = false) =>
  exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)

const rowClass = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] no-underline transition-colors ${
    active
      ? 'bg-[var(--ax-bg-accent-moderate)] font-semibold text-[var(--ax-text-accent)]'
      : 'text-[var(--ax-text-default)] hover:bg-[var(--ax-bg-neutral-moderate)]'
  }`

const subRowClass = (active: boolean) =>
  `block rounded-lg px-3 py-1.5 text-sm no-underline transition-colors ${
    active
      ? 'bg-[var(--ax-bg-accent-moderate)] font-semibold text-[var(--ax-text-accent)]'
      : 'text-[var(--ax-text-default)] hover:bg-[var(--ax-bg-neutral-moderate)]'
  }`

function SidebarLink({ entry, collapsed }: { entry: NavLink; collapsed: boolean }) {
  const { pathname } = useLocation()
  const active = isPathActive(pathname, entry.to, entry.to === '/')

  const content = (
    <RouterLink to={entry.to} className={rowClass(active)}>
      <span className="grid shrink-0 place-items-center">{entry.icon}</span>
      {!collapsed && <span className="truncate">{entry.label}</span>}
    </RouterLink>
  )

  return collapsed ? (
    <Tooltip content={entry.label} placement="right">
      {content}
    </Tooltip>
  ) : (
    content
  )
}

function SidebarGroup({
  entry,
  collapsed,
  onExpandSidebar,
}: {
  entry: NavGroup
  collapsed: boolean
  onExpandSidebar: () => void
}) {
  const { pathname } = useLocation()
  const isActiveGroup = entry.items.some((item) => isPathActive(pathname, item.to))
  const [isOpen, setIsOpen] = useState(isActiveGroup)

  // Keep the group expanded whenever navigation lands on one of its pages
  // (covers direct links/back-forward nav, not just clicks within the group).
  useEffect(() => {
    if (isActiveGroup) setIsOpen(true)
  }, [isActiveGroup])

  const toggleButton = (
    <button
      type="button"
      onClick={() => {
        // While collapsed (icon-only rail), clicking a group did nothing before —
        // now it expands the whole sidebar and opens this group, instead of being
        // a dead click (the tooltip label alone isn't an affordance for action).
        if (collapsed) {
          onExpandSidebar()
          setIsOpen(true)
          return
        }
        setIsOpen((open) => !open)
      }}
      aria-expanded={isOpen}
      aria-label={isOpen ? `Skjul undermeny for ${entry.label}` : `Vis undermeny for ${entry.label}`}
      className={`flex w-full items-center gap-3 rounded-lg border-none px-3 py-2 text-left font-[inherit] text-[15px] transition-colors ${
        isActiveGroup && isOpen
          ? 'bg-[var(--ax-bg-accent-moderate)] text-[var(--ax-text-accent)]'
          : 'bg-transparent text-[var(--ax-text-default)] hover:bg-[var(--ax-bg-neutral-moderate)]'
      } ${isActiveGroup ? 'font-semibold' : 'font-normal'}`}
    >
      <span className="grid shrink-0 place-items-center">{entry.icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{entry.label}</span>
          <span className="grid shrink-0 place-items-center text-[var(--ax-text-subtle)]">
            {isOpen ? <ChevronUpIcon aria-hidden fontSize="1rem" /> : <ChevronDownIcon aria-hidden fontSize="1rem" />}
          </span>
        </>
      )}
    </button>
  )

  return (
    <div>
      {collapsed ? (
        <Tooltip content={entry.label} placement="right">
          {toggleButton}
        </Tooltip>
      ) : (
        toggleButton
      )}
      {!collapsed && isOpen && (
        <div className="flex flex-col gap-0.5 py-1 pl-10">
          {entry.items.map((item) =>
            item.external ? (
              <a key={item.id} href={item.to} target="_blank" rel="noopener noreferrer" className={subRowClass(false)}>
                <span className="inline-flex items-center gap-1">
                  {item.label}
                  <ExternalLinkIcon aria-hidden fontSize="0.8125rem" />
                </span>
              </a>
            ) : (
              <RouterLink key={item.id} to={item.to} className={subRowClass(pathname === item.to)}>
                {item.label}
              </RouterLink>
            ),
          )}
        </div>
      )}
    </div>
  )
}

const NavList = ({
  collapsed,
  items,
  onExpandSidebar,
}: {
  collapsed: boolean
  items: NavEntry[]
  onExpandSidebar: () => void
}) => (
  <nav aria-label="Hovedmeny" className="flex flex-1 flex-col gap-0.5 px-2 py-3">
    {items.map((entry) =>
      entry.kind === 'link' ? (
        <SidebarLink key={entry.id} entry={entry} collapsed={collapsed} />
      ) : (
        <SidebarGroup key={entry.id} entry={entry} collapsed={collapsed} onExpandSidebar={onExpandSidebar} />
      ),
    )}
  </nav>
)

export default function Sidebar({ theme }: SidebarProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { pathname } = useLocation()
  const { isReopsTeamMember } = useIsReopsTeamMember()
  const navItems = getNavItems(isReopsTeamMember)

  const { hostname, pathname: currentPathname, search, hash } = window.location
  const currentPath = `${currentPathname}${search}${hash}`
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  const isDev = hostname.includes('.dev.')
  const isProd = hostname.includes('.nav.no') && !isDev

  // Swap dev.nav.no ↔ nav.no on the current hostname, preserving path/query/hash —
  // picking an option navigates to the same page in that environment, like a link.
  // Localhost has no matching nav.no hostname to swap into, so it goes to the fixed
  // dev URL instead (mirrors the old Header's «Gå til dev-miljø» link).
  const switchEnvironment = (target: 'dev' | 'prod') => {
    if (isLocalhost) {
      window.location.href = `https://innblikk.ansatt.dev.nav.no${currentPath}`
      return
    }
    const targetHostname =
      target === 'dev' ? hostname.replace('.nav.no', '.dev.nav.no') : hostname.replace('.dev.nav.no', '.nav.no')
    window.location.href = `https://${targetHostname}${currentPath}`
  }

  const environmentIndicator = isLocalhost ? (
    <Select
      label="Miljø"
      hideLabel
      size="small"
      value="localhost"
      onChange={(e) => switchEnvironment(e.target.value as 'dev')}
    >
      <option value="localhost">Localhost</option>
      <option value="dev">Dev</option>
    </Select>
  ) : isDev || isProd ? (
    <Select
      label="Miljø"
      hideLabel
      size="small"
      value={isDev ? 'dev' : 'prod'}
      onChange={(e) => switchEnvironment(e.target.value as 'dev' | 'prod')}
    >
      <option value="dev">Dev</option>
      <option value="prod">Prod</option>
    </Select>
  ) : null

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  // Same logic the now-deleted Header component used to have. Writes the same
  // localStorage key and dispatches the same event so App.tsx (the actual
  // source of truth for `theme`) stays in sync.
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement
    const themeElement = document.querySelector('.aksel-theme')

    root.classList.remove('light', 'dark')
    themeElement?.classList.remove('light', 'dark')
    root.classList.add(newTheme)
    themeElement?.classList.add(newTheme)

    localStorage.setItem('umami-theme', newTheme)
    window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }))
  }

  const bottomSection = (collapsed: boolean) => (
    <div
      className="flex flex-col gap-1 border-t p-2"
      style={{ borderColor: 'var(--ax-border-neutral-subtleA, var(--ax-border-neutral-subtle))' }}
    >
      <SidebarLink
        entry={{
          kind: 'link',
          id: 'innstillinger',
          label: 'Innstillinger',
          to: '/innstillinger',
          icon: <CogIcon aria-hidden fontSize="1.25rem" />,
        }}
        collapsed={collapsed}
      />
      {collapsed ? (
        <Tooltip content={theme === 'dark' ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'} placement="right">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'}
            className="flex w-full items-center gap-3 rounded-lg border-none bg-transparent px-3 py-2 text-left text-[15px] text-[var(--ax-text-default)] transition-colors hover:bg-[var(--ax-bg-neutral-moderate)]"
          >
            <span className="grid shrink-0 place-items-center">
              {theme === 'dark' ? (
                <SunIcon aria-hidden fontSize="1.25rem" />
              ) : (
                <MoonIcon aria-hidden fontSize="1.25rem" />
              )}
            </span>
          </button>
        </Tooltip>
      ) : (
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg border-none bg-transparent px-3 py-2 text-left text-[15px] text-[var(--ax-text-default)] transition-colors hover:bg-[var(--ax-bg-neutral-moderate)]"
        >
          <span className="grid shrink-0 place-items-center">
            {theme === 'dark' ? (
              <SunIcon aria-hidden fontSize="1.25rem" />
            ) : (
              <MoonIcon aria-hidden fontSize="1.25rem" />
            )}
          </span>
          <span>{theme === 'dark' ? 'Lyst tema' : 'Mørkt tema'}</span>
        </button>
      )}
      {!isMobile && (
        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          title={collapsed ? 'Utvid meny' : 'Skjul meny'}
          className="flex w-full items-center gap-3 rounded-lg border-none bg-transparent px-3 py-2 text-left text-sm text-[var(--ax-text-subtle)] transition-colors hover:bg-[var(--ax-bg-neutral-moderate)]"
        >
          <span className="grid shrink-0 place-items-center">
            {collapsed ? (
              <SidebarRightIcon aria-hidden fontSize="1.25rem" />
            ) : (
              <SidebarLeftIcon aria-hidden fontSize="1.25rem" />
            )}
          </span>
          {!collapsed && <span>Skjul meny</span>}
        </button>
      )}
    </div>
  )

  if (isMobile) {
    return (
      <div
        className="app-sidebar-mobile relative border-b"
        style={{
          background: theme === 'dark' ? 'var(--ax-bg-default)' : 'rgba(19, 17, 54, 1)',
          borderColor: 'var(--ax-border-neutral-subtle)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-1.5">
          <RouterLink
            to="/"
            className={`flex flex-wrap items-center gap-2 no-underline ${
              theme === 'dark' ? 'text-[var(--ax-neutral-1000)]' : 'text-white'
            }`}
          >
            <span className="text-sm font-semibold">Innblikk</span>
            {environmentIndicator}
          </RouterLink>
          <Button
            variant="tertiary-neutral"
            icon={
              isMobileOpen ? (
                <XMarkIcon aria-hidden fontSize="1.5rem" />
              ) : (
                <MenuHamburgerIcon aria-hidden fontSize="1.5rem" />
              )
            }
            aria-label={isMobileOpen ? 'Lukk meny' : 'Åpne meny'}
            aria-expanded={isMobileOpen}
            onClick={() => setIsMobileOpen((open) => !open)}
            className={theme === 'dark' ? 'text-[var(--ax-neutral-1000)]' : 'text-white'}
          />
        </div>
        {isMobileOpen && (
          <div
            className="app-sidebar-mobile-panel border-t shadow-lg"
            style={{ background: 'var(--ax-bg-default)', borderColor: 'var(--ax-border-neutral-subtle)' }}
          >
            <NavList collapsed={false} items={navItems} onExpandSidebar={() => {}} />
            {bottomSection(false)}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className={`app-sidebar flex shrink-0 flex-col transition-[width] duration-150 ease-out ${
        isCollapsed ? 'w-16' : 'w-[240px]'
      }`}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-4"
        style={{ borderColor: 'var(--ax-border-neutral-subtle)' }}
      >
        <RouterLink to="/" className="flex min-w-0 items-center gap-2 no-underline">
          <span aria-hidden="true" className="grid shrink-0 place-items-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M16.5 10.5C16.5 13.8137 13.8137 16.5 10.5 16.5C7.18629 16.5 4.5 13.8137 4.5 10.5C4.5 7.18629 7.18629 4.5 10.5 4.5C13.8137 4.5 16.5 7.18629 16.5 10.5Z"
                stroke="currentColor"
                strokeWidth="1.9"
              />
              <path d="M15.2 15.2L20.5 20.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path
                d="M7.9 12.5V10.2M10.5 12.5V8.5M13.1 12.5V9.3"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </span>
          {!isCollapsed && (
            <span className="flex items-center gap-2">
              <span className="text-lg font-semibold mx-2 tracking-tight text-[var(--ax-text-default)]">Innblikk</span>
            </span>
          )}
        </RouterLink>
        {!isCollapsed && environmentIndicator && <span className="shrink-0">{environmentIndicator}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <NavList collapsed={isCollapsed} items={navItems} onExpandSidebar={() => setIsCollapsed(false)} />
      </div>
      {bottomSection(isCollapsed)}
    </aside>
  )
}
