import { useCallback, useEffect, useState } from 'react'
import { ThemeIcon } from '@navikt/aksel-icons'
import { Button, Tooltip } from '@navikt/ds-react'

function getInitialTheme(): 'light' | 'dark' {
  const storedTheme = localStorage.getItem('umami-theme') as 'light' | 'dark' | null
  if (storedTheme) return storedTheme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function ThemeButton() {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(getInitialTheme)

  const applyTheme = useCallback((newTheme: 'light' | 'dark') => {
    const root = document.documentElement
    const themeElement = document.querySelector('.aksel-theme')

    // Remove both classes first
    root.classList.remove('light', 'dark')
    if (themeElement) {
      themeElement.classList.remove('light', 'dark')
    }

    // Add the new theme class
    root.classList.add(newTheme)
    if (themeElement) {
      themeElement.classList.add(newTheme)
    }
  }, [])

  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [applyTheme, resolvedTheme])

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setResolvedTheme(newTheme)
    localStorage.setItem('umami-theme', newTheme)
    // Dispatch event so other components (like App.tsx) can sync
    window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }))
  }, [])

  return (
    <Tooltip content={resolvedTheme === 'dark' ? 'Endre til lyst tema' : 'Endre til mørkt tema'}>
      <Button
        variant="tertiary-neutral"
        icon={<ThemeIcon aria-hidden />}
        onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
        style={{ color: 'white' }}
        className="focus:!bg-blue-100 focus:!text-black"
      />
    </Tooltip>
  )
}

export { ThemeButton }
