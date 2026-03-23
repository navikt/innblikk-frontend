import { Alert, Button, Modal } from '@navikt/ds-react'
import type { OversiktChart } from '../../model/types.ts'

type DeleteChartDialogProps = {
  open: boolean
  chart: OversiktChart | null
  loading?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => Promise<void>
}

const DeleteChartDialog = ({ open, chart, loading = false, error, onClose, onConfirm }: DeleteChartDialogProps) => {
  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Slett graf' }} width="small">
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
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default DeleteChartDialog
