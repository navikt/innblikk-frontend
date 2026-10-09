import { useCallback, useEffect, useState } from 'react'
import { Alert, BodyShort, Button, Dialog, HStack, Loader, Table, VStack } from '@navikt/ds-react'
import { ArrowUndoIcon, TrashIcon } from '@navikt/aksel-icons'
import { listTrashedCohorts, restoreCohort } from '../../cohortmanager/api/cohortManagerApi.ts'
import { permanentlyDeleteCohortChecked } from '../api/cohortApi.ts'
import type { CohortDto } from '../../cohortmanager/model/types.ts'

interface TrashDialogProps {
  websiteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestored: () => void
}

export function TrashDialog({ websiteId, open, onOpenChange, onRestored }: TrashDialogProps) {
  const [items, setItems] = useState<CohortDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CohortDto | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listTrashedCohorts(websiteId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste papirkurven')
    } finally {
      setLoading(false)
    }
  }, [websiteId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const restore = async (item: CohortDto) => {
    setBusyId(item.id)
    try {
      await restoreCohort(item.id)
      await load()
      onRestored()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunne ikke gjenopprette')
    } finally {
      setBusyId(null)
    }
  }

  const deletePermanently = async () => {
    if (!confirmDelete) return
    setBusyId(confirmDelete.id)
    setConfirmError(null)
    try {
      await permanentlyDeleteCohortChecked(confirmDelete.id)
      setConfirmDelete(null)
      await load()
    } catch (err: unknown) {
      setConfirmError(err instanceof Error ? err.message : 'Kunne ikke slette')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <Dialog.Popup width="medium">
          <Dialog.Header>
            <Dialog.Title>Papirkurv</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <VStack gap="space-12">
              <BodyShort>Slettede brukergrupper havner her. Gjenopprett dem, eller slett dem for godt.</BodyShort>
              {loading && <Loader title="Laster papirkurven…" />}
              {error && <Alert variant="error">{error}</Alert>}
              {!loading && !error && items.length === 0 && (
                <Alert variant="info" inline>
                  Papirkurven er tom.
                </Alert>
              )}
              {!loading && items.length > 0 && (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell scope="col">Navn</Table.HeaderCell>
                      <Table.HeaderCell scope="col">
                        <span className="sr-only">Handlinger</span>
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {items.map((item) => (
                      <Table.Row key={item.id}>
                        <Table.DataCell>
                          <BodyShort weight="semibold">{item.name}</BodyShort>
                          {item.description && <BodyShort textColor="subtle">{item.description}</BodyShort>}
                        </Table.DataCell>
                        <Table.DataCell>
                          <HStack gap="space-8" justify="end">
                            <Button
                              size="small"
                              variant="secondary"
                              icon={<ArrowUndoIcon aria-hidden />}
                              loading={busyId === item.id}
                              onClick={() => void restore(item)}
                            >
                              Gjenopprett
                            </Button>
                            <Button
                              size="small"
                              variant="tertiary"
                              data-color="danger"
                              icon={<TrashIcon aria-hidden />}
                              onClick={() => setConfirmDelete(item)}
                            >
                              Slett for godt
                            </Button>
                          </HStack>
                        </Table.DataCell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </VStack>
          </Dialog.Body>
        </Dialog.Popup>
      </Dialog>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmDelete(null)
            setConfirmError(null)
          }
        }}
      >
        <Dialog.Popup width="small" role="alertdialog">
          <Dialog.Header withClosebutton={false}>
            <Dialog.Title>Slette «{confirmDelete?.name}» for godt?</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <BodyShort>Dette kan ikke angres.</BodyShort>
            {confirmError && (
              <Alert variant="error" className="mt-3">
                {confirmError}
              </Alert>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Button data-color="danger" loading={busyId === confirmDelete?.id} onClick={() => void deletePermanently()}>
              Slett for godt
            </Button>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary">
                Avbryt
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>
    </>
  )
}
