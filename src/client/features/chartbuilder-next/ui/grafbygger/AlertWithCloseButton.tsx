import React from 'react'
import type { AlertProps } from '@navikt/ds-react'
import { Alert } from '@navikt/ds-react'
import { Events } from '@navikt/analytics-types'
import { trackEvent } from '../../../../shared/lib/trackEvent.ts'

interface AlertWithCloseButtonProps {
  children?: React.ReactNode
  variant: AlertProps['variant']
  onClose?: () => void
}

const AlertWithCloseButton: React.FC<AlertWithCloseButtonProps> = ({ children, variant, onClose }) => {
  const [show, setShow] = React.useState(true)

  const handleClose = () => {
    trackEvent(Events.ALERT_LUKKET, {
      seksjon: 'grafbygger',
      komponentId: 'alert-with-close-button',
      variant,
    })
    setShow(false)
    if (onClose) {
      onClose() // Call parent's onClose callback if provided
    }
  }

  return show ? (
    <Alert variant={variant} closeButton onClose={handleClose}>
      {children || 'Content'}
    </Alert>
  ) : null
}

export default AlertWithCloseButton
