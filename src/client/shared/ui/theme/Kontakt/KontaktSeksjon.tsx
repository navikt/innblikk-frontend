import { useEffect, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Heading, Link } from '@navikt/ds-react'
import { ThumbDownIcon, ThumbUpIcon } from '@navikt/aksel-icons'
import { AppBlock } from '../AppBlock/AppBlock.tsx'
import './KontaktSeksjon.css'

/*
 * Enhance the Skyra survey's shadow DOM. The survey renders into an open
 * shadow root that document CSS can't reach, so we inject styles/icons
 * directly. Skyra re-renders the root on each new question, so a
 * MutationObserver keeps the enhancements applied across steps.
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

interface KontaktSeksjonProps {
  narrowContent?: boolean
}

export const KontaktSeksjon = ({ narrowContent = false }: KontaktSeksjonProps) => {
  const contentWrapperMaxWidth = narrowContent ? '800px' : '1400px'
  const contentWrapperMargin = narrowContent ? '0 auto' : '0'

  const contentWrapper = (
    <div style={{ width: '100%', maxWidth: contentWrapperMaxWidth, margin: contentWrapperMargin }}>
      <KontaktContent />
    </div>
  )

  return (
    <div
      style={{
        width: '100%',
        backgroundColor: 'var(--ax-bg-accent-soft)',
        paddingTop: '60px',
        paddingBottom: '60px',
        marginTop: '60px',
      }}
    >
      <AppBlock>{contentWrapper}</AppBlock>
    </div>
  )
}

const KontaktContent = () => {
  const skyraRef = useEnhanceSkyra()

  return (
    <>
      <Heading as="h2" size="medium" style={{ marginBottom: '24px' }}>
        Ønsker du noen å sparre med?
      </Heading>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Chat med oss - Slack */}
        <div
          style={{
            backgroundColor: 'var(--ax-bg-default)',
            padding: '32px',
            borderRadius: '8px',
            border: '1px solid var(--ax-border-neutral-subtle)',
          }}
        >
          <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B" target="_blank">
            <Heading as="h2" size="medium" style={{ marginBottom: '12px', color: 'var(--ax-text-accent)' }}>
              Chat med ResearchOps
            </Heading>
          </Link>
          <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5' }}>
            Bli med i Slack-kanalen{' '}
            <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B" target="_blank">
              #researchops
            </Link>{' '}
            for å stille spørsmål og få hjelp.
          </p>
        </div>

        {/* Book en samtale */}
        <div
          style={{
            backgroundColor: 'var(--ax-bg-default)',
            padding: '32px',
            borderRadius: '8px',
            border: '1px solid var(--ax-border-neutral-subtle)',
          }}
        >
          <Link href="https://outlook.office365.com/owa/calendar/TeamResearchOps@nav.no/bookings/" target="_blank">
            <Heading as="h2" size="medium" style={{ marginBottom: '12px', color: 'var(--ax-text-accent)' }}>
              Du kan også booke en samtale
            </Heading>
          </Link>
          <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5' }}>
            <Link href="https://outlook.office365.com/owa/calendar/TeamResearchOps@nav.no/bookings/" target="_blank">
              Book en prat 1:1 eller workshop
            </Link>{' '}
            med ResearchOps-teamet.
          </p>
        </div>
      </div>

      {/* Skyra inline survey — centered below the cards, sized to its content (see KontaktSeksjon.css) */}
      <div className="kontakt-seksjon-skyra" style={{ marginTop: '40px', display: 'flex', justifyContent: 'center' }}>
        <skyra-survey
          ref={skyraRef}
          slug="arbeids-og-velferdsetaten-nav/far-folk-gjort-det-de-kom-for-pa-startumami"
        ></skyra-survey>
      </div>
    </>
  )
}
