import { Alert, Button, Modal } from '@navikt/ds-react'
import type { DashboardDto } from '../../model/types.ts'

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

  return (
    <Modal open={open} onClose={onClose} header={{ heading: `Slett ${targetLabel}` }} width="small">
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
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Lukk
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default DeleteDashboardDialog
