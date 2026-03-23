import { useCallback, useEffect, useState } from 'react'
import { ThemeIcon } from '@navikt/aksel-icons'
import { Button, Tooltip } from '@navikt/ds-react'

function ThemeButton() {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const [isMounted, setIsMounted] = useState(false)

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
    setIsMounted(true)

    // Check system preference and localStorage
    const storedTheme = localStorage.getItem('umami-theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light')
    setResolvedTheme(initialTheme)
    applyTheme(initialTheme)
  }, [applyTheme])

  const setTheme = useCallback(
    (newTheme: 'light' | 'dark') => {
      setResolvedTheme(newTheme)
      localStorage.setItem('umami-theme', newTheme)
      applyTheme(newTheme)
      // Dispatch event so other components (like App.tsx) can sync
      window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }))
    },
    [applyTheme],
  )

  return (
    <Tooltip content={isMounted && resolvedTheme === 'dark' ? 'Endre til lyst tema' : 'Endre til mørkt tema'}>
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
