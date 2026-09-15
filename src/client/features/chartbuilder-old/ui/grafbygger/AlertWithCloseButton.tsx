import React from 'react'
import type { AlertProps } from '@navikt/ds-react'
import { Alert } from '@navikt/ds-react'

interface AlertWithCloseButtonProps {
  children?: React.ReactNode
  variant: AlertProps['variant']
  onClose?: () => void
}

const AlertWithCloseButton: React.FC<AlertWithCloseButtonProps> = ({ children, variant, onClose }) => {
  const [show, setShow] = React.useState(true)

  const handleClose = () => {
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
