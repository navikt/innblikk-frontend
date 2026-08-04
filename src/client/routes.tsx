import { lazy } from 'react'
import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getFeatureFlag } from './shared/lib/featureFlags.ts'

// Content Feature
const Home = lazy(() => import('./features/content').then((m) => ({ default: m.Home })))
const Komigang = lazy(() => import('./features/content').then((m) => ({ default: m.Komigang })))
const MetabaseGuide = lazy(() => import('./features/content').then((m) => ({ default: m.MetabaseGuide })))
const Personvern = lazy(() => import('./features/content').then((m) => ({ default: m.Personvern })))
const Tilgjengelighet = lazy(() => import('./features/content').then((m) => ({ default: m.Tilgjengelighet })))
const Taksonomi = lazy(() => import('./features/content').then((m) => ({ default: m.Taksonomi })))
const Oppsett = lazy(() => import('./features/content').then((m) => ({ default: m.Oppsett })))
const Sporingskoder = lazy(() => import('./features/content').then((m) => ({ default: m.Sporingskoder })))

// Chartbuilder Feature
const Grafbygger = lazy(() => import('./features/chartbuilder').then((m) => ({ default: m.Grafbygger })))
const Grafdeling = lazy(() => import('./features/chartbuilder').then((m) => ({ default: m.Grafdeling })))

// Chartbuilder Next Feature (unadvertised, simplified grafbygger + cohorts, for live testing)
const GrafbyggerNext = lazy(() => import('./features/chartbuilder-next').then((m) => ({ default: m.Grafbygger })))

// Cohort Manager Feature
const CohortManager = lazy(() =>
  import('./features/cohortmanager/index.ts').then((m) => ({ default: m.CohortManager })),
)

// Backend Test Feature
const Oversikt = lazy(() => import('./features/oversikt/index.ts').then((m) => ({ default: m.Oversikt })))
const ProjectManager = lazy(() =>
  import('./features/projectmanager/index.ts').then((m) => ({ default: m.ProjectManager })),
)

// Analysis Feature
const UserComposition = lazy(() => import('./features/analysis').then((m) => ({ default: m.UserComposition })))
const Spellings = lazy(() => import('./features/analysis').then((m) => ({ default: m.Spellings })))
const Wcag = lazy(() => import('./features/analysis').then((m) => ({ default: m.Wcag })))
const BrokenLinks = lazy(() => import('./features/analysis').then((m) => ({ default: m.BrokenLinks })))
const PrivacyCheck = lazy(() => import('./features/analysis').then((m) => ({ default: m.PrivacyCheck })))
const Diagnosis = lazy(() => import('./features/analysis').then((m) => ({ default: m.Diagnosis })))

// User Feature
const UserJourney = lazy(() => import('./features/user').then((m) => ({ default: m.UserJourney })))
const UserProfile = lazy(() => import('./features/user').then((m) => ({ default: m.UserProfile })))
const UserProfiles = lazy(() => import('./features/user').then((m) => ({ default: m.UserProfiles })))

// Events Feature
const EventExplorer = lazy(() => import('./features/eventexplorer').then((m) => ({ default: m.EventExplorer })))
const Clickmap = lazy(() => import('./features/clickmap').then((m) => ({ default: m.Clickmap })))
const Canvas = lazy(() => import('./features/canvas').then((m) => ({ default: m.Canvas })))
const CanvasShareView = lazy(() => import('./features/canvas').then((m) => ({ default: m.CanvasShareView })))
const CanvasPresentationView = lazy(() =>
  import('./features/canvas').then((m) => ({ default: m.CanvasPresentationView })),
)
const EventJourneyClickmap = lazy(() =>
  import('./features/clickmap').then((m) => ({ default: m.EventJourneyClickmap })),
)

// Event Journey Feature
const EventJourney = lazy(() => import('./features/eventjourney').then((m) => ({ default: m.EventJourney })))

// Traffic Feature
const TrafficAnalysis = lazy(() => import('./features/traffic').then((m) => ({ default: m.TrafficAnalysis })))
const MarketingAnalysis = lazy(() => import('./features/traffic').then((m) => ({ default: m.MarketingAnalysis })))

// Funnel Feature
const Funnel = lazy(() => import('./features/funnel').then((m) => ({ default: m.Funnel })))

// Retention Feature
const Retention = lazy(() => import('./features/retention').then((m) => ({ default: m.Retention })))
const GoalCompletion = lazy(() => import('./features/goalcompletion').then((m) => ({ default: m.GoalCompletion })))

// Stats Feature
const Stats = lazy(() => import('./features/stats').then((m) => ({ default: m.Stats })))

// SQL Feature
const SqlEditor = lazy(() => import('./features/sql').then((m) => ({ default: m.SqlEditor })))

const InnstillingerRedirect = () => <Navigate to="/profil" replace />

const DashboardRouteResolver = () => {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const visning = params.get('visning')

  if (visning === 'fylkeskontor') {
    return <Navigate to="/dashboard/10" replace />
  }
  if (visning === 'hjelpemiddelsentral') {
    return <Navigate to="/dashboard/11" replace />
  }

  const legacyDashboardId = params.get('dashboardId')
  if (legacyDashboardId) {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('dashboardId')
    const query = nextParams.toString()
    return <Navigate to={`/dashboard/${legacyDashboardId}${query ? `?${query}` : ''}`} replace />
  }

  return <ProjectManager />
}

const DashboardDetailRoute = () => <Oversikt />

