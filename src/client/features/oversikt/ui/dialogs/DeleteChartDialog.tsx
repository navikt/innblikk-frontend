import { useEffect, useRef } from 'react'
import { Alert, Button, Modal } from '@navikt/ds-react'
import { Events } from '@navikt/analytics-types'
import type { OversiktChart } from '../../model/types.ts'
import { trackEvent } from '../../../../shared/lib/trackEvent.ts'

type DeleteChartDialogProps = {
  open: boolean
  chart: OversiktChart | null
  loading?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => Promise<void>
}

const DeleteChartDialog = ({ open, chart, loading = false, error, onClose, onConfirm }: DeleteChartDialogProps) => {
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      trackEvent(Events.MODAL_APNET, { seksjon: 'oversikt', komponentId: 'slett-graf' })
    }
    wasOpenRef.current = open
  }, [open])

  const handleClose = () => {
    trackEvent(Events.MODAL_LUKKET, { seksjon: 'oversikt', komponentId: 'slett-graf' })
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} header={{ heading: 'Slett graf' }} width="small">
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          <p>
            Er du sikker på at du vil slette grafen <strong>{chart?.title}</strong>?
          </p>
          <p className="text-[var(--ax-text-subtle)]">Denne handlingen kan ikke angres.</p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="danger" onClick={() => void onConfirm()} loading={loading}>
          Slett graf
        </Button>
        <Button variant="secondary" onClick={handleClose} disabled={loading}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default DeleteChartDialog
