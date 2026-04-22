import type { QueryStats } from '../../../shared/types/queryStats'

export type UserInfo = {
  navIdent: string
  name: string
  email: string
  authenticated: boolean
  message: string
}

export type UserProfile = {
  userId?: string
  idType?: string
  sessionIds?: string[]
  distinctId?: string
  country?: string
  browser?: string
  device?: string
  os?: string
  firstSeen: string
  lastSeen: string
  primarySessionId?: string
}

export type ActivityItem = {
  type: string
  name?: string
  title?: string
  url?: string
  createdAt: string
}

export type { QueryStats }

export type UsersApiResponse = {
  users: UserProfile[]
  total: number
  generatedSql?: string
  queryStats?: QueryStats | null
}

export type ActivityApiResponse = {
  activity: ActivityItem[]
}
