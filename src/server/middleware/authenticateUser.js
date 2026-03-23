import { getMockUser, loadOasis, resolveUserFromToken } from './authUtils.js'

async function authenticateUser(req, res, next) {
  try {
    // Check for mock ident even if oasis is available (for local testing with installed deps)
    const mockUser = getMockUser()
    if (mockUser) {
      console.log('[Auth] Using MOCK_NAV_IDENT (override):', mockUser.navIdent)
      req.user = mockUser
      return next()
    }

    // Try to import @navikt/oasis
    const { oasis } = await loadOasis()
    if (!oasis) {
      console.log('[Auth] @navikt/oasis not available and no MOCK_NAV_IDENT set')
      req.user = { navIdent: 'LOCAL_DEV' } // Fallback for local development
      return next()
    }

    const result = await resolveUserFromToken(req, oasis, {
      tokenMissing: 'Ingen autentiseringstoken',
      invalidToken: 'Ugyldig token',
      invalidTokenDetailsFallback: 'Token-validering feilet',
      parseFailed: 'Kunne ikke parse token',
    })

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        details: result.details,
      })
    }

    req.user = result.user
    console.log(`[Auth] User authenticated: ${result.user.navIdent}`)
    next()
  } catch (error) {
    console.error('[Auth] Authentication error:', error)
    return res.status(500).json({
      error: 'Autentisering feilet',
      details: error.message,
    })
  }
}

export { authenticateUser }
