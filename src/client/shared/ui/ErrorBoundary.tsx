import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Alert, Button, BodyShort, Loader } from '@navikt/ds-react'
import { hasUnsavedChanges } from '../hooks/useUnsavedChangesGuard.ts'
import { isPageLoadError, tryReloadPage } from '../lib/pageRecovery.ts'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  recovery: 'idle' | 'recovering' | 'offline' | 'warning'
  showLoader: boolean
}

/**
 * Catches rendering errors and chunk-load failures in the React tree
 * and displays a user-friendly fallback instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  private loaderTimer?: ReturnType<typeof setTimeout>
  private recoveryTimer?: ReturnType<typeof setTimeout>

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, recovery: 'idle', showLoader: false }
  }

  static getDerivedStateFromError(error: Error): State {
    const canRecover = isPageLoadError(error) && !hasUnsavedChanges()
    return {
      hasError: true,
      recovery: canRecover ? (navigator.onLine ? 'recovering' : 'offline') : 'warning',
      showLoader: false,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
    if (this.state.recovery === 'offline') {
      window.addEventListener('online', this.recover, { once: true })
    } else if (this.state.recovery === 'recovering') {
      this.recover()
    }
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.recover)
    clearTimeout(this.loaderTimer)
    clearTimeout(this.recoveryTimer)
  }

  private recover = () => {
    if (!tryReloadPage()) {
      this.setState({ recovery: 'warning' })
      return
    }
    this.setState({ recovery: 'recovering' })
    this.loaderTimer = setTimeout(() => this.setState({ showLoader: true }), 1000)
    this.recoveryTimer = setTimeout(() => this.setState({ recovery: 'warning' }), 10000)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.state.recovery === 'recovering') {
        return this.state.showLoader ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <Loader size="large" title="Laster siden" />
          </div>
        ) : null
      }

      return (
        <div style={{ padding: '2rem', maxWidth: '40rem', margin: '4rem auto' }}>
          <Alert variant={this.state.recovery === 'offline' ? 'info' : 'warning'}>
            <BodyShort spacing>
              {this.state.recovery === 'offline'
                ? 'Du ser ut til å være frakoblet. Vi prøver igjen når du er på nett.'
                : 'Vi fikk ikke åpnet siden. Prøv igjen.'}
            </BodyShort>
            <Button variant="secondary" size="small" onClick={this.handleReload}>
              Prøv igjen
            </Button>
          </Alert>
        </div>
      )
    }

    return this.props.children
  }
}
