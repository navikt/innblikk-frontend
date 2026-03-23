import type { UserInfo, UsersApiResponse, ActivityApiResponse } from '../model/profile.types'

export async function fetchCurrentUserProfile(): Promise<UserInfo> {
  const response = await fetch('/api/user/me')

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || error.error || 'Failed to fetch user info')
  }

  return await response.json()
}

export async function fetchUserProfiles(requestBody: unknown): Promise<UsersApiResponse> {
  const response = await fetch('/api/bigquery/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to fetch user profiles')
  }

  return await response.json()
}

export async function fetchUserActivity(sessionId: string, requestBody: unknown): Promise<ActivityApiResponse> {
  const response = await fetch(`/api/bigquery/users/${sessionId}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to fetch user activity')
  }

  return await response.json()
}
