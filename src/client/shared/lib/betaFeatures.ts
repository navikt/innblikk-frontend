/**
 * Registry of features currently in beta.
 *
 * «Beta» here describes the *feature*, never the user: there is no opt-in,
 * everyone gets beta features, and each feature surfaces its own dismissable
 * notice (BetaFeatureNotice) where it lives. This registry is the single
 * source of truth for which features are in beta, and powers the overview on
 * /profil («Funksjoner i beta»).
 *
 * When a feature graduates out of beta: remove its registry entry, its
 * mounted BetaFeatureNotice, and its `beta: true` marker in
 * analyticsNavigation.ts (if any). Dismissed ids left in localStorage are
 * inert once the notice is unmounted.
 */
export type BetaFeature = {
  /** Dismissal key (dismissedAlerts.ts) and registry key. */
  id: string
  /** Short name, e.g. «Grafbyggeren». */
  title: string
  /** One-liner about what is new/experimental, shown in the /profil overview. */
  description: string
  /** Where the feature lives. */
  href: string
}

export const betaFeatures: BetaFeature[] = [
  {
    id: 'grafbygger-rewrite',
    title: 'Grafbyggeren',
    description: 'Store endringer, med blant annet støtte for brukergrupper.',
    href: '/grafbygger',
  },
  {
    id: 'wcag-sjekk',
    title: 'WCAG-sjekk',
    description: 'Sjekker nettsiden din mot WCAG-krav og viser hva som bør fikses.',
    href: '/kvalitet/wcag',
  },
  {
    id: 'canvas',
    title: 'Canvas',
    description: 'Delbart lerret for å samle grafer og funn på ett sted.',
    href: '/canvas',
  },
]
