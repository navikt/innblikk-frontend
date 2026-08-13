import { getMockUser, loadOasis, resolveUserFromToken } from './authUtils.js'
import { logger } from '../logger.js'

let lastLoggedMockNavIdent = null

async function authenticateUser(req, res, next) {
  try {
    // Check for mock ident even if oasis is available (for local testing with installed deps)
    const mockUser = getMockUser()
    if (mockUser) {
      if (mockUser.navIdent !== lastLoggedMockNavIdent) {
        logger.info({ navIdent: mockUser.navIdent }, '[Auth] Using MOCK_NAV_IDENT (override)')
        lastLoggedMockNavIdent = mockUser.navIdent
      }
      req.user = mockUser
      return next()
    }

    // Try to import @navikt/oasis
    const { oasis } = await loadOasis()
    if (!oasis) {
      logger.info('[Auth] @navikt/oasis not available and no MOCK_NAV_IDENT set')
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
    logger.info({ navIdent: result.user.navIdent }, '[Auth] User authenticated')
    next()
  } catch (error) {
    logger.error({ error }, '[Auth] Authentication error')
    return res.status(500).json({
      error: 'Autentisering feilet',
      details: error.message,
    })
  }
}

export { authenticateUser }
