import type { ChangeEvent, RefObject } from 'react'
import { Alert, Button, Modal, Select, Switch, Table } from '@navikt/ds-react'

type CanvasCsvImportStyle = 'sticky' | 'table'
type CanvasCsvTableMode = 'rows' | 'summary'

type CanvasCsvPreviewNote = {
  rowIndex: number
  text: string
}

type CanvasCsvSummaryRow = {
  value: string
  count: number
  percentage: number
}

type CanvasPrivacyFinding = {
  rowIndex: number
  text: string
  patternNames: string[]
}

type CanvasImportStickyCsvModalProps = {
  open: boolean
  onClose: () => void
  onImport: () => void
  isSaving: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onClearFile: () => void
  fileName: string
  rowCount: number
  headers: string[]
  contentColumn: string
  onContentColumnChange: (value: string) => void
  canChooseNonNumericImportStyle: boolean
  importStyle: CanvasCsvImportStyle
  onImportStyleChange: (value: CanvasCsvImportStyle) => void
  tableMode: CanvasCsvTableMode
  onTableModeChange: (value: CanvasCsvTableMode) => void
  hasNumericSummary: boolean
  hasPrivacyFindings: boolean
  privacyFindings: CanvasPrivacyFinding[]
  privacyReviewed: boolean
  onPrivacyReviewedChange: (checked: boolean) => void
  shouldImportAsAggregated: boolean
  error: string | null
  previewNotes: CanvasCsvPreviewNote[]
  sectionTitle: string
  numericSummaryRows: CanvasCsvSummaryRow[]
  categoricalSummaryRows: CanvasCsvSummaryRow[]
  tablePreviewNumericSummaryRows: CanvasCsvSummaryRow[]
  tablePreviewSummaryRows: CanvasCsvSummaryRow[]
  tablePreviewNoteRows: CanvasCsvPreviewNote[]
  tablePreviewPageCount: number
  currentTablePreviewPage: number
  onPrevTablePreviewPage: () => void
  onNextTablePreviewPage: () => void
  onExcludeRow: (rowIndex: number) => void
}

