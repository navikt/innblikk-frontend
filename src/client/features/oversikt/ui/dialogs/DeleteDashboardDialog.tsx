import { useEffect, useRef } from 'react'
import { Alert, Button, Modal } from '@navikt/ds-react'
import { Events } from '@navikt/analytics-types'
import type { DashboardDto } from '../../model/types.ts'
import { trackEvent } from '../../../../shared/lib/trackEvent.ts'

type DeleteDashboardDialogProps = {
  open: boolean
  dashboard: DashboardDto | null
  type?: 'dashboard' | 'canvas'
  hasCharts: boolean
  loading?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => Promise<void>
}

const DeleteDashboardDialog = ({
  open,
  dashboard,
  type = 'dashboard',
  hasCharts,
  loading = false,
  error,
  onClose,
  onConfirm,
}: DeleteDashboardDialogProps) => {
  const targetLabel = type === 'canvas' ? 'canvas' : 'dashboard'
  const targetDefinite = type === 'canvas' ? 'canvaset' : 'dashboardet'
  const targetCapitalized = type === 'canvas' ? 'Canvas' : 'Dashboard'
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      trackEvent(Events.MODAL_APNET, { seksjon: 'oversikt', komponentId: 'slett-dashbord' })
    }
    wasOpenRef.current = open
  }, [open])

  const handleClose = () => {
    trackEvent(Events.MODAL_LUKKET, { seksjon: 'oversikt', komponentId: 'slett-dashbord' })
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} header={{ heading: `Slett ${targetLabel}` }} width="small">
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          <p>
            Er du sikker på at du vil slette {targetDefinite} <strong>{dashboard?.name}</strong>?
          </p>
          {hasCharts ? (
            <Alert variant="warning" size="small">
              {targetCapitalized} med grafer kan ikke slettes. Slett alle grafer først.
            </Alert>
          ) : (
            <p className="text-[var(--ax-text-subtle)]">Denne handlingen kan ikke angres.</p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {!hasCharts && (
          <Button variant="danger" onClick={() => void onConfirm()} loading={loading}>
            {`Slett ${targetLabel}`}
          </Button>
        )}
        <Button variant="secondary" onClick={handleClose} disabled={loading}>
          Lukk
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default DeleteDashboardDialog
