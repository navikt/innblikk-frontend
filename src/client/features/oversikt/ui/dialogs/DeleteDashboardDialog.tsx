import { Alert, Button, Modal } from '@navikt/ds-react'
import type { DashboardDto } from '../../model/types.ts'

type DeleteDashboardDialogProps = {
  open: boolean
  dashboard: DashboardDto | null
  hasCharts: boolean
  loading?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => Promise<void>
}

const DeleteDashboardDialog = ({
  open,
  dashboard,
  hasCharts,
  loading = false,
  error,
  onClose,
  onConfirm,
}: DeleteDashboardDialogProps) => {
  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Slett dashboard' }} width="small">
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          <p>
            Er du sikker på at du vil slette dashboardet <strong>{dashboard?.name}</strong>?
          </p>
          {hasCharts ? (
            <Alert variant="warning" size="small">
              Dashboard med grafer kan ikke slettes. Slett alle grafer først.
            </Alert>
          ) : (
            <p className="text-[var(--ax-text-subtle)]">Denne handlingen kan ikke angres.</p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {!hasCharts && (
          <Button variant="danger" onClick={() => void onConfirm()} loading={loading}>
            Slett dashboard
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
