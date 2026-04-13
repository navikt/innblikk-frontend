import express from 'express'

export function createClickmapPreviewRouter() {
  const router = express.Router()
  const CLICKMAP_PREVIEW_DEFAULT_URL = 'https://www.nav.no/'

  const parseClickmapPreviewTargetUrl = (rawUrl) => {
    const input = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : CLICKMAP_PREVIEW_DEFAULT_URL
    const withProtocol = input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`
    return new URL(withProtocol)
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
    const SCROLLMAP_SUMMARY_MESSAGE_TYPE = 'umami-scrollmap-summary'
    const FOCUS_LINK_MESSAGE_TYPE = 'umami-clickmap-focus-link'
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
        .umami-clickmap-hit-active {
          outline-width: 3px !important;
          outline-color: rgba(185, 28, 28, 0.95) !important;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.82), 0 0 0 6px rgba(220, 38, 38, 0.52) !important;
          background-color: rgba(220, 38, 38, 0.2) !important;
        }
        .umami-heatmap-hit-active::before {
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.82), 0 0 0 7px rgba(220, 38, 38, 0.5) !important;
        }
        .umami-scrollmap-overlay {
          position: absolute;
          left: 0;
          right: 0;
          pointer-events: auto;
          z-index: 2147483645;
        }
        .umami-scrollmap-band {
          position: absolute;
          left: 0;
          right: 0;
          border-top: 1px solid rgba(255, 255, 255, 0.72);
          border-bottom: 1px solid rgba(15, 23, 42, 0.22);
          box-sizing: border-box;
          pointer-events: none;
        }
        .umami-scrollmap-band-label {
          position: absolute;
          left: 10px;
          top: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.78);
          color: #fff;
          font-family: Arial, sans-serif;
          font-size: 14px;
          line-height: 1.15;
          font-weight: 700;
          letter-spacing: 0.01em;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
          pointer-events: auto;
          cursor: help;
        }
        .umami-scrollmap-median-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 0;
          border-top: 4px solid rgba(5, 150, 105, 0.96);
          z-index: 2147483646;
        }
        .umami-scrollmap-median-label {
          position: absolute;
          left: 10px;
          top: 10px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(5, 150, 105, 0.97);
          color: #fff;
          font-family: Arial, sans-serif;
          font-size: 13px;
          line-height: 1.15;
          font-weight: 700;
          letter-spacing: 0.01em;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
          pointer-events: auto;
          cursor: help;
          white-space: nowrap;
        }
      \`
      document.head.appendChild(style)
    }

    const clearFocusedHighlight = () => {
      document.querySelectorAll('.umami-clickmap-hit-active, .umami-heatmap-hit-active').forEach((node) => {
        node.classList.remove('umami-clickmap-hit-active')
        node.classList.remove('umami-heatmap-hit-active')
      })
    }

    const clearCurrentHighlights = () => {
      clearFocusedHighlight()
      document.querySelectorAll('.umami-scrollmap-overlay').forEach((node) => node.remove())
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
    const isTabComponent = (value) => value.includes('tab')
    const isButtonComponent = (value) =>
      value.includes('knapp') ||
      value.includes('button') ||
      value.includes('cta') ||
      value.includes('toggle') ||
      value.includes('switch')
    const isMenuComponent = (value) =>
      value.includes('meny') || value.includes('menu') || value.includes('dropdown') || value.includes('navigasjon')
    const isInternalNavigationComponent = (value) =>
      value.includes('intern-navigasjon') || value.includes('page-navigation')
    const isNavigationMenuLink = (element) =>
      !!element.closest('nav, .part__page-navigation-menu, [class*="PageNavigationMenu"], [class*="NavigationMenu"]')
    const isHeadingLink = (element) => !!element.closest('h1, h2, h3, h4, h5, h6')
    const isInPageHashLink = (element) => {
      const href = element.getAttribute('href') || ''
      return href.startsWith('#')
    }
    const getComponentIntent = (componentKey) => {
      if (!componentKey) return 'any'
      if (isAccordionComponent(componentKey)) return 'accordion'
      if (isTabComponent(componentKey)) return 'tab'
      if (isButtonComponent(componentKey)) return 'button'
      if (isMenuComponent(componentKey)) return 'menu'
      return 'any'
    }
    const candidateMatchesIntent = (candidateKind, intent) => {
      if (intent === 'accordion') return candidateKind === 'accordion'
      if (intent === 'tab') return candidateKind === 'tab'
      if (intent === 'button') return candidateKind === 'button' || candidateKind === 'menuitem'
      if (intent === 'menu') return candidateKind === 'menuitem' || candidateKind === 'link' || candidateKind === 'button'
      return true
    }
    const getAccordionText = (element) => {
      const section = element.closest(
        'section.navds-expansioncard, section[class*="expansioncard"], section[class*="Expandable_expandable"], section[aria-label]',
      )
      if (section) {
        const titleNode =
          section.querySelector(
            '[class*="Expandable_headerTitle"], .navds-expansioncard__header-content, .navds-expansioncard__header',
          ) || section
        const titleText = cleanText(titleNode.textContent || '')
        if (titleText) return titleText
        const sectionAria = cleanText(section.getAttribute('aria-label') || '')
        if (sectionAria) return sectionAria
      }

      const fallbackText = cleanText(element.textContent || element.getAttribute('aria-label') || '')
      return fallbackText
    }
    const getElementSectionKey = (element) => {
      const accordionSection = element.closest(
        'section.navds-expansioncard, section[class*="expansioncard"], section[class*="Expandable_expandable"], section[aria-label]',
      )
      if (accordionSection) {
        const titleNode =
          accordionSection.querySelector(
            '[class*="Expandable_headerTitle"], .navds-expansioncard__header-content, .navds-expansioncard__header',
          ) || accordionSection
        const title = cleanText(titleNode.textContent || '')
        if (title) return title
        const ariaLabel = cleanText(accordionSection.getAttribute('aria-label') || '')
        if (ariaLabel) return ariaLabel
      }

      const sectionContainer = element.closest('section, article, [role="region"]')
      if (sectionContainer) {
        const heading = sectionContainer.querySelector('h1, h2, h3, h4, h5, h6')
        const headingText = cleanText((heading && heading.textContent) || '')
        if (headingText) return headingText
        const ariaLabel = cleanText(sectionContainer.getAttribute('aria-label') || '')
        if (ariaLabel) return ariaLabel
      }

      return ''
    }
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
        if (kind === 'link' && isHeadingLink(element)) return
        if (kind === 'link' && isInPageHashLink(element) && !isNavigationMenuLink(element)) return
        seen.add(element)
        candidates.push({ element, kind, sectionKey: getElementSectionKey(element) })
      }
  
      Array.from(document.querySelectorAll('a[href]')).forEach((element) => addCandidate(element, 'link'))
      Array.from(document.querySelectorAll('button[aria-expanded], button[aria-controls], summary')).forEach((element) =>
        addCandidate(element, 'accordion'),
      )
      Array.from(
        document.querySelectorAll(
          'section.navds-expansioncard .navds-expansioncard__header, section[class*="expansioncard"] .navds-expansioncard__header, section[class*="Expandable_expandable"] [class*="Expandable_header"], section[class*="Expandable_expandable"] [class*="Expandable_headerTitle"]',
        ),
      ).forEach((element) => addCandidate(element, 'accordion'))
      Array.from(
        document.querySelectorAll(
          'button:not([aria-expanded]):not([aria-controls]), [role="button"]:not([aria-expanded]):not([aria-controls]), input[type="button"], input[type="submit"]',
        ),
      ).forEach((element) => addCandidate(element, 'button'))
      Array.from(document.querySelectorAll('[role="tab"], button[role="tab"], [aria-selected][aria-controls]')).forEach(
        (element) => addCandidate(element, 'tab'),
      )
      Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], [role="switch"], [role="checkbox"]')).forEach(
        (element) => addCandidate(element, 'menuitem'),
      )
  
      return candidates
    }

    const getMatchScore = (candidate, item) => {
      const elementText =
        candidate.kind === 'accordion'
          ? getAccordionText(candidate.element)
          : cleanText(candidate.element.textContent || candidate.element.getAttribute('aria-label') || '')
      const elementDestination = candidate.kind === 'link' ? normalizeDestination(candidate.element.getAttribute('href') || '') : null
      const itemIntent = getComponentIntent(item.componentKey)
      const itemIsAccordion = itemIntent === 'accordion'
      const itemIsInternalNavigation = isInternalNavigationComponent(item.componentKey)
      const matchesIntent = candidateMatchesIntent(candidate.kind, itemIntent)
      if (itemIsAccordion && candidate.kind !== 'accordion') return -1
      if (candidate.kind === 'link' && isHeadingLink(candidate.element)) return -1
      if (candidate.kind === 'link' && isInPageHashLink(candidate.element) && !isNavigationMenuLink(candidate.element)) return -1
      if (itemIsInternalNavigation && candidate.kind === 'link' && !isNavigationMenuLink(candidate.element)) return -1

      const textExactMatch = !!item.linkTextKey && item.linkTextKey === elementText
      const textContainsMatch =
        !!item.linkTextKey && !textExactMatch && (elementText.includes(item.linkTextKey) || item.linkTextKey.includes(elementText))
      const textMatches = textExactMatch || textContainsMatch
      const sectionExactMatch = !!item.sectionKey && item.sectionKey === candidate.sectionKey
      const sectionContainsMatch =
        !!item.sectionKey &&
        !sectionExactMatch &&
        (item.sectionKey.includes(candidate.sectionKey) || candidate.sectionKey.includes(item.sectionKey))
      const destinationMatches =
        candidate.kind === 'link' &&
        !!elementDestination &&
        (item.destinationHasHost
          ? !!item.destinationFullKey && item.destinationFullKey === elementDestination.full
          : !!item.destinationPathKey && item.destinationPathKey === elementDestination.path)
      if (itemIntent !== 'any' && !destinationMatches && !matchesIntent) return -1
      if (!textMatches && !destinationMatches) return -1

      return (
        (destinationMatches ? 3 : 0) +
        (sectionExactMatch ? 4 : sectionContainsMatch ? 1 : 0) +
        (textExactMatch ? 2 : textContainsMatch ? 1 : 0) +
        (matchesIntent ? 2 : 0) +
        (itemIsAccordion && candidate.kind === 'accordion' ? 2 : 0) +
        (candidate.kind === 'link' ? 0.1 : 0)
      )
    }

    const findBestMatch = (candidate, preparedItems) => {
      let bestMatch = null
      let bestScore = -1
      for (const item of preparedItems) {
        const score = getMatchScore(candidate, item)
        if (score < 0) continue
        if (!bestMatch || score > bestScore || (score === bestScore && item.count > bestMatch.count)) {
          bestMatch = item
          bestScore = score
        }
      }
  
      return bestMatch
    }

    const assignPreparedItemsToCandidates = (preparedItems, candidates) => {
      const assignments = []

      for (const item of preparedItems) {
        if ((item.count || 0) <= 0) continue
        let bestCandidate = null
        let bestScore = -1

        for (const candidate of candidates) {
          const score = getMatchScore(candidate, item)
          if (score < 0) continue
          if (!bestCandidate || score > bestScore) {
            bestCandidate = candidate
            bestScore = score
          }
        }

        if (bestCandidate) {
          assignments.push({ item, candidate: bestCandidate })
        }
      }

      return assignments
    }
  
    const applyHeatmap = (payload) => {
      ensureStyle()
      clearCurrentHighlights()
  
      const viewMode =
        payload?.viewMode === 'heatmap' ? 'heatmap' : payload?.viewMode === 'scrollmap' ? 'scrollmap' : 'clickmap'
      const items = Array.isArray(payload?.items) ? payload.items : []
      const zeroBadgeLabel = typeof payload?.zeroBadgeLabel === 'string' ? payload.zeroBadgeLabel : '0'
      const includeUnmatched = payload?.includeUnmatched !== false
      if (items.length === 0) {
        return
      }
  
      const preparedItems = items
        .map((item) => {
          const destinationMeta = normalizeDestination(item.destination)
          return {
            ...item,
            count: Number(item.count) || 0,
            linkTextKey: cleanText(item.linkText),
            sectionKey: cleanText(item.section),
            destinationPathKey: destinationMeta.path,
            destinationFullKey: destinationMeta.full,
            destinationHasHost: destinationMeta.hasHost,
            componentKey: cleanText(item.component),
          }
        })
        .filter((item) => includeUnmatched || item.count > 0)
  
      const maxCount = Math.max(...preparedItems.map((item) => item.count), 1)
      const candidates = getInteractiveCandidates()
      const resolveDocumentHeight = () =>
        Math.max(
          document.documentElement?.scrollHeight || 0,
          document.body?.scrollHeight || 0,
          document.documentElement?.offsetHeight || 0,
          document.body?.offsetHeight || 0,
          window.innerHeight || 0,
        )

      const renderScrollmap = () => {
        const bins = 10
        const binWeights = new Array(bins).fill(0)
        const binCategoryCounts = Array.from({ length: bins }, () => ({
          linkClicks: 0,
          accordionClicks: 0,
          otherClicks: 0,
        }))
        const documentHeight = Math.max(resolveDocumentHeight(), 1)
        const foldRatio = Math.min(1, Math.max(0, window.innerHeight / documentHeight))

        const assignments = assignPreparedItemsToCandidates(preparedItems, candidates)
        for (const assignment of assignments) {
          const match = assignment.item
          const candidate = assignment.candidate
          const rect = candidate.element.getBoundingClientRect()
          const elementCenterY = window.scrollY + rect.top + rect.height / 2
          const normalizedDepth = Math.min(1, Math.max(0, elementCenterY / documentHeight))
          const binIndex = Math.min(bins - 1, Math.floor(normalizedDepth * bins))
          binWeights[binIndex] += match.count

          const categoryBucket = binCategoryCounts[binIndex]
          if (candidate.kind === 'accordion') {
            categoryBucket.accordionClicks += match.count
          } else if (candidate.kind === 'link') {
            categoryBucket.linkClicks += match.count
          } else {
            categoryBucket.otherClicks += match.count
          }
        }

        const totalWeightedClicks = binWeights.reduce((sum, value) => sum + value, 0)
        if (totalWeightedClicks <= 0) {
          window.parent.postMessage(
            {
              type: SCROLLMAP_SUMMARY_MESSAGE_TYPE,
              breakpoints: [],
              totalEstimatedClicks: 0,
              medianDepthPercent: 0,
            },
            '*',
          )
          return
        }

        const estimatedReachByBand = new Array(bins).fill(0)
        let running = 0
        for (let index = bins - 1; index >= 0; index -= 1) {
          running += binWeights[index]
          estimatedReachByBand[index] = running / totalWeightedClicks
        }

        let medianDepthPercent = 100
        let previousDepthPercent = 0
        let previousReachRatio = 1
        for (let index = 0; index < bins; index += 1) {
          const depthPercent = (index / bins) * 100
          const reachRatio = estimatedReachByBand[index]
          if (reachRatio <= 0.5) {
            const deltaReach = previousReachRatio - reachRatio
            if (deltaReach > 0) {
              const interpolationFactor = (previousReachRatio - 0.5) / deltaReach
              medianDepthPercent = previousDepthPercent + (depthPercent - previousDepthPercent) * interpolationFactor
            } else {
              medianDepthPercent = depthPercent
            }
            break
          }
          previousDepthPercent = depthPercent
          previousReachRatio = reachRatio
        }
        const effectiveMedianDepthPercent = Math.max(foldRatio * 100, Math.min(100, medianDepthPercent))

        const overlay = document.createElement('div')
        overlay.className = 'umami-scrollmap-overlay'
        overlay.style.top = '0'
        overlay.style.height = String(documentHeight) + 'px'
        overlay.setAttribute('aria-hidden', 'true')

        for (let index = 0; index < bins; index += 1) {
          const band = document.createElement('div')
          const bandTopPercent = (index / bins) * 100
          const bandHeightPercent = 100 / bins
          const estimatedReach = estimatedReachByBand[index]
          const alpha = 0.07 + estimatedReach * 0.4
          band.className = 'umami-scrollmap-band'
          band.style.top = String(bandTopPercent) + '%'
          band.style.height = String(bandHeightPercent) + '%'
          band.style.backgroundColor = 'rgba(185, 28, 28, ' + alpha.toFixed(3) + ')'
          if (index % 2 === 0) {
            band.style.backgroundImage =
              'repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0 8px, rgba(255, 255, 255, 0.08) 8px 16px)'
          }
          if (index > 0) {
            band.style.borderTopWidth = '2px'
          }

          const startDepth = index * 10
          const endDepth = (index + 1) * 10
          const label = document.createElement('span')
          label.className = 'umami-scrollmap-band-label'
          const reachedPercent = Math.round(estimatedReach * 100)
          label.textContent = 'Dybde ' + startDepth + '-' + endDepth + '% · Estimert nådd: ' + reachedPercent + '%'
          label.title =
            'Estimert andel som nådde minst dette dybdeområdet basert på klikkplasseringer, ikke faktisk målt scroll.'
          label.setAttribute('aria-label', label.textContent || '')
          band.appendChild(label)

          overlay.appendChild(band)
        }

        if (document.body) {
          document.body.appendChild(overlay)
        }

        const medianMarker = document.createElement('div')
        medianMarker.className = 'umami-scrollmap-median-line'
        medianMarker.style.top = effectiveMedianDepthPercent.toFixed(2) + '%'

        const medianLabel = document.createElement('span')
        medianLabel.className = 'umami-scrollmap-median-label'
        medianLabel.textContent = 'Median dybde (halvparten når hit): ' + effectiveMedianDepthPercent.toFixed(1) + '%'
        medianLabel.title =
          'Median dybde er nivået der omtrent halvparten er estimert å ha nådd minst dette punktet.'
        medianLabel.setAttribute('aria-label', medianLabel.textContent || '')
        medianMarker.appendChild(medianLabel)
        overlay.appendChild(medianMarker)

        const summaryBreakpoints = [10, 25, 50, 75, 90].map((breakpoint) => {
          const breakpointIndex = Math.min(bins - 1, Math.floor((breakpoint / 100) * bins))
          const reachRatio = estimatedReachByBand[breakpointIndex] || 0
          const categories = binCategoryCounts.slice(breakpointIndex).reduce(
            (acc, current) => ({
              linkClicks: acc.linkClicks + current.linkClicks,
              accordionClicks: acc.accordionClicks + current.accordionClicks,
              otherClicks: acc.otherClicks + current.otherClicks,
            }),
            { linkClicks: 0, accordionClicks: 0, otherClicks: 0 },
          )
          return {
            depthPercent: breakpoint,
            estimatedReachRatio: reachRatio,
            estimatedReachPercent: Math.round(reachRatio * 1000) / 10,
            estimatedClicksReached: Math.round(totalWeightedClicks * reachRatio),
            categoryCounts: {
              linkClicks: categories.linkClicks,
              accordionClicks: categories.accordionClicks,
              otherClicks: categories.otherClicks,
            },
          }
        })

        window.parent.postMessage(
          {
            type: SCROLLMAP_SUMMARY_MESSAGE_TYPE,
            breakpoints: summaryBreakpoints,
            totalEstimatedClicks: totalWeightedClicks,
            medianDepthPercent: Math.round(effectiveMedianDepthPercent * 10) / 10,
          },
          '*',
        )
      }

      if (viewMode === 'scrollmap') {
        renderScrollmap()
        return
      }

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
        if (viewMode === 'clickmap' && !hasMatch && !includeUnmatched) continue
        if (viewMode === 'clickmap' && hasMatch && !includeUnmatched && (match.count || 0) <= 0) continue

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

    const focusOnItem = (payload) => {
      const destinationMeta = normalizeDestination(payload?.destination || '')
      const target = {
        destinationPathKey: destinationMeta.path,
        destinationFullKey: destinationMeta.full,
        destinationHasHost: destinationMeta.hasHost,
        linkTextKey: cleanText(payload?.linkText || ''),
        sectionKey: cleanText(payload?.section || ''),
        componentKey: cleanText(payload?.component || ''),
      }
      const targetIntent = getComponentIntent(target.componentKey)
      const targetIsAccordion = targetIntent === 'accordion'
      const targetIsInternalNavigation = isInternalNavigationComponent(target.componentKey)
      const candidates = getInteractiveCandidates()
      let bestElement = null
      let bestScore = -1

      for (const candidate of candidates) {
        const matchesIntent = candidateMatchesIntent(candidate.kind, targetIntent)
        if (targetIsAccordion && candidate.kind !== 'accordion') continue
        if (candidate.kind === 'link' && isHeadingLink(candidate.element)) continue
        if (candidate.kind === 'link' && isInPageHashLink(candidate.element) && !isNavigationMenuLink(candidate.element))
          continue
        if (targetIsInternalNavigation && candidate.kind === 'link' && !isNavigationMenuLink(candidate.element)) continue

        const elementText =
          candidate.kind === 'accordion'
            ? getAccordionText(candidate.element)
            : cleanText(candidate.element.textContent || candidate.element.getAttribute('aria-label') || '')
        const textExact = !!target.linkTextKey && target.linkTextKey === elementText
        const textContains =
          !!target.linkTextKey &&
          !textExact &&
          (target.linkTextKey.includes(elementText) || elementText.includes(target.linkTextKey))
        const sectionExact = !!target.sectionKey && target.sectionKey === candidate.sectionKey
        const sectionContains =
          !!target.sectionKey &&
          !sectionExact &&
          (target.sectionKey.includes(candidate.sectionKey) || candidate.sectionKey.includes(target.sectionKey))
        const destinationMetaForElement =
          candidate.kind === 'link' ? normalizeDestination(candidate.element.getAttribute('href') || '') : null
        const destinationMatches =
          candidate.kind === 'link' &&
          !!destinationMetaForElement &&
          (target.destinationHasHost
            ? !!target.destinationFullKey && target.destinationFullKey === destinationMetaForElement.full
            : !!target.destinationPathKey && target.destinationPathKey === destinationMetaForElement.path)

        if (!destinationMatches && targetIntent !== 'any' && !matchesIntent) continue
        if (!destinationMatches && !textExact && !textContains && !targetIsAccordion) continue
        if (
          !destinationMatches &&
          !textExact &&
          !textContains &&
          targetIsAccordion &&
          candidate.kind !== 'accordion'
        )
          continue

        const score =
          (destinationMatches ? 6 : 0) +
          (sectionExact ? 4 : sectionContains ? 1 : 0) +
          (textExact ? 4 : textContains ? 2 : 0) +
          (matchesIntent ? 2 : 0) +
          (targetIsAccordion && candidate.kind === 'accordion' ? 2 : 0) +
          (candidate.element.classList.contains('umami-clickmap-hit') || candidate.element.classList.contains('umami-heatmap-hit')
            ? 1
            : 0)

        if (score > bestScore) {
          bestScore = score
          bestElement = candidate.element
        }
      }

      if (!bestElement || bestScore < 2) return

      clearFocusedHighlight()
      bestElement.classList.add(bestElement.classList.contains('umami-heatmap-hit') ? 'umami-heatmap-hit-active' : 'umami-clickmap-hit-active')

      const rect = bestElement.getBoundingClientRect()
      const targetTop = Math.max(0, rect.top + window.scrollY - window.innerHeight * 0.35)
      window.scrollTo({ top: targetTop, behavior: 'smooth' })
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
      if (event?.data?.type === MESSAGE_TYPE) {
        applyHeatmap(event.data)
        return
      }
      if (event?.data?.type === FOCUS_LINK_MESSAGE_TYPE) {
        focusOnItem(event.data)
      }
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
      const statusCode = 500
      console.error('Failed to fetch clickmap preview HTML:', error)
      res.status(statusCode).json({ error: 'Failed to fetch clickmap preview HTML', message: errorMessage })
    }
  })

  return router
}
