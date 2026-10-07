import { useEffect, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThumbDownIcon, ThumbUpIcon } from '@navikt/aksel-icons'
import styles from './Skyra.module.css'

/*
 * Inline Skyra survey ("Fant du det du lette etter?"). Rendered above the
 * KontaktSeksjon band at the bottom of pages.
 *
 * The survey renders into an open shadow root that document CSS can't reach,
 * so we inject styles/icons directly. Skyra re-renders the root on each new
 * question, so a MutationObserver keeps the enhancements applied across steps.
 */

// Aksel thumbs icons, rendered to markup once for injection. currentColor,
// so they inherit the button text color.
const thumbIcon = (Icon: typeof ThumbUpIcon) =>
  renderToStaticMarkup(<Icon aria-hidden focusable={false} style={{ marginRight: '0.5em', flex: 'none' }} />)

const THUMB_ICON: Record<string, string> = {
  yes: thumbIcon(ThumbUpIcon),
  no: thumbIcon(ThumbDownIcon),
}

const enhanceSkyraRoot = (root: ShadowRoot) => {
  // Center the answer-button row (no `part`, so document CSS can't reach it).
  // The :has() guards leave the Tilbake/Neste nav row spread to its edges.
  if (!root.getElementById('innblikk-skyra-actions')) {
    const style = document.createElement('style')
    style.id = 'innblikk-skyra-actions'
    style.textContent =
      '[data-survey-actions]:not(:has([part="button-secondary"])):not(:has([part="button-link"])) { justify-content: center; }' +
      '[data-survey-actions] [part="button-primary"] { display: inline-flex; align-items: center; }'
    root.appendChild(style)
  }

  // Thumbs up/down on the yes/no answer buttons, before the label.
  for (const btn of root.querySelectorAll<HTMLElement>('[part="button-primary"]')) {
    if (btn.querySelector('svg')) continue
    const key = { ja: 'yes', yes: 'yes', nei: 'no', no: 'no' }[btn.textContent?.trim().toLowerCase() ?? '']
    if (key) btn.insertAdjacentHTML('afterbegin', THUMB_ICON[key])
  }
}

const useEnhanceSkyra = () => {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return

    // Skyra attaches its shadow root asynchronously once the script loads,
    // so poll until it exists before wiring up.
    let observer: MutationObserver | undefined
    let frame: number
    const start = performance.now()
    const wire = () => {
      const root = host.shadowRoot
      if (root) {
        enhanceSkyraRoot(root)
        // Re-apply on every question swap. Observe the root itself — the
        // content aside may not be the root's first child.
        observer = new MutationObserver(() => enhanceSkyraRoot(root))
        observer.observe(root, { childList: true, subtree: true })
        return
      }
      if (performance.now() - start < 5000) frame = requestAnimationFrame(wire)
    }
    wire()

    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [])

  return ref
}

export const Skyra = () => {
  const skyraRef = useEnhanceSkyra()

  return (
    <div className={styles.wrapper}>
      <skyra-survey
        ref={skyraRef}
        slug="arbeids-og-velferdsetaten-nav/far-folk-gjort-det-de-kom-for-pa-startumami"
      ></skyra-survey>
    </div>
  )
}
