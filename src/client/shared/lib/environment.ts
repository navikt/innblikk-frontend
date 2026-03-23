/**
 * Environment detection utilities for determining the runtime environment
 * based on hostname/domain.
 */

/**
 * Checks if the app is running on localhost
 */
export const isLocalhost = (): boolean => {
  if (typeof window === 'undefined') return false

  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Checks if the app is running in a development environment
 * Development URLs typically follow the pattern: *-dev.*.nav.no
 */
export const isDevelopment = (): boolean => {
  if (typeof window === 'undefined') return false

  const hostname = window.location.hostname
  return hostname.endsWith('dev.nav.no')
}

/**
 * Gets the appropriate base URL based on the environment
 * Useful for API endpoints that differ between localhost and deployed environments
 *
 * @param urls - Object containing URLs for different environments
 * @param urls.localUrl - URL to use for localhost
 * @param urls.prodUrl - URL to use for production/deployed environments
 * @param urls.devUrl - URL to use specifically for development environment
 */
export const getBaseUrl = (urls: { localUrl: string; prodUrl: string; devUrl: string }): string => {
  if (isLocalhost()) return urls.localUrl
  if (isDevelopment() && urls.devUrl) return urls.devUrl
  return urls.prodUrl
}
