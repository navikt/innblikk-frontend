import type { FeatureFlags } from './featureFlags.ts'

/**
 * Registry of features currently in alfa or beta.
 *
 * «Beta» here describes the *feature*, never the user: there is no opt-in,
 * everyone gets beta features. Alfa features require explicit opt-in through
 * their own checkbox in /innstillinger. Beta features surface a dismissable
 * notice (BetaFeatureNotice) where they live. This registry is the single
 * source of truth for which features are in alfa or beta, and powers the
 * corresponding overviews on /innstillinger.
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
  /** One-liner about what is new/experimental, shown in the /innstillinger overview. */
  description: string
  /** Where the feature lives. Omit for global features (e.g. the design itself). */
  href?: string
} & ({ stage: 'alfa'; optInFlag: keyof FeatureFlags } | { stage?: 'beta'; optInFlag?: never })

export const betaFeatures: BetaFeature[] = [
  {
    id: 'gjentatt-aktivitet',
    stage: 'alfa',
    title: 'Gjentatt aktivitet',
    description: 'Finn gjentatte sidevisninger og interaksjoner som kan tyde på frustrasjon eller dobbelsporing.',
    href: '/gjentatt-aktivitet',
  },
  {
    id: 'nytt-design',
    title: 'Nytt design',
    description: 'Ny sidemeny og nytt design på alle sider.',
  },
  {
    id: 'grafbygger-rewrite',
    title: 'Grafbyggeren',
    description: 'Velg hendelser, og legg til filtre og brukergrupper ved behov.',
    href: '/grafbygger',
  },
  {
    id: 'grafbygger-filter-selector',
    stage: 'alfa',
    optInFlag: 'grafbygger_custom_filter_selector',
    title: 'Ny filtervelger i grafbyggeren',
    description: 'Søk etter filtre og se forklaringer og eksempler før du velger.',
    href: '/grafbygger',
  },
  {
    id: 'brukergrupper',
    title: 'Brukergrupper',
    description: 'Definer brukergrupper, se gruppestørrelsen og bruk gruppene i Grafbygger.',
    href: '/brukergrupper',
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
  {
    id: 'sidegrupper',
    title: 'Sidegrupper',
    description: 'Grupper sider på nettstedet ditt etter URL-mønstre.',
    href: '/sidegrupper',
  },
]
