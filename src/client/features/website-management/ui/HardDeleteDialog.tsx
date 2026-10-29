import { useState } from 'react'
import { BodyLong, Button, CopyButton, HStack, LocalAlert, Modal, TextField, VStack } from '@navikt/ds-react'
import type { WebsiteRegistration } from '../../../shared/api/websiteManagementApi.ts'

interface HardDeleteDialogProps {
  website: WebsiteRegistration | null
  /** Receives the UUID the user actually typed, echoed to the service as confirmation. */
  onConfirm: (confirmation: string) => Promise<void>
  onClose: () => void
}

/**
 * ReOps hard delete: removes ONLY the Postgres registration row. The user must type the
 * exact website UUID to confirm. The dialog deliberately spells out what is NOT touched:
 * no Kafka/BigQuery events are emitted, and no sessions or analytics data are deleted.
 */
export function HardDeleteDialog({ website, onConfirm, onClose }: HardDeleteDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmationWebsiteId, setConfirmationWebsiteId] = useState<string | null>(null)

  // Reset the typed confirmation when the dialog is reopened for another website.
  if (confirmationWebsiteId !== (website?.websiteId ?? null)) {
    setConfirmationWebsiteId(website?.websiteId ?? null)
    setConfirmation('')
    setError(null)
    setIsSubmitting(false)
  }

  const matches = website !== null && confirmation.trim().toLowerCase() === website.websiteId.toLowerCase()

  const handleConfirm = async () => {
    if (!matches) {
      setError('ID-en stemmer ikke. Kopier ID-en ovenfor og lim den inn nøyaktig.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm(confirmation.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={website !== null}
      onClose={onClose}
      header={{ heading: 'Slett registrering permanent?' }}
      width="small"
    >
      <Modal.Body>
        <VStack gap="space-12">
          <LocalAlert status="warning">
            <LocalAlert.Content>
              Dette sletter <strong>kun</strong> registreringen i databasen (Postgres). Det sendes ingen hendelser til
              Kafka/BigQuery, og ingen sesjoner eller analysedata slettes. Nettsidens metadata og historikk i BigQuery
              forblir uendret. Tidligere rydding i historiske data gjøres fortsatt manuelt.
            </LocalAlert.Content>
          </LocalAlert>
          <BodyLong>
            For å bekrefte, skriv inn den nøyaktige ID-en til <strong>{website?.name}</strong>:
          </BodyLong>
          <HStack gap="space-8" align="center">
            <code style={{ wordBreak: 'break-all' }}>{website?.websiteId}</code>
            {website && <CopyButton copyText={website.websiteId} size="small" text="Kopier" />}
          </HStack>
          <TextField
            label="Bekreft med nettsidens ID"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            error={error ?? undefined}
            autoComplete="off"
            htmlSize={38}
          />
        </VStack>
      </Modal.Body>
      <Modal.Footer>
        <Button data-color="danger" onClick={handleConfirm} loading={isSubmitting} disabled={!matches}>
          Slett registrering permanent
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
