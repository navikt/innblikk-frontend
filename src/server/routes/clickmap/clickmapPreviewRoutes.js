import express from 'express'

export function createClickmapPreviewRouter() {
  const router = express.Router()
  const CLICKMAP_PREVIEW_DEFAULT_URL = 'https://www.nav.no/'
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
  
    const hasExplicitHost = (value) => {
      if (!value || typeof value !== 'string') return false
      const trimmed = value.trim()
      return /^[a-z][a-z\\d+.-]*:\\/\\//i.test(trimmed) || trimmed.startsWith('//')
    }
  
    const normalizeDestination = (value) => {
      if (!value) return { path: '', host: '', full: '', hasHost: false }
      try {
        const resolved = new URL(value, window.location.href)
        const normalizedPath = decodeURIComponent(resolved.pathname || '/')
        const path = normalizedPath === '/' ? '/' : normalizedPath.replace(/\\/+$/, '')
        const host = (resolved.hostname || '').toLowerCase()
        return {
          path,
          host,
          full: host ? host + path : path,
          hasHost: hasExplicitHost(value),
        }
      } catch {
        return { path: '', host: '', full: '', hasHost: false }
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
        .umami-heatmap-hit {
          position: relative !important;
          outline: none !important;
          box-shadow: none !important;
          overflow: visible !important;
          background: transparent !important;
          isolation: isolate;
        }
        .umami-heatmap-hit::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: var(--umami-heat-size, 170px);
          height: var(--umami-heat-size, 170px);
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: radial-gradient(
            circle,
            rgba(127, 29, 29, var(--umami-heat-opacity, 0.95)) 0%,
            rgba(220, 38, 38, calc(var(--umami-heat-opacity, 0.95) * 0.96)) 18%,
            rgba(249, 115, 22, calc(var(--umami-heat-opacity, 0.95) * 0.88)) 34%,
            rgba(250, 204, 21, calc(var(--umami-heat-opacity, 0.95) * 0.76)) 50%,
            rgba(163, 230, 53, calc(var(--umami-heat-opacity, 0.95) * 0.58)) 66%,
            rgba(56, 189, 248, calc(var(--umami-heat-opacity, 0.95) * 0.44)) 82%,
            rgba(37, 99, 235, 0) 100%
          );
          filter: saturate(1.28) contrast(1.14) blur(var(--umami-heat-blur, 13px));
          opacity: var(--umami-heat-opacity, 0.93);
          mix-blend-mode: normal;
          z-index: 2147483646;
          pointer-events: auto;
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
        .umami-clickmap-tooltip {
          position: fixed;
          left: 0;
          top: 0;
          z-index: 2147483647;
          max-width: min(92vw, 460px);
          padding: 14px 16px;
          border-radius: 12px;
          border: 2px solid rgba(255, 255, 255, 0.65);
          background: rgba(15, 23, 42, 0.94);
          color: #ffffff;
          font-family: Arial, sans-serif;
          font-size: clamp(18px, 1.4vw, 24px);
          line-height: 1.25;
          font-weight: 700;
          white-space: pre-line;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.38);
          pointer-events: none;
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 80ms linear, transform 80ms linear;
        }
        .umami-clickmap-tooltip[data-visible='true'] {
          opacity: 1;
          transform: translateY(0);
        }
      \`
      document.head.appendChild(style)
    }
  
    const clearCurrentHighlights = () => {
      document.querySelectorAll('.umami-clickmap-hit, .umami-heatmap-hit').forEach((node) => {
        node.classList.remove('umami-clickmap-hit')
        node.classList.remove('umami-heatmap-hit')
        node.style.removeProperty('--umami-clickmap-alpha')
        node.style.removeProperty('--umami-heat-size')
        node.style.removeProperty('--umami-heat-opacity')
        node.style.removeProperty('--umami-heat-blur')
        node.removeAttribute('data-clickmap-count')
        node.removeAttribute('data-clickmap-note')
        node.removeAttribute('data-clickmap-tooltip')
        node.removeAttribute('data-clickmap-view')
        node.removeAttribute('title')
      })
    }
  
    const isAccordionComponent = (value) => value.includes('accordion') || value.includes('trekkspill')
    const isHeaderLikeElement = (element) =>
      !!element.closest(
        'header, nav, [role="banner"], #decorator-header, .decorator-header, [class*="dekorator"], [class*="decorator"]',
      )
  
    const getHeatmapTuning = (element, rawStrength) => {
      const rect = element.getBoundingClientRect()
      const computedStyle = window.getComputedStyle(element)
      const area = Math.max(1, rect.width * rect.height)
      const areaScale = Math.min(1.12, Math.max(0.72, Math.sqrt(area) / 140))
  
      const isStickyOrFixed = computedStyle.position === 'sticky' || computedStyle.position === 'fixed'
      const isTopZone = rect.top < 120
      const isHeaderElement = isHeaderLikeElement(element)
  
      let strength = Math.min(1, Math.max(0, rawStrength))
      let sizeScale = areaScale
      let opacityScale = 1
      let blurBoost = 0
  
      if (isStickyOrFixed || isHeaderElement || isTopZone) {
        const highTrafficHeader = strength >= 0.82
        strength *= highTrafficHeader ? 0.98 : 0.86
        sizeScale *= 0.62
        opacityScale *= highTrafficHeader ? 0.96 : 0.88
        blurBoost += 1
      }
  
      return { strength, sizeScale, opacityScale, blurBoost }
    }
  
    let tooltipNode = null
  
    const ensureTooltipNode = () => {
      if (tooltipNode) return tooltipNode
      tooltipNode = document.createElement('div')
      tooltipNode.className = 'umami-clickmap-tooltip'
      tooltipNode.setAttribute('aria-hidden', 'true')
      document.body.appendChild(tooltipNode)
      return tooltipNode
    }
  
    const hideTooltip = () => {
      if (!tooltipNode) return
      tooltipNode.dataset.visible = 'false'
    }
  
    const showTooltip = (tooltipText, clientX, clientY) => {
      if (!tooltipText) {
        hideTooltip()
        return
      }
  
      const node = ensureTooltipNode()
      if (node.textContent !== tooltipText) {
        node.textContent = tooltipText
      }
  
      node.dataset.visible = 'true'
      const viewportPadding = 14
      const pointerOffsetX = 18
      const pointerOffsetY = 20
      const { width, height } = node.getBoundingClientRect()
  
      let left = clientX + pointerOffsetX
      let top = clientY + pointerOffsetY
  
      if (left + width + viewportPadding > window.innerWidth) {
        left = Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
      }
      if (top + height + viewportPadding > window.innerHeight) {
        top = Math.max(viewportPadding, clientY - height - 12)
      }
  
      node.style.left = String(left) + 'px'
      node.style.top = String(top) + 'px'
    }
  
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
      const elementDestination = candidate.kind === 'link' ? normalizeDestination(candidate.element.getAttribute('href') || '') : null
      let bestMatch = null
      let bestScore = -1
  
      for (const item of preparedItems) {
        const itemIsAccordion = isAccordionComponent(item.componentKey)
        if (itemIsAccordion && candidate.kind !== 'accordion') continue
  
        const textMatches = !!item.linkTextKey && item.linkTextKey === elementText
        const destinationMatches =
          candidate.kind === 'link' &&
          !!elementDestination &&
          (item.destinationHasHost
            ? !!item.destinationFullKey && item.destinationFullKey === elementDestination.full
            : !!item.destinationPathKey && item.destinationPathKey === elementDestination.path)
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
  
      const viewMode = payload?.viewMode === 'heatmap' ? 'heatmap' : 'clickmap'
      const items = Array.isArray(payload?.items) ? payload.items : []
      const zeroBadgeLabel = typeof payload?.zeroBadgeLabel === 'string' ? payload.zeroBadgeLabel : '0'
      if (items.length === 0) {
        return
      }
  
      const preparedItems = items.map((item) => {
        const destinationMeta = normalizeDestination(item.destination)
        return {
          ...item,
          count: Number(item.count) || 0,
          linkTextKey: cleanText(item.linkText),
          destinationPathKey: destinationMeta.path,
          destinationFullKey: destinationMeta.full,
          destinationHasHost: destinationMeta.hasHost,
          componentKey: cleanText(item.component),
        }
      })
  
      const maxCount = Math.max(...preparedItems.map((item) => item.count), 1)
      const candidates = getInteractiveCandidates()
      const buildTooltipText = (match) => {
        if (!match) return 'Klikk: 0\\nAndel: 0,0%'
        const countText = match.countLabel || String(match.count || 0)
        const percentText = match.percentLabel || '0,0%'
        return 'Klikk: ' + countText + '\\nAndel: ' + percentText
      }
  
      for (const candidate of candidates) {
        const match = findBestMatch(candidate, preparedItems)
        const hasMatch = !!match
        if (viewMode === 'heatmap' && !hasMatch) continue
  
        if (viewMode === 'heatmap' && hasMatch) {
          candidate.element.classList.add('umami-heatmap-hit')
          const rawStrength = Math.pow(match.count / maxCount, 0.42)
          const { strength, sizeScale, opacityScale, blurBoost } = getHeatmapTuning(candidate.element, rawStrength)
          const heatSize = Math.round((140 + strength * 190) * sizeScale)
          const heatOpacity = (Math.min(0.92, 0.56 + strength * 0.36) * opacityScale).toFixed(3)
          const heatBlur = String(Math.round(10 + (1 - strength) * 5 + blurBoost)) + 'px'
          candidate.element.style.setProperty('--umami-heat-size', String(heatSize) + 'px')
          candidate.element.style.setProperty('--umami-heat-opacity', heatOpacity)
          candidate.element.style.setProperty('--umami-heat-blur', heatBlur)
          const tooltipText = buildTooltipText(match)
          candidate.element.removeAttribute('data-clickmap-count')
          candidate.element.removeAttribute('data-clickmap-view')
          candidate.element.setAttribute('data-clickmap-tooltip', tooltipText)
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
          continue
        }
  
        const alpha = hasMatch ? 0.14 + (match.count / maxCount) * 0.42 : 0.05
        candidate.element.classList.add('umami-clickmap-hit')
        candidate.element.style.setProperty('--umami-clickmap-alpha', String(alpha))
        candidate.element.setAttribute('data-clickmap-view', viewMode)
        candidate.element.setAttribute('data-clickmap-count', String(hasMatch ? match.badgeLabel || match.count : zeroBadgeLabel))
        const tooltipText = buildTooltipText(match)
        candidate.element.setAttribute('data-clickmap-tooltip', tooltipText)
  
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
      'mousemove',
      (event) => {
        if (!(event.target instanceof Element)) {
          hideTooltip()
          return
        }
  
        const highlightedElement = event.target.closest('.umami-clickmap-hit, .umami-heatmap-hit')
        if (!highlightedElement) {
          hideTooltip()
          return
        }
  
        const tooltipText = highlightedElement.getAttribute('data-clickmap-tooltip') || ''
        if (!tooltipText) {
          hideTooltip()
          return
        }
  
        showTooltip(tooltipText, event.clientX, event.clientY)
      },
      true,
    )
  
    document.addEventListener(
      'mouseout',
      (event) => {
        if (!event.relatedTarget) {
          hideTooltip()
        }
      },
      true,
    )
  
    document.addEventListener(
      'scroll',
      () => {
        hideTooltip()
      },
      true,
    )
    window.addEventListener('blur', hideTooltip)
  
    document.addEventListener(
      'click',
      (event) => {
        hideTooltip()
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

  router.get('/clickmap-preview', async (req, res) => {
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

  return router
}
