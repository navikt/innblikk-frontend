import { lazy } from 'react'
import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader } from '@navikt/ds-react'
import { useIsReopsTeamMember } from './shared/hooks/useIsReopsTeamMember.ts'
import { preserveSharedAnalysisParams } from './shared/lib/analysisNavigation.ts'
import type { BreadcrumbResolver } from './shared/ui/RouteBreadcrumbs.tsx'

// Content Feature
const Home = lazy(() => import('./features/content').then((m) => ({ default: m.Home })))
const Features = lazy(() => import('./features/content/ui/Features.tsx'))
const Komigang = lazy(() => import('./features/content').then((m) => ({ default: m.Komigang })))
const MetabaseGuide = lazy(() => import('./features/content').then((m) => ({ default: m.MetabaseGuide })))
const Personvern = lazy(() => import('./features/content').then((m) => ({ default: m.Personvern })))
const Tilgjengelighet = lazy(() => import('./features/content').then((m) => ({ default: m.Tilgjengelighet })))
const Taksonomi = lazy(() => import('./features/content').then((m) => ({ default: m.Taksonomi })))
const Oppsett = lazy(() => import('./features/content').then((m) => ({ default: m.Oppsett })))
const Sporingskoder = lazy(() => import('./features/content').then((m) => ({ default: m.Sporingskoder })))
const Sidegrupper = lazy(() => import('./features/sidegroups').then((m) => ({ default: m.Sidegroups })))
const SidegruppeEditor = lazy(() => import('./features/sidegroups').then((m) => ({ default: m.SidegroupEditorPage })))

// Chartbuilder Feature (the rewritten grafbygger, with cohorts — currently in beta)
const Grafbygger = lazy(() => import('./features/chartbuilder-next').then((m) => ({ default: m.Grafbygger })))
const Grafdeling = lazy(() => import('./features/chartbuilder-next').then((m) => ({ default: m.Grafdeling })))

// Old Chartbuilder Feature (the previous grafbygger, kept available under /grafbygger-old)
const GrafbyggerOld = lazy(() => import('./features/chartbuilder-old').then((m) => ({ default: m.Grafbygger })))

// Cohort Manager Feature
const CohortManager = lazy(() =>
  import('./features/cohortmanager/index.ts').then((m) => ({ default: m.CohortManager })),
)

