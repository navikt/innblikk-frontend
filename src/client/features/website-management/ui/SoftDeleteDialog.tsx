import { useState } from 'react'
import { BodyLong, Button, LocalAlert, Modal, VStack } from '@navikt/ds-react'
import type { WebsiteRegistration } from '../../../shared/api/websiteManagementApi.ts'

interface SoftDeleteDialogProps {
  website: WebsiteRegistration | null
  onConfirm: () => Promise<void>
  onClose: () => void
}

/**
 * Confirmation for soft delete: ingestion stops, but historical analytics data and
 * the registration's metadata in BigQuery are kept. Restoring is not self-service yet.
 */
export function SoftDeleteDialog({ website, onConfirm, onClose }: SoftDeleteDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={website !== null} onClose={onClose} header={{ heading: 'Deaktiver innsamling?' }} width="small">
      <Modal.Body>
        <VStack gap="space-12">
          <BodyLong>
            Innsamlingen for <strong>{website?.name}</strong> ({website?.domain}) stoppes, og sporingskoden slutter å
            virke.
          </BodyLong>
          <BodyLong>
            Historiske data i rapporter og analyser beholdes. Nettsiden kan ikke gjenopprettes selv ennå — kontakt Team
            ResearchOps hvis du angrer.
          </BodyLong>
          {error && (
            <LocalAlert status="error" role="alert">
              <LocalAlert.Content>{error}</LocalAlert.Content>
            </LocalAlert>
          )}
        </VStack>
      </Modal.Body>
      <Modal.Footer>
        <Button data-color="danger" onClick={handleConfirm} loading={isSubmitting}>
          Deaktiver innsamling
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
