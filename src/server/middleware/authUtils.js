import { logger } from '../logger.js'

export const getMockUser = () => {
  if (!process.env.MOCK_NAV_IDENT) return null

  return {
    navIdent: process.env.MOCK_NAV_IDENT,
    name: 'Mock User',
    email: 'mock.user@nav.no',
  }
}

export const formatAzureName = (name = '') => {
  let normalized = name

  if (normalized.includes('Ã')) {
    try {
      normalized = Buffer.from(normalized, 'latin1').toString('utf-8')
    } catch {
      logger.warn({ name: normalized }, '[Auth] Failed to fix encoding for name')
    }
  }

  const nameParts = normalized.split(', ')
  return nameParts.length === 2 ? `${nameParts[1]} ${nameParts[0]}` : normalized
}

export const buildUserFromParsedToken = (parsed) => ({
  navIdent: parsed.NAVident,
  name: formatAzureName(parsed.name || ''),
  email: parsed.preferred_username,
})

export const loadOasis = async () => {
  try {
    const oasis = await import('@navikt/oasis')
    return { oasis }
  } catch (error) {
    return { oasis: null, error }
  }
}

export const resolveUserFromToken = async (req, oasis, messages = {}) => {
  const mergedMessages = {
    tokenMissing: 'No authentication token provided',
    invalidToken: 'Invalid token',
    invalidTokenDetailsFallback: 'Token validation failed',
    parseFailed: 'Failed to parse token',
    ...messages,
  }

  const { getToken, validateToken, parseAzureUserToken } = oasis
  const token = getToken(req)

  if (!token) {
    return { ok: false, status: 401, error: mergedMessages.tokenMissing }
  }

  const validation = await validateToken(token)

  if (!validation.ok) {
    return {
      ok: false,
      status: 401,
      error: mergedMessages.invalidToken,
      details: validation.error?.message || mergedMessages.invalidTokenDetailsFallback,
    }
  }

  const parsed = parseAzureUserToken(token)

  if (!parsed.ok) {
    return { ok: false, status: 500, error: mergedMessages.parseFailed }
  }

  return { ok: true, user: buildUserFromParsedToken(parsed) }
}
