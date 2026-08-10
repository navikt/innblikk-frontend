/**
 * Hardcoded allowlist of nav-idents for the ReOps (team-researchops) frontend developers.
 *
 * Used to reveal internal/unadvertised tooling (see `/reops-internal`) to the people who
 * built and maintain it, without exposing it in the public navigation.
 *
 * Add your own nav-ident here to see the hidden features overview + its link in the
 * "Teknisk meny" header dropdown.
 */
export const REOPS_TEAM_NAV_IDENTS: string[] = [
  'N168371',
  'J163467',
  'P167049',
  'H154126',
  'K105026',
  'J178430',
  'S157797',
  'J125238',
]

export const isReopsTeamMember = (navIdent?: string | null): boolean =>
  !!navIdent && REOPS_TEAM_NAV_IDENTS.includes(navIdent)
