import { CogIcon, ExternalLinkIcon, MenuHamburgerIcon, PersonIcon, TestFlaskIcon, ThemeIcon } from '@navikt/aksel-icons'
import { Events, type ActionMenuApnetProperties, type ActionMenuValgValgtProperties } from '@navikt/analytics-types'
import { ActionMenu, Button, Dropdown, Link, Tag, Tooltip } from '@navikt/ds-react'
import { useEffect, useState } from 'react'
import '../../../../tailwind.css'
import { AppBlock } from '../AppBlock/AppBlock.tsx'
import { getFeatureFlag } from '../../../lib/featureFlags.ts'

interface HeaderProps {
  theme: 'light' | 'dark'
}

type MenuLink = {
  href: string
  label: string
  external?: boolean
}

export default function Header({ theme }: HeaderProps) {
  const [isMobile, setIsMobile] = useState(false)
  const { hostname, pathname, search, hash } = window.location
  const currentPath = `${pathname}${search}${hash}`
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  const isDevEnvironment = isLocalhost || hostname.includes('.dev.nav.no')
  const isBeta = getFeatureFlag('beta_opt_in')
  const buildSha = __GIT_SHA__
  const buildShortSha = buildSha && buildSha !== 'unknown' ? buildSha.slice(0, 7) : null

  const guideLinks = [
    {
      href: 'https://navno.sharepoint.com/sites/intranett-utvikling/SitePages/Rutine-for-bruk-av-Umami.aspx',
      label: 'Retningslinjer',
      external: true,
    },
    { href: '/komigang', label: 'Oppsett guide' },
    { href: '/taksonomi', label: 'Taksonomi' },
    {
      href: 'https://reops-docs.ansatt.dev.nav.no/',
      label: 'Teknisk dokumentasjon',
      external: true,
    },
  ]

  const developerLinks = [
    { href: '/personvernssjekk', label: 'Personvernsjekk' },
    { href: '/diagnose', label: 'Diagnoseverktøy' },
    { href: '/sql', label: 'SQL-editor' },
    { href: '/sporingskoder', label: 'Sporingskoder' },
  ]

  const environmentLinks: MenuLink[] = (() => {
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
    const isDev = hostname.includes('.dev.nav.no')
    const isProd = hostname.includes('.nav.no') && !isDev

    if (isLocalhost) {
      return [
        {
          href: `https://startumami.ansatt.dev.nav.no${currentPath}`,
          label: 'Gå til dev-miljø',
        },
        {
          href: `https://startumami.ansatt.nav.no${currentPath}`,
          label: 'Gå til prod-miljø',
        },
      ]
    }

    if (isDev) {
      const prodHostname = hostname.replace('.dev.nav.no', '.nav.no')
      return [
        {
          href: `https://${prodHostname}${currentPath}`,
          label: 'Gå til prod-miljø',
        },
      ]
    }

    if (isProd) {
      const devHostname = hostname.replace('.nav.no', '.dev.nav.no')
      return [
        {
          href: `https://${devHostname}${currentPath}`,
          label: 'Gå til dev-miljø',
        },
      ]
    }

    return []
  })()

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const linkButton =
    '!no-underline !bg-transparent hover:!underline hover:!bg-transparent !font-normal ' +
    (theme === 'dark'
      ? '!text-[var(--ax-text-default)] visited:!text-[var(--ax-text-default)] hover:!text-[var(--ax-text-default)]'
      : '!text-white visited:!text-white hover:!text-white active:!text-white focus:!text-black focus:!bg-blue-100')

  const environmentBadgeLabel = isLocalhost ? 'Localhost' : 'Dev'

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement
    const themeElement = document.querySelector('.aksel-theme')

    root.classList.remove('light', 'dark')
    if (themeElement) {
      themeElement.classList.remove('light', 'dark')
    }

    root.classList.add(newTheme)
    if (themeElement) {
      themeElement.classList.add(newTheme)
    }

    localStorage.setItem('umami-theme', newTheme)
    window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }))
  }

  const setupMenu = (
    <ActionMenu
      onOpenChange={(open) => {
        if (open) {
          const properties: ActionMenuApnetProperties = {
            triggerTekst: 'Teknisk meny',
            seksjon: 'header',
          }
          window.umami?.track(Events.ACTIONMENU_APNET, properties)
        }
      }}
    >
      <Tooltip content="Teknisk meny" describesChild>
        <ActionMenu.Trigger>
          <Button
            variant="tertiary-neutral"
            icon={<CogIcon aria-hidden />}
            aria-label="Teknisk meny"
            className="!text-white hover:!bg-blue-100 hover:!text-black active:!bg-blue-100 active:!text-black focus:!bg-blue-100 focus:!text-black"
          />
        </ActionMenu.Trigger>
      </Tooltip>
      <ActionMenu.Content align="end">
        <ActionMenu.Group label="Veiledninger">
          {guideLinks.map((item) => (
            <ActionMenu.Item
              key={item.href}
              as="a"
              href={item.href}
              onSelect={() => {
                const properties: ActionMenuValgValgtProperties = {
                  valgTekst: item.label,
                  gruppeLabel: 'Veiledninger',
                  seksjon: 'header',
                }
                window.umami?.track(Events.ACTIONMENU_VALG_VALGT, properties)
              }}
            >
              <span className="inline-flex items-center gap-1">
                {item.label}
                {item.external && <ExternalLinkIcon aria-hidden fontSize="0.9rem" />}
              </span>
            </ActionMenu.Item>
          ))}
        </ActionMenu.Group>
        <ActionMenu.Divider />
        <ActionMenu.Group label="Utviklerverktøy">
          {developerLinks.map((item) => (
            <ActionMenu.Item
              key={item.href}
              as="a"
              href={item.href}
              onSelect={() => {
                const properties: ActionMenuValgValgtProperties = {
                  valgTekst: item.label,
                  gruppeLabel: 'Utviklerverktøy',
                  seksjon: 'header',
                }
                window.umami?.track(Events.ACTIONMENU_VALG_VALGT, properties)
              }}
            >
              {item.label}
            </ActionMenu.Item>
          ))}
        </ActionMenu.Group>
        {environmentLinks.length > 0 && (
          <>
            <ActionMenu.Divider />
            <ActionMenu.Group label="Miljø">
              {environmentLinks.map((item) => (
                <ActionMenu.Item
                  key={item.href}
                  as="a"
                  href={item.href}
                  onSelect={() => {
                    const properties: ActionMenuValgValgtProperties = {
                      valgTekst: item.label,
                      gruppeLabel: 'Miljø',
                      seksjon: 'header',
                    }
                    window.umami?.track(Events.ACTIONMENU_VALG_VALGT, properties)
                  }}
                >
                  {item.label}
                </ActionMenu.Item>
              ))}
            </ActionMenu.Group>
          </>
        )}
        <ActionMenu.Divider />
        <ActionMenu.Group label="Preferanser">
          <ActionMenu.Item
            onClick={toggleTheme}
            onSelect={() => {
              const properties: ActionMenuValgValgtProperties = {
                valgTekst: `Bytt til ${theme === 'dark' ? 'lyst' : 'mørkt'} tema`,
                gruppeLabel: 'Preferanser',
                seksjon: 'header',
              }
              window.umami?.track(Events.ACTIONMENU_VALG_VALGT, properties)
            }}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <ThemeIcon aria-hidden fontSize="1.2rem" />
              Bytt til {theme === 'dark' ? 'lyst' : 'mørkt'} tema
            </span>
          </ActionMenu.Item>
          <ActionMenu.Item
            as="a"
            href="/profil"
            onSelect={() => {
              const properties: ActionMenuValgValgtProperties = {
                valgTekst: 'Profil',
                gruppeLabel: 'Preferanser',
                seksjon: 'header',
              }
              window.umami?.track(Events.ACTIONMENU_VALG_VALGT, properties)
            }}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <PersonIcon aria-hidden fontSize="1.2rem" />
              Profil
            </span>
          </ActionMenu.Item>
        </ActionMenu.Group>
        {buildShortSha && (
          <>
            <ActionMenu.Divider />
            <ActionMenu.Item
              as="a"
              href={`https://github.com/navikt/innblikk-frontend/commit/${buildSha}`}
              onSelect={() => {
                const properties: ActionMenuValgValgtProperties = {
                  valgTekst: `Bygg: ${buildShortSha}`,
                  gruppeLabel: 'Bygg',
                  seksjon: 'header',
                }
                window.umami?.track(Events.ACTIONMENU_VALG_VALGT, properties)
              }}
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                Bygg: {buildShortSha}
                <ExternalLinkIcon aria-hidden fontSize="0.9rem" />
              </span>
            </ActionMenu.Item>
          </>
        )}
      </ActionMenu.Content>
    </ActionMenu>
  )

  return (
    <div
      style={{
        background: theme === 'dark' ? 'var(--ax-bg-default)' : 'rgba(19, 17, 54, 1)',
      }}
    >
      <AppBlock>
        <header className="flex py-1 z-10 items-center justify-between">
          <div className="flex items-center gap-2">
            <Button as={Link} variant="tertiary" className={`${linkButton} !px-0`} href="/">
              <div className="flex items-start gap-1.5 py-1">
                <span aria-hidden="true" className="grid place-items-center mt-0.5 shrink-0">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-xl md:text-2xl font-bold tracking-tight whitespace-nowrap">Innblikk</span>
                </div>
              </div>
            </Button>
            {isBeta && (
              <Tag data-color="meta-purple" variant="strong" size="small" icon={<TestFlaskIcon aria-hidden />}>
                Beta
              </Tag>
            )}
            {isDevEnvironment && (
              <Tag data-color="info" variant="outline" size="small">
                {environmentBadgeLabel}
              </Tag>
            )}
          </div>
          {isMobile ? (
            <div className="flex items-center">
              <Dropdown>
                <Button as={Dropdown.Toggle} variant="tertiary" className={linkButton} aria-label="Meny">
                  <MenuHamburgerIcon title="meny" fontSize="1.5rem" />
                </Button>
                <Dropdown.Menu className="w-auto">
                  <Dropdown.Menu.List>
                    <Dropdown.Menu.List.Item as={Link} href="/trafikkanalyse" className="no-underline">
                      <span className="whitespace-nowrap">Trafikkanalyse</span>
                    </Dropdown.Menu.List.Item>
                    <Dropdown.Menu.List.Item as={Link} href="/grafbygger" className="no-underline">
                      <span className="whitespace-nowrap">Grafbygger</span>
                    </Dropdown.Menu.List.Item>
                    <Dropdown.Menu.List.Item as={Link} href="/dashboard" className="no-underline">
                      <span className="whitespace-nowrap">Dashboard</span>
                    </Dropdown.Menu.List.Item>
                  </Dropdown.Menu.List>
                </Dropdown.Menu>
              </Dropdown>
              {setupMenu}
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center w-full"></div>
              <div className="flex flex-grow">
                <Button as={Link} variant="tertiary" href="/trafikkanalyse" className={linkButton}>
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap">Trafikkanalyse</span>
                  </div>
                </Button>
                <Button as={Link} variant="tertiary" href="/grafbygger" className={linkButton}>
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap">Grafbygger</span>
                  </div>
                </Button>
                <Button as={Link} variant="tertiary" href="/dashboard" className={linkButton}>
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap">Dashboard</span>
                  </div>
                </Button>
                {setupMenu}
              </div>
            </div>
          )}
        </header>
      </AppBlock>
    </div>
  )
}
