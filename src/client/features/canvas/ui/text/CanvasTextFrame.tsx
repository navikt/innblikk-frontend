import { Button, Table } from '@navikt/ds-react'
import { markdownToHtml } from '../../utils/canvasMarkdown.ts'
import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'

type CanvasTextFrameProps = {
  id: string
  textContent?: string
  tableHeaders?: string[]
  tableRows?: string[][]
  isEditing: boolean
  isInteractionLocked?: boolean
  isLockedByOther?: boolean
  lockOwnerLabel?: string | null
  tableRowsPerPage: number
  tablePage: number
  onTablePageChange: (id: string, nextPage: number) => void
  onChange: (id: string, nextValue: string) => void
  onBlur: (id: string) => void
  onStartEditing: (id: string) => void
}

const CanvasTextFrame = ({
  id,
  textContent,
  tableHeaders,
  tableRows,
  isEditing,
  isInteractionLocked: _isInteractionLocked = false,
  isLockedByOther = false,
  lockOwnerLabel = null,
  tableRowsPerPage,
  tablePage,
  onTablePageChange,
  onChange,
  onBlur,
  onStartEditing,
}: CanvasTextFrameProps) => {
  const hasTable = Array.isArray(tableHeaders) && tableHeaders.length > 0 && Array.isArray(tableRows)
  const textValue = textContent || ''
  const textPreview = textValue.trim() || 'Skriv tekst'
  const textEditorLabelId = `canvas-text-editor-label-${id}`
  const textEditorDescriptionId = `canvas-text-editor-description-${id}`

  if (hasTable) {
    const rows = tableRows ?? []
    const headers = tableHeaders ?? []
    const totalPages = Math.max(1, Math.ceil(rows.length / tableRowsPerPage))
    const currentPage = Math.min(tablePage, totalPages)
    const pageStart = (currentPage - 1) * tableRowsPerPage
    const visibleRows = rows.slice(pageStart, pageStart + tableRowsPerPage)

    return (
      <div className="h-full overflow-auto px-2 pb-2">
        <div className="space-y-2" onMouseDown={(event) => event.stopPropagation()}>
          <Table size="small" zebraStripes className="w-full">
            <Table.Header>
              <Table.Row>
                {headers.map((header, headerIndex) => (
                  <Table.HeaderCell key={`canvas-table-header-${id}-${headerIndex}`}>{header}</Table.HeaderCell>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {visibleRows.map((row, rowIndex) => (
                <Table.Row key={`canvas-table-row-${id}-${pageStart + rowIndex}`}>
                  {headers.map((_, columnIndex) => (
                    <Table.DataCell key={`canvas-table-cell-${id}-${pageStart + rowIndex}-${columnIndex}`}>
                      {row[columnIndex] || ''}
                    </Table.DataCell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="xsmall"
                variant="tertiary"
                disabled={currentPage <= 1}
                onClick={() => onTablePageChange(id, Math.max(1, currentPage - 1))}
              >
                Forrige
              </Button>
              <span className="text-xs text-[var(--ax-text-subtle)]">
                Side {currentPage} av {totalPages}
              </span>
              <Button
                size="xsmall"
                variant="tertiary"
                disabled={currentPage >= totalPages}
                onClick={() => onTablePageChange(id, Math.min(totalPages, currentPage + 1))}
              >
                Neste
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className="h-full overflow-auto px-2 pb-2">
        <span id={textEditorLabelId} className="sr-only">
          Tekst
        </span>
        <span id={textEditorDescriptionId} className="sr-only">
          Nåværende tekst: {textPreview}
        </span>
        <textarea
          value={textValue}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.currentTarget.blur()
          }}
          lang="nb-NO"
          placeholder="Skriv tekst"
          aria-labelledby={textEditorLabelId}
          aria-describedby={textEditorDescriptionId}
          className="m-0 block min-h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-[var(--ax-text-default)] align-top outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
          style={{ fontSize: '18px', lineHeight: 1.45, fontWeight: 500 }}
          autoFocus
        />
      </div>
    )
  }

  const markdownClassName =
    'w-full text-left text-[var(--ax-text-default)] [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mb-2 [&_h1]:mt-0 [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-0 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-0 [&_h3]:font-semibold [&_ol]:my-0 [&_ol]:list-decimal [&_ol]:pl-[1.1em] [&_ol>li+li]:mt-2 [&_p]:m-0 [&_p+p]:mt-3 [&_strong]:font-semibold [&_ul]:my-0 [&_ul]:list-disc [&_ul]:pl-[1.1em] [&_ul>li+li]:mt-2'
  const renderedMarkdown = markdownToHtml(textPreview)

  return (
    <div className="relative h-full overflow-auto px-2 pb-2">
      {_isInteractionLocked ? (
        <div
          className={`h-full overflow-auto bg-transparent p-0 ${markdownClassName}`}
          style={{ fontSize: '18px', lineHeight: 1.45, fontWeight: 500 }}
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      ) : (
        <div
          tabIndex={0}
          data-canvas-edit-trigger="true"
          className={`m-0 block h-full w-full cursor-text overflow-auto bg-transparent p-0 [appearance:none] ${markdownClassName}`}
          style={{ fontSize: '18px', lineHeight: 1.45, fontWeight: 500 }}
          onDoubleClick={() => onStartEditing(id)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onStartEditing(id)
          }}
          aria-description="Dobbeltklikk eller trykk Enter for å redigere teksten"
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      )}
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} />}
    </div>
  )
}

export default CanvasTextFrame
