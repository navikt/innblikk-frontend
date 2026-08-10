/**
 * Team ResearchOps' id in Team Catalog (teamkatalog.nav.no / team-catalog API).
 *
 * A team id is stable, non-personal, and safe to keep in code — unlike a list of
 * nav-idents (which is personal data about specific people and changes as people
 * join/leave the team). Membership is looked up live via `teamkatalogApi.js`
 * instead of hardcoding who's currently on the team.
 *
 * Find it via: https://teamkatalog.nav.no/team/<team-id>
 */
export const REOPS_TEAM_KATALOG_ID = '26dba481-fd96-40a8-b47d-b1ad0002bc74'
