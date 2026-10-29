import { useCallback, useEffect, useState } from 'react'
import { fetchTeamCatalogTeams, type WebsiteManagementTeam } from '../api/websiteManagementApi.ts'

let teamsPromise: Promise<WebsiteManagementTeam[]> | null = null

function loadTeams() {
  teamsPromise ??= fetchTeamCatalogTeams().catch((error: unknown) => {
    teamsPromise = null
    throw error
  })
  return teamsPromise
}

/**
 * General rule: never show a raw team UUID as a team's name. Resolve ids to names through
 * Team Catalog with `teamName`, and keep the UUID for detail views only.
 */
export function useTeamCatalog() {
  const [teams, setTeams] = useState<WebsiteManagementTeam[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    loadTeams()
      .then((value) => {
        if (isMounted) setTeams(value)
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  const teamName = useCallback(
    (teamId: string | null | undefined, fallback = 'Ukjent team') => {
      if (!teamId) return fallback
      return teams.find((team) => team.id === teamId)?.name ?? fallback
    },
    [teams],
  )

  return { teams, isLoading, teamName }
}

/** Merge team lists by id; earlier lists win. */
export function mergeTeams(...lists: WebsiteManagementTeam[][]): WebsiteManagementTeam[] {
  const byId = new Map<string, WebsiteManagementTeam>()
  for (const list of lists) for (const team of list) if (!byId.has(team.id)) byId.set(team.id, team)
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'nb'))
}