// Cohort Manager rewrite (isolated, reachable by URL only)
const CohortManagerNext = lazy(() =>
  import('./features/cohortmanager-next/index.ts').then((m) => ({ default: m.CohortManagerNext })),
)
const CohortEditorPage = lazy(() =>
  import('./features/cohortmanager-next/index.ts').then((m) => ({ default: m.CohortEditorPage })),
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
const TableBuilder = lazy(() => import('./features/tablebuilder').then((m) => ({ default: m.TableBuilder })))

// Funnel Feature
const Funnel = lazy(() => import('./features/funnel').then((m) => ({ default: m.Funnel })))

// Retention Feature
const Retention = lazy(() => import('./features/retention').then((m) => ({ default: m.Retention })))
const GoalCompletion = lazy(() => import('./features/goalcompletion').then((m) => ({ default: m.GoalCompletion })))

// Stats Feature
const Stats = lazy(() => import('./features/stats').then((m) => ({ default: m.Stats })))

// SQL Feature
const SqlEditor = lazy(() => import('./features/sql').then((m) => ({ default: m.SqlEditor })))
const SqlNextPage = lazy(() => import('./features/sql-next').then((m) => ({ default: m.SqlNextPage })))

// Copilot Feature (unadvertised, for designers – ask in natural language, paste SQL from Microsoft Copilot)
const CopilotAnalyse = lazy(() => import('./features/copilot').then((m) => ({ default: m.CopilotAnalyse })))

// Assistant Feature (unadvertised, generic/extensible LLM chat scaffolding — experimental)
const Copilot = lazy(() => import('./features/assistant').then((m) => ({ default: m.Copilot })))

// ReOps-internal Feature (unadvertised, nav-ident gated overview of hidden features)
const ReopsInternal = lazy(() => import('./features/reops-internal').then((m) => ({ default: m.ReopsInternal })))

// Website management (beta): own-team self-service + ReOps admin surface
const MineNettsider = lazy(() => import('./features/website-management').then((m) => ({ default: m.MineNettsider })))
const AdminNettsider = lazy(() => import('./features/website-management').then((m) => ({ default: m.AdminNettsider })))

const ProfilRedirect = () => <LegacyRouteRedirect to="/innstillinger" />

const DashboardRouteResolver = () => {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const visning = params.get('visning')

  if (visning === 'fylkeskontor') {
    params.delete('visning')
    return <Navigate to={{ pathname: '/dashboard/10', search: params.toString(), hash: location.hash }} replace />
  }
  if (visning === 'hjelpemiddelsentral') {
    params.delete('visning')
    return <Navigate to={{ pathname: '/dashboard/11', search: params.toString(), hash: location.hash }} replace />
  }

  const legacyDashboardId = params.get('dashboardId')
  if (legacyDashboardId) {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('dashboardId')
    const query = nextParams.toString()
    return (
      <Navigate
        to={{ pathname: `/dashboard/${encodeURIComponent(legacyDashboardId)}`, search: query, hash: location.hash }}
        replace
      />
    )
  }

  return <ProjectManager />
}

const DashboardDetailRoute = () => <Oversikt />
const ChartImport = lazy(() => import('./features/dashboard/ui/ChartImport'))

const LegacyOversiktRedirect = () => {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const dashboardId = params.get('dashboardId')

  if (!dashboardId) {
    const query = params.toString()
    return <Navigate to={{ pathname: '/dashboard', search: query, hash: location.hash }} replace />
  }

  params.delete('dashboardId')
  const query = params.toString()
  return (
    <Navigate
      to={{ pathname: `/dashboard/${encodeURIComponent(dashboardId)}`, search: query, hash: location.hash }}
      replace
    />
  )
}

const LegacyRouteRedirect = ({ to }: { to: string }) => {
  const location = useLocation()
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />
}

const ReopsInternalRoute = () => {
  const { isReopsTeamMember, loading } = useIsReopsTeamMember()

  if (loading) {
    return <Loader size="xlarge" title="Laster inn..." />
  }

  if (!isReopsTeamMember) {
    return <Navigate to="/" replace />
  }

  return <ReopsInternal />
}

const AdminNettsiderRoute = () => {
  const { isReopsTeamMember, loading } = useIsReopsTeamMember()

  // Gated on Team ResearchOps membership (UX only) — the server-side BFF enforces the
  // same boundary via requireReopsTeamMember for scope=all and hard delete.
  if (loading) {
    return <Loader size="xlarge" title="Laster inn..." />
  }

  if (!isReopsTeamMember) {
    return <Navigate to="/" replace />
  }

  return <AdminNettsider />
}

const CopilotRoute = () => {
  const { isReopsTeamMember, loading } = useIsReopsTeamMember()

  // Copilot is gated on Team ResearchOps membership, the actual security
  // boundary (enforced server-side too, see requireReopsTeamMember.js).
  if (loading) {
    return <Loader size="xlarge" title="Laster inn..." />
  }

  if (!isReopsTeamMember) {
    return <Navigate to="/" replace />
  }

  return <Copilot />
}

export type AppRoute = {
  path: string
  component: ReactElement
  fullWidth?: boolean
  breadcrumbs?: BreadcrumbResolver
}

const childBreadcrumbs =
  (parentPath: string, parentLabel: string, label: string): BreadcrumbResolver =>
  (_params, search) => [{ label: parentLabel, to: preserveSharedAnalysisParams(parentPath, search) }, { label }]

const eventBreadcrumbs =
  (parameter = false): BreadcrumbResolver =>
  (_params, search) => {
    const params = new URLSearchParams(search)
    const event = params.get('event') || 'Hendelse'
    const items = [
      { label: 'Egendefinerte hendelser', to: preserveSharedAnalysisParams('/utforsk-hendelser', search) },
      { label: event },
    ]
    if (parameter) {
      items[1] = {
        label: event,
        to: preserveSharedAnalysisParams(`/utforsk-hendelser/hendelse?${new URLSearchParams({ event })}`, search),
      }
      items.push({ label: params.get('parameter') || 'Hendelsesdetalj' })
    }
    return items
  }

export const fullWidthPathPrefixes = [
  '/trafikkanalyse',
  '/tabellbygger',
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
  '/grafbygger-old',
  '/dashboard/',
  '/brukergrupper/',
  '/sidegrupper/',
  '/profil',
  '/innstillinger',
  '/kvalitet/odelagte-lenker',
  '/kvalitet/stavekontroll',
  '/kvalitet/wcag',
  '/sql-old',
  '/sql',
  '/grafbygger-copilot',
  '/copilot',
  '/reops-internal',
  '/mine-nettsider',
]

export const routes: AppRoute[] = [
  { path: '/', component: <Home />, fullWidth: true },
  { path: '/funksjoner', component: <Features />, fullWidth: true },
  { path: '/komigang', component: <Komigang />, fullWidth: true },
  { path: '/oppsett', component: <Oppsett />, fullWidth: true },
  { path: '/sporingskoder', component: <Sporingskoder />, fullWidth: true },
  { path: '/sidegrupper', component: <Sidegrupper />, fullWidth: true },
  {
    path: '/sidegrupper/ny',
    component: <SidegruppeEditor />,
    fullWidth: true,
    breadcrumbs: childBreadcrumbs('/sidegrupper', 'Sidegrupper', 'Ny sidegruppe'),
  },
  {
    path: '/sidegrupper/:id',
    component: <SidegruppeEditor />,
    fullWidth: true,
    breadcrumbs: childBreadcrumbs('/sidegrupper', 'Sidegrupper', 'Rediger sidegruppe'),
  },
  { path: '/personvern', component: <Personvern />, fullWidth: true },
  { path: '/tilgjengelighet', component: <Tilgjengelighet />, fullWidth: true },

  { path: '/taksonomi', component: <Taksonomi />, fullWidth: true },
  { path: '/grafbygger', component: <Grafbygger key="next" edition="next" />, fullWidth: true },
  { path: '/grafbygger-eol', component: <Grafbygger key="current" edition="current" />, fullWidth: true },
  {
    path: '/grafbygger-alfa',
    component: <LegacyRouteRedirect to="/grafbygger" />,
    fullWidth: true,
  },
  {
    path: '/grafbygger-next',
    component: <LegacyRouteRedirect to="/grafbygger" />,
    fullWidth: true,
  },
  { path: '/grafbygger-old', component: <GrafbyggerOld />, fullWidth: true },
  // Legacy alias from the pre-rollout live-testing route.
  { path: '/grafbygger_next', component: <LegacyRouteRedirect to="/grafbygger" />, fullWidth: true },
  { path: '/brukergrupper-pro', component: <CohortManager />, fullWidth: true },
  { path: '/brukergrupper', component: <CohortManagerNext />, fullWidth: true },
  {
    path: '/brukergrupper/ny',
    component: <CohortEditorPage />,
    fullWidth: true,
    breadcrumbs: childBreadcrumbs('/brukergrupper', 'Brukergrupper', 'Ny brukergruppe'),
  },
  {
    path: '/brukergrupper/:id',
    component: <CohortEditorPage />,
    fullWidth: true,
    breadcrumbs: childBreadcrumbs('/brukergrupper', 'Brukergrupper', 'Rediger brukergruppe'),
  },
  // Legacy alias — user-facing name changed from "kohorter" to "brukergrupper"; backend still calls them cohorts.
  { path: '/kohorter', component: <LegacyRouteRedirect to="/brukergrupper" />, fullWidth: true },
  { path: '/metabase', component: <MetabaseGuide />, fullWidth: true },

  { path: '/grafbygger-copilot', component: <CopilotAnalyse />, fullWidth: true },
  { path: '/copilot', component: <CopilotRoute />, fullWidth: true },
  { path: '/reops-internal', component: <ReopsInternalRoute />, fullWidth: true },
  {
    path: '/reops-internal/nettsider',
    component: <AdminNettsiderRoute />,
    fullWidth: true,
    breadcrumbs: childBreadcrumbs('/reops-internal', 'ReOps-internt', 'Nettsider'),
  },
  // Unlisted: self-service is not advertised anywhere yet (no nav, beta list or links); works in dev only.
  { path: '/mine-nettsider', component: <MineNettsider />, fullWidth: true },
  { path: '/sql', component: <SqlNextPage />, fullWidth: true },
  { path: '/sql-old', component: <SqlEditor />, fullWidth: true },
  { path: '/stats', component: <Stats />, fullWidth: true },
  { path: '/innstillinger', component: <UserProfile />, fullWidth: true },
  { path: '/grafdeling', component: <Grafdeling />, fullWidth: true },
  { path: '/dashboard', component: <DashboardRouteResolver />, fullWidth: true },
  {
    path: '/dashboard/:dashboardId',
    component: <DashboardDetailRoute />,
    fullWidth: true,
  },
  { path: '/importer-graf', component: <ChartImport />, fullWidth: true },
  { path: '/brukerreiser', component: <UserJourney />, fullWidth: true },
  { path: '/hendelsesreiser', component: <EventJourney />, fullWidth: true },
  {
    path: '/hendelsesreiser/visualisering',
    component: <EventJourneyClickmap />,
    fullWidth: true,
    breadcrumbs: childBreadcrumbs('/hendelsesreiser', 'Hendelsesforløp', 'Visualisering'),
  },
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
  {
    path: '/utforsk-hendelser/hendelse',
    component: <EventExplorer />,
    fullWidth: true,
    breadcrumbs: eventBreadcrumbs(),
  },
  {
    path: '/utforsk-hendelser/hendelse/parameter',
    component: <EventExplorer />,
    fullWidth: true,
    breadcrumbs: eventBreadcrumbs(true),
  },
  { path: '/klikkoversikt', component: <Clickmap />, fullWidth: true },
  { path: '/canvas', component: <Canvas />, fullWidth: true },
  { path: '/canvas/share', component: <CanvasShareView />, fullWidth: true },
  { path: '/canvas/presentation', component: <CanvasPresentationView />, fullWidth: true },
  {
    path: '/klikkoversikt/varmekart',
    component: <Clickmap visualizationMode="heatmap" />,
    fullWidth: true,
    breadcrumbs: childBreadcrumbs('/klikkoversikt', 'Klikkoversikt', 'Varmekart'),
  },
  {
    path: '/klikkoversikt/scrollkart',
    component: <Clickmap visualizationMode="scrollmap" />,
    fullWidth: true,
    breadcrumbs: childBreadcrumbs('/klikkoversikt', 'Klikkoversikt', 'Scrollkart'),
  },
  { path: '/klikkkart', component: <LegacyRouteRedirect to="/klikkoversikt" />, fullWidth: true },
  {
    path: '/varmekart',
    component: <LegacyRouteRedirect to="/klikkoversikt/varmekart" />,
    fullWidth: true,
  },
  {
    path: '/scrollkart',
    component: <LegacyRouteRedirect to="/klikkoversikt/scrollkart" />,
    fullWidth: true,
  },
  { path: '/datastruktur', component: <LegacyRouteRedirect to="/utforsk-hendelser" />, fullWidth: true },
  { path: '/trafikkanalyse', component: <TrafficAnalysis />, fullWidth: true },
  { path: '/tabellbygger', component: <TableBuilder />, fullWidth: true },
  { path: '/markedsanalyse', component: <MarketingAnalysis />, fullWidth: true },
  { path: '/personvernssjekk', component: <PrivacyCheck />, fullWidth: true },
  { path: '/diagnose', component: <Diagnosis />, fullWidth: true },
  { path: '/profil', component: <ProfilRedirect />, fullWidth: true },
  { path: '/oversikt', component: <LegacyOversiktRedirect />, fullWidth: true },
  { path: '/kvalitet/odelagte-lenker', component: <BrokenLinks />, fullWidth: true },
  { path: '/kvalitet/stavekontroll', component: <Spellings />, fullWidth: true },
  { path: '/kvalitet/wcag', component: <Wcag />, fullWidth: true },
]

export const isFullWidthPath = (pathname: string) =>
  fullWidthPathPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
  routes.some((route) => route.fullWidth && route.path === pathname)

export default routes
