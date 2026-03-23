import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Alert, Button, BodyShort } from '@navikt/ds-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Catches rendering errors and chunk-load failures in the React tree
 * and displays a user-friendly fallback instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('Loading CSS chunk')

      return (
        <div style={{ padding: '2rem', maxWidth: '40rem', margin: '4rem auto' }}>
          <Alert variant="error">
            <BodyShort spacing>
              {isChunkError
                ? 'En ny versjon av applikasjonen er tilgjengelig. Last inn siden på nytt for å fortsette.'
                : 'Noe gikk galt. Prøv å laste inn siden på nytt.'}
            </BodyShort>
            <Button variant="secondary" size="small" onClick={this.handleReload}>
              Last inn siden på nytt
            </Button>
          </Alert>
        </div>
      )
    }

    return this.props.children
  }
}
