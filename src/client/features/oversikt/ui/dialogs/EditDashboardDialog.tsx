import { useEffect, useState } from 'react'
import { Alert, Button, Modal, TextField } from '@navikt/ds-react'
import type { DashboardDto } from '../../model/types.ts'

type EditDashboardDialogProps = {
  open: boolean
  dashboard: DashboardDto | null
  loading?: boolean
  error?: string | null
  onClose: () => void
  onSave: (params: { name: string; description?: string }) => Promise<void>
}

const EditDashboardDialog = ({
  open,
  dashboard,
  loading = false,
  error,
  onClose,
  onSave,
}: EditDashboardDialogProps) => {
  const [name, setName] = useState(dashboard?.name ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setName(dashboard?.name ?? '')
  }, [dashboard])

  const handleSave = async () => {
    if (!dashboard) return
    if (!name.trim()) {
      setLocalError('Dashboardnavn er påkrevd')
      return
    }
    setLocalError(null)
    await onSave({ name: name.trim(), description: dashboard.description })
  }

  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Endre info' }} width="small">
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {localError && <Alert variant="error">{localError}</Alert>}
          {error && <Alert variant="error">{error}</Alert>}
          <TextField
            label="Dashboardnavn"
            value={name}
            onChange={(event) => setName(event.target.value)}
            size="small"
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={() => void handleSave()} loading={loading}>
          Endre info
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default EditDashboardDialog
