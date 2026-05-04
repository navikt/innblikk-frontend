export const getUrlPath = (urlString: string) => {
  try {
    const url = new URL(urlString)
    return url.pathname + url.search + url.hash
  } catch {
    return urlString
  }
}
