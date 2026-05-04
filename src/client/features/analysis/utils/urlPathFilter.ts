export const formatPathLabel = (path: string): string => (path === '/' ? '/ (forsiden)' : path)

export const parseFormattedPath = (path: string): string => (path === '/ (forsiden)' ? '/' : path)

export const hasMultipleValues = (input: string): boolean => /[\n,;]/.test(input)

export const parseMultipleUrls = (
  input: string,
  selectedWebsiteDomain: string | undefined,
  normalizeDomain: (d: string) => string,
): { paths: string[]; invalid: string[] } => {
  const rawLines = input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const paths: string[] = []
  const invalid: string[] = []
  const currentDomain = selectedWebsiteDomain ? normalizeDomain(selectedWebsiteDomain) : null

  rawLines.forEach((line) => {
    if (line.match(/^https?:\/\//)) {
      try {
        const url = new URL(line)
        if (currentDomain) {
          const lineDomain = normalizeDomain(url.hostname)
          if (lineDomain !== currentDomain && !lineDomain.endsWith('.' + currentDomain)) {
            invalid.push(line)
            return
          }
        }
        paths.push(decodeURIComponent(url.pathname))
      } catch {
        invalid.push(line)
      }
    } else {
      let path = line
      const queryIndex = path.indexOf('?')
      if (queryIndex !== -1) {
        path = path.substring(0, queryIndex)
      }
      path = path.startsWith('/') ? path : '/' + path
      paths.push(path)
    }
  })

  return { paths, invalid }
}
