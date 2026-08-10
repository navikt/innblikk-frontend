import { useEffect, useState } from 'react'

let cachedIsReopsTeamMember: boolean | null = null
let inFlightRequest: Promise<boolean> | null = null

const fetchIsReopsTeamMember = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/user/reops-team-membership')
    if (!response.ok) return false
    const data = (await response.json()) as { isReopsTeamMember?: boolean }
    return !!data.isReopsTeamMember
  } catch {
    return false
  }
}

const loadIsReopsTeamMember = async (): Promise<boolean> => {
  if (cachedIsReopsTeamMember !== null) return cachedIsReopsTeamMember
  if (inFlightRequest) return inFlightRequest

  inFlightRequest = fetchIsReopsTeamMember()
    .then((value) => {
      cachedIsReopsTeamMember = value
      return value
    })
    .finally(() => {
      inFlightRequest = null
    })

  return inFlightRequest
}

/**
 * Whether the logged-in user is on Team ResearchOps, per Team Catalog
 * (https://teamkatalog.nav.no) — checked server-side against the stable team id
 * in `src/server/config/reopsTeam.js`, not a hardcoded nav-ident list.
 *
 * Used to reveal internal-only tooling (see `/reops-internal`) to the team that
 * built and maintains it, without exposing it in the public navigation.
 */
export const useIsReopsTeamMember = (): { isReopsTeamMember: boolean; loading: boolean } => {
  const [isReopsTeamMember, setIsReopsTeamMember] = useState(cachedIsReopsTeamMember ?? false)
  const [loading, setLoading] = useState(cachedIsReopsTeamMember === null)

  useEffect(() => {
    if (cachedIsReopsTeamMember !== null) return

    let isActive = true
    void loadIsReopsTeamMember().then((value) => {
      if (!isActive) return
      setIsReopsTeamMember(value)
      setLoading(false)
    })

    return () => {
      isActive = false
    }
  }, [])

  return { isReopsTeamMember, loading }
}
