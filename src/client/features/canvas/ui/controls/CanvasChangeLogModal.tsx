import { Alert, Button, Modal, Table } from '@navikt/ds-react'

export type CanvasChangeLogEntry = {
  id: number
  name: string
  description: string
  updatedAt: string
  changedByName: string
  changedByNavIdent: string
  changedByEmail: string
}

type CanvasChangeLogModalProps = {
  open: boolean
  onClose: () => void
  entries: CanvasChangeLogEntry[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
}

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value || '-'
  return parsed.toLocaleString('nb-NO')
}

const formatChangedBy = (entry: CanvasChangeLogEntry): string => {
  const name = entry.changedByName.trim()
  if (name) return name
  const ident = entry.changedByNavIdent.trim()
  if (ident) return ident
  const email = entry.changedByEmail.trim()
  if (email) return email
  return 'Ukjent'
}

const formatEntryName = (entry: CanvasChangeLogEntry): string => {
  const name = entry.name.trim()
  if (!name) return '-'

  if (name.startsWith('canvas:heading:')) return 'Overskrift'
  if (name.startsWith('canvas:text:')) return 'Tekst'
  if (name.startsWith('canvas:sticky:')) return 'Sticky note'
  if (name.startsWith('canvas:section:')) return 'Seksjon'
  if (name.startsWith('canvas:image:')) return 'Bilde'
  if (name.startsWith('canvas:icon:')) return 'Ikon'
  if (name.startsWith('canvas:figure:')) return 'Figur'
  if (name.startsWith('canvas:drawing:')) return 'Tegning'
  if (name.startsWith('canvas:website:')) return 'Nettside'
  if (name.startsWith('canvas:dashboard:')) return 'Dashboard'
  if (name.startsWith('canvas:chart:')) return 'Graf'
  if (name.startsWith('canvas:connection:')) return 'Kobling'
  if (name === 'canvas:timer') return 'Nedteller'
  if (name === 'canvas:dot-voting:session') return 'Prikkvotering (økt)'
  if (name.startsWith('canvas:dot-voting:ballot:')) return 'Prikkvotering (stemme)'
  if (name.startsWith('canvas:presence:')) return 'Tilstedeværelse'
  if (name.startsWith('canvas:lock:')) return 'Redigeringslås'

  return name
}

const formatEntryType = (entry: CanvasChangeLogEntry): string => {
  const description = entry.description.trim().toLowerCase()
  if (!description) return '-'
  if (description === '[canvas]') return 'Canvas-element'
  if (description === '[canvas-presence]') return 'System: tilstedeværelse'
  if (description === '[canvas-lock]') return 'System: redigeringslås'
  if (description === '[canvas-timer]') return 'Fasilitator: nedteller'
  if (description === '[canvas-dot-voting]') return 'Fasilitator: prikkvotering'
  return entry.description
}

const CanvasChangeLogModal = ({ open, onClose, entries, isLoading, error, onRefresh }: CanvasChangeLogModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading: 'Endringslogg' }} width="medium">
    <Modal.Body>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div />
          <Button size="small" variant="secondary" onClick={onRefresh} loading={isLoading}>
            Oppdater
          </Button>
        </div>

        {error && <Alert variant="error">{error}</Alert>}
        {!error && (
          <Alert variant="info" size="small">
            Dersom et element slettes, vil denne endringen ikke vises i loggen.
          </Alert>
        )}

        <div className="max-h-[420px] overflow-auto rounded-md border border-[var(--ax-border-neutral-subtle)]">
          <Table size="small">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Oppdatert</Table.HeaderCell>
                <Table.HeaderCell>Navn</Table.HeaderCell>
                <Table.HeaderCell>Type</Table.HeaderCell>
                <Table.HeaderCell>Endret av</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {entries.length === 0 && (
                <Table.Row>
                  <Table.DataCell colSpan={4}>Ingen endringer funnet.</Table.DataCell>
                </Table.Row>
              )}
              {entries.map((entry) => (
                <Table.Row key={`canvas-changelog-${entry.id}`}>
                  <Table.DataCell>{formatTimestamp(entry.updatedAt)}</Table.DataCell>
                  <Table.DataCell>{formatEntryName(entry)}</Table.DataCell>
                  <Table.DataCell>{formatEntryType(entry)}</Table.DataCell>
                  <Table.DataCell>{formatChangedBy(entry)}</Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>
    </Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" size="small" onClick={onClose}>
        Lukk
      </Button>
    </Modal.Footer>
  </Modal>
)

export default CanvasChangeLogModal
