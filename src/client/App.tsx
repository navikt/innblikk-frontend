import { Loader, Page, Theme } from '@navikt/ds-react'
import { Suspense, useEffect, useState } from 'react'
import { BrowserRouter as Router, Route, Routes, useLocation, Link } from 'react-router-dom'
import routes, { isFullWidthPath } from './routes.tsx'
import Footer from './shared/ui/theme/Footer/Footer.tsx'
import ScrollToTop from './shared/ui/theme/ScrollToTop/ScrollToTop.tsx'
import Header from './shared/ui/theme/Header/Header.tsx'
import AnnouncementBanner from './shared/ui/theme/AnnouncementBanner/AnnouncementBanner.tsx'
import { ErrorBoundary } from './shared/ui/ErrorBoundary.tsx'
import { useHead } from '@unhead/react'
import { AppBlock } from './shared/ui/theme/AppBlock/AppBlock.tsx'

import './App.css'

// Create a wrapper component for ScrollToTop
const ScrollToTopWrapper = () => {
  const location = useLocation()

  // Don't show on /grafbygger route
  if (location.pathname === '/grafbygger') {
    return null
  }

  return <ScrollToTop />
}

// Create a wrapper component for Page Layout
const PageLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation()
  const isFullWidthPage = isFullWidthPath(location.pathname)

  if (isFullWidthPage) {
    return <main style={{ width: '100%' }}>{children}</main>
  }

  return <AppBlock as="main">{children}</AppBlock>
}

// Loading fallback for lazy-loaded routes
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
    <Loader size="xlarge" title="Laster inn..." />
  </div>
)

// 404 page for unknown routes
const NotFound = () => (
  <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
    <h1>404 — Siden ble ikke funnet</h1>
    <p style={{ marginTop: '1rem' }}>
      Siden du leter etter finnes ikke. <Link to="/">Gå til forsiden</Link>
    </p>
  </div>
)

const AppShell = ({ theme }: { theme: 'light' | 'dark' }) => {
  const location = useLocation()
  const isCanvasPage = location.pathname.startsWith('/canvas')
  const focusedParam = new URLSearchParams(location.search).get('focused')
  const isFocusedParam = focusedParam === 'true' || focusedParam === '1'
  const isFocusedDashboardPage = location.pathname.startsWith('/dashboard') && isFocusedParam
  const isFocusedGrafbyggerPage = location.pathname.startsWith('/grafbygger') && isFocusedParam

  const appRoutes = (
    <Routes>
      {routes.map(({ path, component }) => (
        <Route key={path} path={path} element={component} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )

  if (isCanvasPage || isFocusedDashboardPage || isFocusedGrafbyggerPage) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>{appRoutes}</Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <>
      <Page>
        <Header theme={theme} />
        <AnnouncementBanner />
        <PageLayout>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>{appRoutes}</Suspense>
          </ErrorBoundary>
          <ScrollToTopWrapper />
        </PageLayout>
      </Page>
      <Footer />
    </>
  )
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storedTheme = localStorage.getItem('umami-theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    return storedTheme || (prefersDark ? 'dark' : 'light')
  })

  useEffect(() => {
    // Listen for theme changes from ThemeButton
    const handleThemeChange = (event: CustomEvent<'light' | 'dark'>) => {
      setTheme(event.detail)
    }

    window.addEventListener('themeChange', handleThemeChange as EventListener)
    return () => {
      window.removeEventListener('themeChange', handleThemeChange as EventListener)
    }
  }, [])

  const hostname = window.location.hostname
  const isProd = hostname === 'innblikk.ansatt.nav.no'
  const isDev = hostname.includes('.dev.nav.no')

  useHead({
    script: [
      {
        defer: true,
        src: `https://cdn.nav.no/team-researchops/sporing/sporing${isProd ? '' : '-dev'}.js`,
        'data-website-id': isProd ? '0b8f9b86-ad39-48c3-9083-86ed6a399217' : '51546eed-1f17-4203-bc3a-e740671d7704',
        ...(isProd || isDev
          ? { 'data-domains': isProd ? 'innblikk.ansatt.nav.no' : 'innblikk.ansatt.dev.nav.no' }
          : { 'data-before-send': '__innblikk_sporing_dev__' }),
      },
      {
        type: 'text/javascript',
        innerHTML: `
          window.SKYRA_CONFIG = {
            org: 'arbeids-og-velferdsetaten-nav'
          };
          var script = document.createElement('script');
          script.src = 'https://survey.skyra.no/skyra-survey.js';
          document.body.appendChild(script);
        `,
      },
      {
        type: 'text/javascript',
        innerHTML: `
          (function() {
            var id = localStorage.getItem('innblikk_analytics_id');
            if (!id) { id = crypto.randomUUID(); localStorage.setItem('innblikk_analytics_id', id); }
            var interval = setInterval(function() {
              if (window.umami) { clearInterval(interval); window.umami.identify(id); }
            }, 100);
          })();
        `,
      },
      ...(!isProd && !isDev
        ? [
            {
              type: 'text/javascript',
              innerHTML: `window.__innblikk_sporing_dev__ = function(type, payload) { console.debug('[sporing]', type, payload); return false; }`,
            },
          ]
        : []),
    ],
  })

  return (
    <Theme theme={theme}>
      <Router>
        <AppShell theme={theme} />
      </Router>
    </Theme>
  )
}

export default App
