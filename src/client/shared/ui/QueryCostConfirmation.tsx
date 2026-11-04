import { Alert, Button, Modal } from '@navikt/ds-react'
import type { QueryStats } from '../types/queryStats'

type Props = {
  open: boolean
  estimate: QueryStats | null
  loading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function QueryCostConfirmation({ open, estimate, loading = false, onConfirm, onCancel }: Props) {
  const gb = Number(estimate?.totalBytesProcessedGB ?? 0)
  const cost = Number(estimate?.estimatedCostUSD ?? NaN) || gb * 0.00625
  return (
    <Modal
      open={open}
      onClose={() => {
        if (open) onCancel()
      }}
      header={{ heading: 'Bekreft stor spørring', closeButton: false }}
    >
      <Modal.Body>
        {estimate && (
          <div className="space-y-4">
            <Alert variant={gb >= 100 ? 'error' : gb >= 20 ? 'warning' : 'info'}>
              <div className="space-y-2">
                <p className="font-medium">
                  {gb >= 100
                    ? 'Dette er en veldig stor spørring!'
                    : gb >= 20
                      ? 'Dette er en stor spørring.'
                      : 'Denne spørringen vil prosessere en del data.'}
                </p>
                <p>
                  <strong>Data å prosessere:</strong> {estimate.totalBytesProcessedGB} GB
                  {cost > 0 && ` • Kostnad: $${cost.toFixed(2)}`}
                </p>
              </div>
            </Alert>
            <p>Er du sikker på at du vil kjøre denne spørringen?</p>
            <p>Du kan avbryte og velge en kortere periode for å redusere datamengden.</p>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onConfirm} loading={loading}>
          Ja, kjør spørringen
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
