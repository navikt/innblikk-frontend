import path from 'path'
import { fileURLToPath } from 'url'

import { createApp } from './src/server/app.js'
import { registerFrontend } from './src/server/frontend/serveFrontend.js'
import { createBigQueryClient } from './src/server/bigquery/client.js'
import { createBigQueryRouter } from './src/server/routes/bigquery/index.js'
import { createBackendProxyRouter } from './src/server/routes/backend/backendRoutes.js'
import { createSiteimproveProxyRouter } from './src/server/routes/siteimprove/siteimproveRoutes.js'
import { createUserRouter } from './src/server/routes/user/userRoutes.js'
import { authenticateUser } from './src/server/middleware/authenticateUser.js'

import {
  BIGQUERY_TIMEZONE,
  BACKEND_BASE_URL,
  SITEIMPROVE_BASE_URL,
  UMAMI_BASE_URL,
  GCP_PROJECT_ID,
} from './src/server/config/env.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const buildPath = path.resolve(__dirname, 'dist')

const app = createApp({ buildPath })

// Initialize BigQuery client
const bigquery = createBigQueryClient({ projectId: GCP_PROJECT_ID, dirname: __dirname })

// Apply authentication middleware to all /api/bigquery routes (except /api/user/me which has its own handling)
app.use('/api/bigquery', authenticateUser)

// Siteimprove proxy
app.use('/api/siteimprove', createSiteimproveProxyRouter({ SITEIMPROVE_BASE_URL }))

// User routes
app.use('/api/user', createUserRouter({ BACKEND_BASE_URL }))

// Backend proxy (Project/Dashboard/Graph/Query APIs)
app.use('/api/backend', createBackendProxyRouter({ BACKEND_BASE_URL }))

// BigQuery routes (router paths already include /api/bigquery)
app.use(createBigQueryRouter({ bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE }))

const CLICKMAP_PREVIEW_DEFAULT_URL = 'https://www.nav.no/aap'
const CLICKMAP_PREVIEW_ALLOWED_HOSTS = new Set(['nav.no'])

const isAllowedClickmapPreviewHost = (hostname) => {
  const normalizedHost = hostname.toLowerCase()
  return CLICKMAP_PREVIEW_ALLOWED_HOSTS.has(normalizedHost) || normalizedHost.endsWith('.nav.no')
}

const parseClickmapPreviewTargetUrl = (rawUrl) => {
  const input = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : CLICKMAP_PREVIEW_DEFAULT_URL
  const withProtocol = input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`
  const parsedUrl = new URL(withProtocol)

  if (!isAllowedClickmapPreviewHost(parsedUrl.hostname)) {
    throw new Error('Only nav.no domains are supported for clickmap preview rendering')
  }

  return parsedUrl
}

const rewriteRelativeAssets = (html, targetOrigin) => {
  let rewritten = html

  rewritten = rewritten.replace(/\s(href|src|action)=("|')\/(?!\/)([^"']*)\2/gi, (_match, attr, quote, path) => {
    return ` ${attr}=${quote}${targetOrigin}/${path}${quote}`
  })

  rewritten = rewritten.replace(/\ssrcset=(["'])([^"']*)\1/gi, (_match, quote, srcsetValue) => {
    const rewrittenSrcset = srcsetValue
      .split(',')
      .map((entry) => {
        const trimmed = entry.trim()
        if (!trimmed) return trimmed

        const [url, descriptor] = trimmed.split(/\s+/, 2)
        const rewrittenUrl = url.startsWith('/') && !url.startsWith('//') ? `${targetOrigin}${url}` : url

        return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl
      })
      .join(', ')

    return ` srcset=${quote}${rewrittenSrcset}${quote}`
  })

  return rewritten
}

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderClickmapPreviewInfoHtml = ({ title, description, reason, path = '', details = '' }) => {
  const payload = JSON.stringify({
    type: 'umami-clickmap-preview-error',
    reason,
    title,
    description,
    path,
    details,
  })

  return `<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #f5f5f5;
        color: #1f2937;
      }
      .wrap {
        max-width: 720px;
        margin: 48px auto;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 24px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 24px;
      }
      p {
        margin: 0 0 10px;
        line-height: 1.5;
      }
      .muted {
        color: #4b5563;
      }
      .code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px 12px;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      ${path ? `<p class="code">${escapeHtml(path)}</p>` : ''}
      ${details ? `<p class="muted">${escapeHtml(details)}</p>` : ''}
    </main>
    <script>
      window.parent.postMessage(${payload}, '*')
    </script>
  </body>
</html>`
}

const injectClickmapScript = (html) => {
  const sanitizedHtml = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
  const clickmapScript = `