const CanvasImportStickyCsvModal = ({
  open,
  onClose,
  onImport,
  isSaving,
  fileInputRef,
  onFileChange,
  onClearFile,
  fileName,
  rowCount,
  headers,
  contentColumn,
  onContentColumnChange,
  canChooseNonNumericImportStyle,
  importStyle,
  onImportStyleChange,
  tableMode,
  onTableModeChange,
  hasNumericSummary,
  hasPrivacyFindings,
  privacyFindings,
  privacyReviewed,
  onPrivacyReviewedChange,
  shouldImportAsAggregated,
  error,
  previewNotes,
  sectionTitle,
  numericSummaryRows,
  categoricalSummaryRows,
  tablePreviewNumericSummaryRows,
  tablePreviewSummaryRows,
  tablePreviewNoteRows,
  tablePreviewPageCount,
  currentTablePreviewPage,
  onPrevTablePreviewPage,
  onNextTablePreviewPage,
  onExcludeRow,
}: CanvasImportStickyCsvModalProps) => (
  <Modal open={open} onClose={onClose} header={{ heading: 'Importer fra Skyra / Lumi' }} width={1100}>
    <Modal.Body>
      <section aria-label="CSV-import for brukerfeedback" className="grid gap-4 md:grid-cols-[340px_minmax(380px,1fr)]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="canvas-feedback-csv-file" className="text-sm font-medium text-[var(--ax-text-default)]">
              CSV-fil
            </label>
            <input
              ref={fileInputRef}
              id="canvas-feedback-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                void onFileChange(event)
              }}
              className="sr-only"
            />
            <div className="flex items-center gap-2">
              <Button size="small" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                {fileName ? 'Bytt CSV-fil' : 'Velg CSV-fil'}
              </Button>
              {fileName && (
                <Button size="small" variant="tertiary" onClick={onClearFile}>
                  Fjern fil
                </Button>
              )}
            </div>
            {fileName && (
              <p className="text-xs text-[var(--ax-text-subtle)]">
                <strong>{fileName}</strong> ({rowCount} rader)
              </p>
            )}
          </div>

          {headers.length > 0 && (
            <div className="space-y-3">
              <Select
                label="Velg kolonne"
                value={contentColumn}
                onChange={(event) => onContentColumnChange(event.target.value)}
              >
                <option value="" disabled>
                  Velg kolonne
                </option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </Select>
              {canChooseNonNumericImportStyle && (
                <div className="space-y-3">
                  <Select
                    label="Importer som"
                    value={importStyle}
                    onChange={(event) => onImportStyleChange(event.target.value as CanvasCsvImportStyle)}
                  >
                    <option value="sticky">Post-it-lapper</option>
                    <option value="table">Tabell</option>
                  </Select>
                  {importStyle === 'table' && (
                    <Select
                      label="Tabellvisning"
                      value={tableMode}
                      onChange={(event) => onTableModeChange(event.target.value as CanvasCsvTableMode)}
                    >
                      <option value="rows">Rader</option>
                      <option value="summary">Oppsummering</option>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          {hasNumericSummary && (
            <Alert variant="info" size="small">
              Denne kolonnen inneholder bare tall. Importen blir en aggregert vurdering i stedet for Post-it-lapper.
            </Alert>
          )}
          {hasPrivacyFindings && (
            <Alert variant="error" size="small">
              <div className="space-y-3">
                <p className="text-sm font-medium">Fant mulig persondata i {privacyFindings.length} rader</p>
                <div className="max-h-48 space-y-2 overflow-auto rounded border border-[var(--ax-border-danger)]/30 bg-[var(--ax-bg-default)] p-2">
                  {privacyFindings.slice(0, 8).map((finding) => (
                    <div
                      key={`privacy-finding-row-${finding.rowIndex}`}
                      className="rounded border border-[var(--ax-border-danger)]/20 bg-[var(--ax-bg-default)] p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-xs font-semibold text-[var(--ax-text-default)]">
                            Rad {finding.rowIndex + 1}
                          </div>
                          <div className="text-xs text-[var(--ax-text-subtle)]">{finding.patternNames.join(', ')}</div>
                        </div>
                        <Button
                          size="xsmall"
                          variant="secondary"
                          className="shrink-0"
                          onClick={() => onExcludeRow(finding.rowIndex)}
                        >
                          Fjern
                        </Button>
                      </div>
                      <div className="mt-1 break-all text-xs text-[var(--ax-text-subtle)]">{finding.text}</div>
                    </div>
                  ))}
                  {privacyFindings.length > 8 && (
                    <p className="text-xs text-[var(--ax-text-subtle)]">
                      + {privacyFindings.length - 8} flere rader med treff.
                    </p>
                  )}
                </div>
                <Switch
                  size="small"
                  checked={privacyReviewed}
                  onChange={(event) => onPrivacyReviewedChange(event.target.checked)}
                >
                  Jeg har gått gjennom radene med treff og vil fortsette import.
                </Switch>
              </div>
            </Alert>
          )}
          {!shouldImportAsAggregated && (
            <Alert variant="warning" size="small">
              <div className="space-y-2">
                <p className="text-sm font-medium">Gjør en personversjekk før import</p>
                <p className="text-xs">
                  Innblikk er tilgjengelig for alle i Nav. Importer kun data uten personidentifiserbar informasjon.
                </p>
                {fileName && contentColumn && (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    <li>Skann teksten for navn, fødselsnummer, telefonnummer, e-post og adresser.</li>
                    <li>
                      Bruk forhåndsvisningen til høyre og fjern {importStyle === 'table' ? 'rader' : 'lapper'} med
                      sensitive opplysninger.
                    </li>
                  </ul>
                )}
              </div>
            </Alert>
          )}
          {error && <Alert variant="error">{error}</Alert>}
        </div>

        <aside className="min-w-0 overflow-hidden rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3">
          <div className="mb-2 text-sm font-semibold text-[var(--ax-text-default)]">Forhåndsvisning</div>
          <div className="mb-2 text-xs text-[var(--ax-text-subtle)]">
            {previewNotes.length === 0
              ? 'Du kan forhåndsvise innholdet her før import.'
              : `${sectionTitle || 'Kolonne'} • ${
                  shouldImportAsAggregated
                    ? `${numericSummaryRows.length} verdier (oppsummert)`
                    : importStyle === 'table'
                      ? tableMode === 'summary'
                        ? `${categoricalSummaryRows.length} verdier (oppsummert)`
                        : `${previewNotes.length} rader (tabell)`
                      : `${previewNotes.length} lapper`
                }`}
          </div>
          {(shouldImportAsAggregated || importStyle === 'table') && (
            <div className="space-y-2">
              <Table size="small" zebraStripes className="w-full table-fixed">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell className="w-[70%]">{contentColumn || 'Kolonne'}</Table.HeaderCell>
                    {shouldImportAsAggregated || tableMode === 'summary' ? (
                      <>
                        <Table.HeaderCell className="w-[90px]">Antall</Table.HeaderCell>
                        <Table.HeaderCell className="w-[90px]">Andel</Table.HeaderCell>
                      </>
                    ) : (
                      <Table.HeaderCell className="w-[90px]">Handling</Table.HeaderCell>
                    )}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {shouldImportAsAggregated
                    ? tablePreviewNumericSummaryRows.map((item) => (
                        <Table.Row key={`import-preview-numeric-summary-row-${item.value}`}>
                          <Table.DataCell className="break-all">{item.value}</Table.DataCell>
                          <Table.DataCell>{item.count.toLocaleString('nb-NO')}</Table.DataCell>
                          <Table.DataCell>
                            {item.percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %
                          </Table.DataCell>
                        </Table.Row>
                      ))
                    : tableMode === 'summary'
                      ? tablePreviewSummaryRows.map((item) => (
                          <Table.Row key={`import-preview-summary-row-${item.value}`}>
                            <Table.DataCell className="break-all">{item.value}</Table.DataCell>
                            <Table.DataCell>{item.count.toLocaleString('nb-NO')}</Table.DataCell>
                            <Table.DataCell>
                              {item.percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %
                            </Table.DataCell>
                          </Table.Row>
                        ))
                      : tablePreviewNoteRows.map((note) => (
                          <Table.Row key={`import-preview-row-${note.rowIndex}`}>
                            <Table.DataCell className="break-all">{note.text}</Table.DataCell>
                            <Table.DataCell>
                              <Button size="xsmall" variant="tertiary" onClick={() => onExcludeRow(note.rowIndex)}>
                                Fjern
                              </Button>
                            </Table.DataCell>
                          </Table.Row>
                        ))}
                </Table.Body>
              </Table>
              {tablePreviewPageCount > 1 && (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="xsmall"
                    variant="tertiary"
                    disabled={currentTablePreviewPage <= 1}
                    onClick={onPrevTablePreviewPage}
                  >
                    Forrige
                  </Button>
                  <span className="text-xs text-[var(--ax-text-subtle)]">
                    Side {currentTablePreviewPage} av {tablePreviewPageCount}
                  </span>
                  <Button
                    size="xsmall"
                    variant="tertiary"
                    disabled={currentTablePreviewPage >= tablePreviewPageCount}
                    onClick={onNextTablePreviewPage}
                  >
                    Neste
                  </Button>
                </div>
              )}
            </div>
          )}
          {!shouldImportAsAggregated && importStyle === 'sticky' && (
            <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
              {previewNotes.map((note) => (
                <div
                  key={`import-preview-note-${note.rowIndex}`}
                  className="rounded-md border border-[#e5cd69] bg-[#fff7ca] px-2 py-1.5 text-xs leading-4 text-[#4a3d00]"
                  title={note.text}
                >
                  <div className="mb-1.5 whitespace-pre-wrap break-words">{note.text}</div>
                  <div className="flex justify-end">
                    <Button size="xsmall" variant="tertiary" onClick={() => onExcludeRow(note.rowIndex)}>
                      Fjern
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {previewNotes.length === 0 && (
            <div className="rounded-md border border-dashed border-[var(--ax-border-neutral-subtle)] p-3 text-xs text-[var(--ax-text-subtle)]">
              Velg fil og kolonne. Du kan forhåndsvise innholdet før du importerer.
            </div>
          )}
        </aside>
      </section>
    </Modal.Body>
    <Modal.Footer>
      <Button
        onClick={onImport}
        size="small"
        loading={isSaving}
        disabled={headers.length === 0 || !contentColumn || (hasPrivacyFindings && !privacyReviewed)}
      >
        Importer
      </Button>
      <Button variant="secondary" size="small" onClick={onClose}>
        Avbryt
      </Button>
    </Modal.Footer>
  </Modal>
)

export default CanvasImportStickyCsvModal
