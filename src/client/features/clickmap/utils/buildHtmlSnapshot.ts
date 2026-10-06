export const buildHtmlSnapshot = (html: string, pageUrl: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script, iframe, frame, frameset, object, embed, base, meta').forEach((element) => {
    element.remove()
  })
  document.querySelectorAll('link').forEach((element) => {
    if (element.rel.toLowerCase() !== 'stylesheet') element.remove()
    else element.crossOrigin = 'anonymous'
  })
  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name)
    }
  })

  const base = document.createElement('base')
  base.href = pageUrl
  const policy = document.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content =
    "default-src 'none'; script-src 'none'; style-src https: 'unsafe-inline'; img-src https: data:; font-src https: data:; form-action 'none'; base-uri https: http:"
  const referrer = document.createElement('meta')
  referrer.name = 'referrer'
  referrer.content = 'no-referrer'
  document.head.prepend(policy, referrer, base)

  return `<!doctype html>\n${document.documentElement.outerHTML}`
}

export const fetchHtmlSnapshot = async (pageUrl: string, signal: AbortSignal): Promise<string> => {
  const target = new URL(pageUrl)
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Unsupported preview URL')
  const response = await fetch(target.toString(), {
    mode: 'cors',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Page is not readable HTML')
  }
  const html = await response.text()
  if (!html.trim()) throw new Error('Page is empty')
  const snapshot = buildHtmlSnapshot(html, response.url || target.toString())
  const document = new DOMParser().parseFromString(snapshot, 'text/html')
  if (
    !document.body.textContent?.trim() &&
    !document.body.querySelector('img, svg, canvas, video, input, button, textarea, select')
  ) {
    throw new Error('Page has no static content')
  }
  return snapshot
}
