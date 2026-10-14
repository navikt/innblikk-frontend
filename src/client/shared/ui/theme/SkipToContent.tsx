export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-[var(--ax-bg-default)] focus:px-4 focus:py-3 focus:text-[var(--ax-text-default)] focus:underline focus:outline focus:outline-2 focus:outline-[var(--ax-border-focus)]"
      onClick={(event) => {
        const content = document.getElementById('main-content')
        if (!content) return
        event.preventDefault()
        content.focus({ preventScroll: true })
        content.scrollIntoView({ block: 'start' })
      }}
    >
      Hopp til innhold
    </a>
  )
}