const LegacyOversiktRedirect = () => {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const dashboardId = params.get('dashboardId')

  if (!dashboardId) {
    const query = params.toString()
    return <Navigate to={`/dashboard${query ? `?${query}` : ''}`} replace />
  }

  params.delete('dashboardId')
  const query = params.toString()
  return <Navigate to={`/dashboard/${dashboardId}${query ? `?${query}` : ''}`} replace />
}

const LegacyVisualizationRouteRedirect = ({ to }: { to: string }) => {
  const location = useLocation()
  return <Navigate to={`${to}${location.search}`} replace />
}

const WcagRoute = () => {
  if (!getFeatureFlag('beta_opt_in')) {
    return <Navigate to="/profil#beta" replace />
  }

  return <Wcag />
}

export type AppRoute = {
  path: string
  component: ReactElement
  fullWidth?: boolean
}

export const fullWidthPathPrefixes = [
  '/trafikkanalyse',
  '/markedsanalyse',
  '/utforsk-hendelser',
  '/klikkoversikt',
  '/datastruktur',
  '/brukerprofiler',
  '/brukerlojalitet',
  '/maloppnaelse',
  '/brukersammensetning',
  '/brukerreiser',
  '/hendelsesreiser',
  '/hendelsesreiser/visualisering',
  '/trakt',
  '/personvernssjekk',
  '/diagnose',
  '/grafdeling',
  '/dashboard/',
  '/profil',
  '/kvalitet/odelagte-lenker',
  '/kvalitet/stavekontroll',
  '/kvalitet/wcag',
  '/sql',
]

export const routes: AppRoute[] = [
  { path: '/', component: <Home />, fullWidth: true },
  { path: '/komigang', component: <Komigang />, fullWidth: true },
  { path: '/oppsett', component: <Oppsett />, fullWidth: true },
  { path: '/sporingskoder', component: <Sporingskoder />, fullWidth: true },
  { path: '/personvern', component: <Personvern />, fullWidth: true },
  { path: '/tilgjengelighet', component: <Tilgjengelighet />, fullWidth: true },

  { path: '/taksonomi', component: <Taksonomi />, fullWidth: true },
  { path: '/grafbygger', component: <Grafbygger />, fullWidth: true },
  { path: '/grafbygger_next', component: <GrafbyggerNext />, fullWidth: true },
  { path: '/kohorter', component: <CohortManager />, fullWidth: true },
  { path: '/metabase', component: <MetabaseGuide />, fullWidth: true },

  { path: '/sql', component: <SqlEditor />, fullWidth: true },
  { path: '/stats', component: <Stats />, fullWidth: true },
  { path: '/innstillinger', component: <InnstillingerRedirect />, fullWidth: true },
  { path: '/grafdeling', component: <Grafdeling />, fullWidth: true },
  { path: '/dashboard', component: <DashboardRouteResolver />, fullWidth: true },
  { path: '/dashboard/:dashboardId', component: <DashboardDetailRoute />, fullWidth: true },
  { path: '/brukerreiser', component: <UserJourney />, fullWidth: true },
  { path: '/hendelsesreiser', component: <EventJourney />, fullWidth: true },
  { path: '/hendelsesreiser/visualisering', component: <EventJourneyClickmap />, fullWidth: true },
  { path: '/trakt', component: <Funnel />, fullWidth: true },
  { path: '/brukerlojalitet', component: <Retention />, fullWidth: true },
  {
    path: '/maloppnaelse',
    component: <GoalCompletion />,
    fullWidth: true,
  },
  { path: '/brukersammensetning', component: <UserComposition />, fullWidth: true },
  { path: '/brukerprofiler', component: <UserProfiles />, fullWidth: true },
  { path: '/utforsk-hendelser', component: <EventExplorer />, fullWidth: true },
  { path: '/klikkoversikt', component: <Clickmap />, fullWidth: true },
  { path: '/canvas', component: <Canvas />, fullWidth: true },
  { path: '/canvas/share', component: <CanvasShareView />, fullWidth: true },
  { path: '/canvas/presentation', component: <CanvasPresentationView />, fullWidth: true },
  { path: '/klikkoversikt/varmekart', component: <Clickmap visualizationMode="heatmap" />, fullWidth: true },
  { path: '/klikkoversikt/scrollkart', component: <Clickmap visualizationMode="scrollmap" />, fullWidth: true },
  { path: '/klikkkart', component: <LegacyVisualizationRouteRedirect to="/klikkoversikt" />, fullWidth: true },
  {
    path: '/varmekart',
    component: <LegacyVisualizationRouteRedirect to="/klikkoversikt/varmekart" />,
    fullWidth: true,
  },
  {
    path: '/scrollkart',
    component: <LegacyVisualizationRouteRedirect to="/klikkoversikt/scrollkart" />,
    fullWidth: true,
  },
  { path: '/datastruktur', component: <EventExplorer />, fullWidth: true },
  { path: '/trafikkanalyse', component: <TrafficAnalysis />, fullWidth: true },
  { path: '/markedsanalyse', component: <MarketingAnalysis />, fullWidth: true },
  { path: '/personvernssjekk', component: <PrivacyCheck />, fullWidth: true },
  { path: '/diagnose', component: <Diagnosis />, fullWidth: true },
  { path: '/profil', component: <UserProfile />, fullWidth: true },
  { path: '/oversikt', component: <LegacyOversiktRedirect />, fullWidth: true },
  { path: '/kvalitet/odelagte-lenker', component: <BrokenLinks />, fullWidth: true },
  { path: '/kvalitet/stavekontroll', component: <Spellings />, fullWidth: true },
  { path: '/kvalitet/wcag', component: <WcagRoute />, fullWidth: true },
]

export const isFullWidthPath = (pathname: string) =>
  fullWidthPathPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
  routes.some((route) => route.fullWidth && route.path === pathname)

export default routes
