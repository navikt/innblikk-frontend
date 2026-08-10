import { useCurrentUserProfile } from '../../features/user/hooks/useCurrentUserProfile'
import { isReopsTeamMember } from '../lib/reopsTeam'

/**
 * Returns whether the logged-in user is on the hardcoded ReOps team allowlist,
 * plus whether that check is still pending (profile fetch not resolved yet).
 * See `src/client/shared/lib/reopsTeam.ts`.
 */
export const useIsReopsTeamMember = (): { isReopsTeamMember: boolean; loading: boolean } => {
  const { profile, error } = useCurrentUserProfile()
  return {
    isReopsTeamMember: isReopsTeamMember(profile?.navIdent),
    loading: !profile && !error,
  }
}
