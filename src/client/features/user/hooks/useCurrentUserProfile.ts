import { useEffect, useState } from 'react'
import { fetchCurrentUserProfile } from '../api/profile.api.ts'
import type { UserInfo } from '../model/profile.types'

let cachedCurrentUserProfile: UserInfo | null = null
let inFlightCurrentUserProfileRequest: Promise<UserInfo> | null = null

const loadCurrentUserProfile = async (): Promise<UserInfo> => {
  if (cachedCurrentUserProfile) return cachedCurrentUserProfile
  if (inFlightCurrentUserProfileRequest) return inFlightCurrentUserProfileRequest

  inFlightCurrentUserProfileRequest = fetchCurrentUserProfile()
    .then((profile) => {
      cachedCurrentUserProfile = profile
      return profile
    })
    .finally(() => {
      inFlightCurrentUserProfileRequest = null
    })

  return inFlightCurrentUserProfileRequest
}

export const useCurrentUserProfile = () => {
  const [profile, setProfile] = useState<UserInfo | null>(cachedCurrentUserProfile)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let isActive = true

    if (cachedCurrentUserProfile) {
      return () => {
        isActive = false
      }
    }

    void loadCurrentUserProfile()
      .then((nextProfile) => {
        if (!isActive) return
        setProfile(nextProfile)
      })
      .catch((nextError: unknown) => {
        if (!isActive) return
        setError(nextError instanceof Error ? nextError : new Error('Failed to fetch user info'))
      })

    return () => {
      isActive = false
    }
  }, [])

  return { profile, error }
}
