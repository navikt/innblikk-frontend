import { Alert, BodyShort, Button, Modal, Table, TextField, Textarea } from '@navikt/ds-react'
import { useMemo, useState } from 'react'
import CanvasSectionPlacementSelect from '../controls/CanvasSectionPlacementSelect.tsx'

type CanvasTableModalProps = {
  open: boolean
  heading?: string
  submitLabel?: string
  headersValue: string
  rowsValue: string
  selectedSectionId?: string
  sectionOptions?: Array<{ id: string; label: string }>
  error?: string | null
  isSaving?: boolean
  onHeadersChange: (value: string) => void
  onRowsChange: (value: string) => void
  onSectionChange?: (sectionId: string) => void
  onSubmit: () => void
  onClose: () => void
}

const splitDelimitedLine = (line: string): string[] => {
  const normalized = line.trim()
  if (!normalized) return []
  const delimiter = normalized.includes(';') ? ';' : normalized.includes('\t') ? '\t' : ','
  return normalized.split(delimiter).map((part) => part.trim())
}

const CanvasTableModal = ({
  open,
  heading = 'Legg til tabell',
  submitLabel = 'Legg til',
  headersValue,
  rowsValue,
  selectedSectionId = '',
  sectionOptions = [],
  error,
  isSaving = false,
  onHeadersChange,
  onRowsChange,
  onSectionChange = () => {},
  onSubmit,
  onClose,
}: CanvasTableModalProps) => {
  const [csvInput, setCsvInput] = useState('')
  const parsedHeaders = useMemo(() => splitDelimitedLine(headersValue), [headersValue])
  const parsedRows = useMemo(
    () =>
      rowsValue
        .split('\n')
        .map((line) => splitDelimitedLine(line))
        .filter((row) => row.length > 0),
    [rowsValue],
  )
  const previewHeaders = parsedHeaders.length > 0 ? parsedHeaders : ['Kolonne']
  const previewRows = parsedRows.length > 0 ? parsedRows : [['']]

  return (
    <Modal open={open} onClose={onClose} header={{ heading }} width="medium">
      <Modal.Body>
        <div className="space-y-4">
          <TextField
            label="Kolonner"
            description="Skill kolonner med semikolon, komma eller tab"
            value={headersValue}
            onChange={(event) => onHeadersChange(event.target.value)}
            autoFocus
          />
          <Textarea
            label="Rader"
            description="En rad per linje. Bruk samme skilletegn som over"
            minRows={5}
            value={rowsValue}
            onChange={(event) => onRowsChange(event.target.value)}
          />
          <CanvasSectionPlacementSelect
            sectionOptions={sectionOptions}
            selectedSectionId={selectedSectionId}
            onSectionChange={onSectionChange}
          />
          <details className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3">
            <summary className="cursor-pointer text-sm font-medium">Avansert: lim inn CSV/TSV</summary>
            <div className="mt-3 space-y-2">
              <Textarea
                label="CSV/TSV"
                hideLabel
                minRows={4}
                value={csvInput}
                onChange={(event) => setCsvInput(event.target.value)}
              />
              <Button
                size="xsmall"
                variant="secondary"
                onClick={() => {
                  const lines = csvInput.split('\n').map((line) => line.trim())
                  const nonEmptyLines = lines.filter((line) => line.length > 0)
                  if (nonEmptyLines.length === 0) return
                  onHeadersChange(nonEmptyLines[0])
                  onRowsChange(nonEmptyLines.slice(1).join('\n'))
                }}
              >
                Bruk som tabell
              </Button>
            </div>
          </details>
          <div className="space-y-2">
            <BodyShort size="small" textColor="subtle">
              Forhåndsvisning
            </BodyShort>
            <div className="max-h-64 overflow-auto rounded-md border border-[var(--ax-border-neutral-subtle)] p-2">
              <Table size="small" zebraStripes>
                <Table.Header>
                  <Table.Row>
                    {previewHeaders.map((header, headerIndex) => (
                      <Table.HeaderCell key={`table-modal-preview-header-${headerIndex}`}>{header}</Table.HeaderCell>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {previewRows.slice(0, 8).map((row, rowIndex) => (
                    <Table.Row key={`table-modal-preview-row-${rowIndex}`}>
                      {previewHeaders.map((_, columnIndex) => (
                        <Table.DataCell key={`table-modal-preview-cell-${rowIndex}-${columnIndex}`}>
                          {row[columnIndex] ?? ''}
                        </Table.DataCell>
                      ))}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </div>
          {error && <Alert variant="error">{error}</Alert>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onSubmit} size="small" loading={isSaving}>
          {submitLabel}
        </Button>
        <Button variant="secondary" size="small" onClick={onClose}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default CanvasTableModal
