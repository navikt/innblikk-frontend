import { forwardRef } from 'react'
import { Modal, Button, Accordion, BodyShort, Link, List, CopyButton, Heading } from '@navikt/ds-react'
import { SnippetBlock } from './SnippetBlock'
import {
  getStandardSnippet,
  getNextJsSnippet,
  getReactViteProviderSnippet,
  getReactViteHeadSnippet,
  getAstroSnippet,
  getGTMSnippet,
} from '../utils'
import { formatDate } from '../utils'
import type { SelectedWebsite } from '../model'

interface TrackingCodeModalProps {
  selectedItem: SelectedWebsite
  onClose?: () => void
}

export const TrackingCodeModal = forwardRef<HTMLDialogElement, TrackingCodeModalProps>(
  ({ selectedItem, onClose }, ref) => (
    <Modal
      ref={ref}
      header={{ heading: 'Sporingskode for ' + selectedItem.name }}
      width="medium"
      className="sporings-modal"
      onClose={onClose}
    >
      <Modal.Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          {selectedItem.createdAt && formatDate(selectedItem.createdAt) && (
            <BodyShort size="medium">
              <strong>Opprettet:</strong> {formatDate(selectedItem.createdAt)}
            </BodyShort>
          )}
          {selectedItem.domain && (
            <BodyShort size="medium">
              <strong>Hoveddomene:</strong> {selectedItem.domain}
            </BodyShort>
          )}
          <BodyShort
            size="medium"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>
              <strong>Nettside-ID:</strong> {selectedItem.id}
            </span>
            <CopyButton copyText={selectedItem.id} text="Kopier ID" activeText="Kopiert!" size="small" />
          </BodyShort>
        </div>

        <Accordion>
          <Accordion.Item>
            <Accordion.Header>Umami-sporingskode (standard)</Accordion.Header>
            <Accordion.Content>
              <SnippetBlock text={getStandardSnippet(selectedItem.id)} language="html" />
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item>
            <Accordion.Header>Umami-sporingskode for Next.js-apper</Accordion.Header>
            <Accordion.Content>
              <div style={{ marginBottom: '15px' }}>
                <SnippetBlock text={getNextJsSnippet(selectedItem.id)} language="jsx" />
              </div>
              <p style={{ marginBottom: '15px' }}>Benytter next.js sin innebygde import Script from 'next/script';</p>
              <p style={{ marginBottom: '15px' }}>
                Trigges ikke koden? Forsøk å legger til export const dynamic = 'force-dynamic'; i en layout.tsx fil.
              </p>
              <Link target="_blank" href={`https://github.com/navikt/delta-frontend/blob/main/src/app/layout.tsx`}>
                Kodeeksempel for Next.js-apper
              </Link>
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item>
            <Accordion.Header>Umami-sporingskode for React med Vite.js</Accordion.Header>
            <Accordion.Content>
              <p style={{ marginBottom: '10px' }}>
                <strong>Steg 1:</strong> Installer <code>@unhead/react</code> og sett opp UnheadProvider i
                hovedkomponenten din (f.eks. App.tsx)
              </p>
              <div style={{ marginBottom: '15px' }}>
                <SnippetBlock text={getReactViteProviderSnippet()} language="jsx" />
              </div>
              <p style={{ marginBottom: '10px' }}>
                <strong>Steg 2:</strong> Legg til sporingskoden med Head-komponenten
              </p>
              <div style={{ marginBottom: '15px' }}>
                <SnippetBlock text={getReactViteHeadSnippet(selectedItem.id)} language="jsx" />
              </div>
              <Link target="_blank" href={`https://github.com/navikt/reops-felgen/blob/master/src/App.tsx`}>
                Kodeeksempel for React med Vite.js
              </Link>
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item>
            <Accordion.Header>Umami-sporingskode for Astro.js-apper</Accordion.Header>
            <Accordion.Content>
              <div style={{ marginBottom: '15px' }}>
                <SnippetBlock text={getAstroSnippet(selectedItem.id)} language="html" />
              </div>
              <Link target="_blank" href={`https://github.com/navikt/docs/blob/main/src/components/BaseHead.astro`}>
                Kodeeksempel for Astro.js-apper
              </Link>
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item>
            <Accordion.Header>Umami-sporingskode for Google Tag Manager (GTM)</Accordion.Header>
            <Accordion.Content>
              <SnippetBlock text={getGTMSnippet(selectedItem.id)} language="javascript" />
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
        <Heading level="3" size="xsmall" spacing style={{ marginTop: '30px' }}>
          Verdt å vite
        </Heading>
        <List as="ul">
          <List.Item>Sporingskoden legges vanligvis til i &lt;head&gt;-delen på nettsiden.</List.Item>
          <List.Item>
            Vil du at sporingskoden kun skal kjøre på spesifikke domener, for eksempel ikke på localhost? Da kan du
            legge til{' '}
            <Link target="_blank" href={`https://umami.is/docs/tracker-configuration`}>
              attributtet data-domains
            </Link>
            .
          </List.Item>
          <List.Item>
            Umami sporer besøk (sidevisninger) ut av boksen. Ønsker du ikke dette? Da kan du legge til{' '}
            <Link target="_blank" href={`https://umami.is/docs/tracker-configuration`}>
              attributtet data-auto-track="false"
            </Link>
            .
          </List.Item>
        </List>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" onClick={() => (ref as React.RefObject<HTMLDialogElement>).current?.close()}>
          Lukk
        </Button>
      </Modal.Footer>
    </Modal>
  ),
)

TrackingCodeModal.displayName = 'TrackingCodeModal'
