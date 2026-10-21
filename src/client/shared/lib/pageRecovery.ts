const recoveryKey = `innblikk:page-recovery:${__GIT_SHA__}`

export function isPageLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk|Unable to preload CSS/i.test(
    error.message,
  )
}

export function tryReloadPage(reload: () => void = () => window.location.reload()): boolean {
  try {
    if (window.sessionStorage.getItem(recoveryKey)) return false
    window.sessionStorage.setItem(recoveryKey, 'attempted')
    reload()
    return true
  } catch {
    return false
  }
}
