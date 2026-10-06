const isLoginUrl = (url) =>
  url.hostname === 'auth0.com' ||
  url.hostname.endsWith('.auth0.com') ||
  url.hostname === 'login.microsoftonline.com' ||
  /\/(?:oauth2?\/(?:login|authorize)|auth\/(?:login|authorize)|login|signin)(?:\/|$)/i.test(url.pathname)

export const fetchPreviewResponse = async (targetUrl) => {
  let currentUrl = new URL(targetUrl)
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    if (isLoginUrl(currentUrl)) return new Response('', { status: 401 })
    const response = await fetch(currentUrl.toString(), { redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    await response.body?.cancel()
    currentUrl = new URL(location, currentUrl)
  }
  throw new Error('Too many preview redirects')
}
