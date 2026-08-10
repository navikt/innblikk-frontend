export type HiddenFeature = {
  id: string
  href: string
  label: string
  description: string
}

export type LegacyLink = {
  id: string
  href: string
  redirectsTo: string
  description: string
}

/**
 * Routes that exist in the app but are intentionally NOT linked from any public
 * navigation (header, footer, in-app "Analyse"/tool menus). Keep this list in sync
 * with `src/client/routes.tsx` whenever a new unadvertised route is added or removed.
 */
export const hiddenFeatures: HiddenFeature[] = [
  {
    id: 'grafbygger-copilot',
    href: '/grafbygger-copilot',
    label: 'Grafbygger Copilot',
    description:
      'Spør om en graf med egne ord, kopier prompten til Microsoft Copilot, lim inn SQL-en den svarer med. For designere/ikke-SQL-brukere.',
  },
  {
    id: 'grafbygger_next',
    href: '/grafbygger_next',
    label: 'Grafbygger (next)',
    description:
      'Forenklet omskriving av grafbyggeren med kohorter-velger, brukes til live-testing før full utrulling.',
  },
  {
    id: 'stats',
    href: '/stats',
    label: 'Statistikk',
    description: 'Aggregert oversikt over innstillinger/feature flags på tvers av brukere (fra innstillingstabellen).',
  },
]

/**
 * Old/renamed routes kept alive purely as redirects for existing bookmarks, shared links,
 * or external references (e.g. Slack, docs, Metabase). Not "hidden features" — they carry
 * no UI of their own, they just `Navigate` to the current route. Keep them working; only
 * remove an entry here (and its route in `routes.tsx`) once you're confident nothing still
 * points at the old URL.
 */
export const legacyLinks: LegacyLink[] = [
  {
    id: 'oversikt',
    href: '/oversikt',
    redirectsTo: '/dashboard',
    description: 'Gammel URL for dashboard-oversikten (før dashboard-ID ble en del av stien).',
  },
  {
    id: 'innstillinger',
    href: '/innstillinger',
    redirectsTo: '/profil',
    description: 'Gammelt navn på profil/innstillinger-siden.',
  },
  {
    id: 'klikkkart',
    href: '/klikkkart',
    redirectsTo: '/klikkoversikt',
    description: 'Gammel URL for klikkoversikt (feilstavet/tidligere navn).',
  },
  {
    id: 'varmekart',
    href: '/varmekart',
    redirectsTo: '/klikkoversikt/varmekart',
    description: 'Gammel URL for varmekart, flyttet under /klikkoversikt.',
  },
  {
    id: 'scrollkart',
    href: '/scrollkart',
    redirectsTo: '/klikkoversikt/scrollkart',
    description: 'Gammel URL for scrollkart, flyttet under /klikkoversikt.',
  },
  {
    id: 'datastruktur',
    href: '/datastruktur',
    redirectsTo: '/utforsk-hendelser',
    description: 'Gammelt navn på Egendefinerte hendelser/event explorer-siden (samme komponent, ingen redirect).',
  },
]