<script>
(() => {
  const MESSAGE_TYPE = 'umami-clickmap-data'
  const LINK_CLICK_MESSAGE_TYPE = 'umami-clickmap-link-click'
  const LINK_BLOCKED_MESSAGE_TYPE = 'umami-clickmap-link-blocked'
  const UNSUPPORTED_CLICKMAP_PATH_PREFIXES = ['/oauth2/login']

  const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase()

  const normalizePath = (value) => {
    if (!value) return ''
    try {
      const resolved = new URL(value, window.location.href)
      const normalized = decodeURIComponent(resolved.pathname || '/')
      return normalized === '/' ? '/' : normalized.replace(/\\/+$/, '')
    } catch {
      return ''
    }
  }

  const isUnsupportedClickmapPath = (path) =>
    UNSUPPORTED_CLICKMAP_PATH_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?'),
    )

  const ensureStyle = () => {
    if (document.getElementById('umami-clickmap-style')) return
    const style = document.createElement('style')
    style.id = 'umami-clickmap-style'
    style.textContent = \`
      .umami-clickmap-hit {
        position: relative !important;
        border-radius: 3px;
        background-color: rgba(220, 38, 38, var(--umami-clickmap-alpha, 0.18)) !important;
        outline: 2px solid rgba(185, 28, 28, var(--umami-clickmap-alpha, 0.24)) !important;
        outline-offset: 1px;
      }
      .umami-clickmap-hit::after {
        content: attr(data-clickmap-count);
        position: absolute;
        top: 6px;
        right: 6px;
        min-width: 24px;
        height: 24px;
        padding: 0 7px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        line-height: 1;
        font-weight: 700;
        color: #fff;
        background: #7f1d1d;
        border: 2px solid rgba(255, 255, 255, 0.95);
        border-radius: 999px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
        z-index: 2147483647;
        pointer-events: none;
        font-family: Arial, sans-serif;
      }
    \`
    document.head.appendChild(style)
  }

  const clearCurrentHighlights = () => {
    document.querySelectorAll('.umami-clickmap-hit').forEach((node) => {
      node.classList.remove('umami-clickmap-hit')
      node.style.removeProperty('--umami-clickmap-alpha')
      node.removeAttribute('data-clickmap-count')
      node.removeAttribute('data-clickmap-note')
    })
  }

  const isAccordionComponent = (value) => value.includes('accordion') || value.includes('trekkspill')

  const getInteractiveCandidates = () => {
    const candidates = []
    const seen = new Set()

    const addCandidate = (element, kind) => {
      if (!element) return
      if (seen.has(element)) return
      seen.add(element)
      candidates.push({ element, kind })
    }

    Array.from(document.querySelectorAll('a[href]')).forEach((element) => addCandidate(element, 'link'))
    Array.from(document.querySelectorAll('button[aria-expanded], button[aria-controls], summary')).forEach((element) =>
      addCandidate(element, 'accordion'),
    )

    return candidates
  }

  const findBestMatch = (candidate, preparedItems) => {
    const elementText = cleanText(candidate.element.textContent || candidate.element.getAttribute('aria-label') || '')
    const elementPath =
      candidate.kind === 'link' ? normalizePath(candidate.element.getAttribute('href') || '') : ''
    let bestMatch = null
    let bestScore = -1

    for (const item of preparedItems) {
      const itemIsAccordion = isAccordionComponent(item.componentKey)
      if (itemIsAccordion && candidate.kind !== 'accordion') continue

      const textMatches = !!item.linkTextKey && item.linkTextKey === elementText
      const destinationMatches = candidate.kind === 'link' && !!item.destinationKey && item.destinationKey === elementPath
      if (!textMatches && !destinationMatches) continue

      const score =
        (destinationMatches ? 3 : 0) +
        (textMatches ? 1 : 0) +
        (itemIsAccordion && candidate.kind === 'accordion' ? 3 : 0) +
        (candidate.kind === 'link' ? 0.1 : 0)
      if (!bestMatch || score > bestScore || (score === bestScore && item.count > bestMatch.count)) {
        bestMatch = item
        bestScore = score
      }
    }

    return bestMatch
  }

  const applyHeatmap = (payload) => {
    ensureStyle()
    clearCurrentHighlights()

    const items = Array.isArray(payload?.items) ? payload.items : []
    const zeroBadgeLabel = typeof payload?.zeroBadgeLabel === 'string' ? payload.zeroBadgeLabel : '0'
    if (items.length === 0) {
      return
    }

    const preparedItems = items.map((item) => ({
      ...item,
      count: Number(item.count) || 0,
      linkTextKey: cleanText(item.linkText),
      destinationKey: normalizePath(item.destination),
      componentKey: cleanText(item.component),
    }))

    const maxCount = Math.max(...preparedItems.map((item) => item.count), 1)
    const candidates = getInteractiveCandidates()

    for (const candidate of candidates) {
      const match = findBestMatch(candidate, preparedItems)
      const hasMatch = !!match
      const alpha = hasMatch ? 0.14 + (match.count / maxCount) * 0.42 : 0.05

      candidate.element.classList.add('umami-clickmap-hit')
      candidate.element.style.setProperty('--umami-clickmap-alpha', String(alpha))
      candidate.element.setAttribute('data-clickmap-count', String(hasMatch ? match.badgeLabel || match.count : zeroBadgeLabel))

      if (!hasMatch) {
        candidate.element.setAttribute('data-clickmap-note', 'Ingen registrerte klikk')
        continue
      }

      candidate.element.setAttribute(
        'data-clickmap-note',
        [
          match.linkText ? 'Tekst: ' + match.linkText : '',
          match.destination ? 'Destinasjon: ' + match.destination : '',
          match.component ? 'Komponent: ' + match.component : '',
        ]
          .filter(Boolean)
          .join(' | '),
      )
    }

  }

  const isPlainLeftClick = (event) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

  const isAllowedPreviewLink = (url) => url.hostname === 'nav.no' || url.hostname.endsWith('.nav.no')

  document.addEventListener(
    'click',
    (event) => {
      if (!isPlainLeftClick(event) || event.defaultPrevented) return
      if (!(event.target instanceof Element)) return

      const link = event.target.closest('a[href]')
      if (!link) return
      if (link.getAttribute('target') === '_blank') return

      const href = link.getAttribute('href') || ''
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        return
      }

      try {
        const resolved = new URL(href, window.location.href)
        if (!isAllowedPreviewLink(resolved)) return
        const resolvedPath = normalizePath(resolved.pathname || '/')
        if (isUnsupportedClickmapPath(resolvedPath)) {
          event.preventDefault()
          window.parent.postMessage(
            {
              type: LINK_BLOCKED_MESSAGE_TYPE,
              reason: 'unsupported-private-page',
              path: resolvedPath,
              destination: resolved.toString(),
            },
            '*',
          )
          return
        }

        event.preventDefault()
        window.parent.postMessage(
          {
            type: LINK_CLICK_MESSAGE_TYPE,
            destination: resolved.toString(),
            path: resolvedPath,
            linkText: (link.textContent || link.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim(),
          },
          '*',
        )
      } catch {
        // Ignore invalid href values and allow browser default behavior
      }
    },
    true,
  )

  window.addEventListener('message', (event) => {
    if (event?.data?.type !== MESSAGE_TYPE) return
    applyHeatmap(event.data)
  })
})()
</script>
`

  return sanitizedHtml.includes('</body>')
    ? sanitizedHtml.replace('</body>', `${clickmapScript}</body>`)
    : `${sanitizedHtml}${clickmapScript}`
}

app.get('/api/clickmap-preview', async (req, res) => {
  try {
    const targetUrl = parseClickmapPreviewTargetUrl(req.query.url)
    const response = await fetch(targetUrl.toString())
    const rawBody = await response.text()
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    const rawBodyLower = rawBody.toLowerCase()
    const looksLikeJson =
      contentType.includes('application/json') || rawBody.trim().startsWith('{') || rawBody.trim().startsWith('[')
    const isUnauthenticatedResponse =
      response.status === 401 ||
      response.status === 403 ||
      rawBodyLower.includes('unauthenticated') ||
      rawBodyLower.includes('please log in')

    if (isUnauthenticatedResponse) {
      const infoHtml = renderClickmapPreviewInfoHtml({
        title: 'Siden krever innlogging',
        description: 'Klikk-kart kan foreløpig bare vise åpne sider.',
        reason: 'unauthenticated',
        path: targetUrl.pathname,
        details: 'Prøv en offentlig side for å se markeringene.',
      })
      res.status(200)
      res.type('text/html; charset=utf-8')
      res.send(infoHtml)
      return
    }

    if (!contentType.includes('text/html') && looksLikeJson) {
      const infoHtml = renderClickmapPreviewInfoHtml({
        title: 'Siden kan ikke vises i klikk-kart',
        description: 'Forhåndsvisningen støtter bare HTML-sider som kan vises offentlig.',
        reason: 'unsupported-content',
        path: targetUrl.pathname,
      })
      res.status(200)
      res.type('text/html; charset=utf-8')
      res.send(infoHtml)
      return
    }

    const rewrittenHtml = rewriteRelativeAssets(rawBody, targetUrl.origin)
    const hydratedHtml = injectClickmapScript(rewrittenHtml)

    res.status(response.status)
    res.type('text/html; charset=utf-8')
    res.send(hydratedHtml)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const statusCode = errorMessage.includes('Only nav.no domains are supported') ? 400 : 500
    console.error('Failed to fetch clickmap preview HTML:', error)
    res.status(statusCode).json({ error: 'Failed to fetch clickmap preview HTML', message: errorMessage })
  }
})

// Serve index.html with injected runtime config
registerFrontend(app, { buildPath, UMAMI_BASE_URL, GCP_PROJECT_ID })

const isProduction = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT) || (isProduction ? 8080 : 8081)

const server = app.listen(port, () => {
  console.log(`Listening on port ${port}`)
  console.log('Server timeout set to 2 minutes')
})

// Set server timeout to 2 minutes
server.timeout = 120000
server.keepAliveTimeout = 125000 // Slightly longer than timeout
server.headersTimeout = 130000 // Slightly longer than keepAliveTimeout
