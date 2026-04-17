import { Button, Table } from '@navikt/ds-react'
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
  isInteractionLocked = false,
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

  if (hasTable) {
    const rows = tableRows ?? []
    const headers = tableHeaders ?? []
    const totalPages = Math.max(1, Math.ceil(rows.length / tableRowsPerPage))
    const currentPage = Math.min(tablePage, totalPages)
    const pageStart = (currentPage - 1) * tableRowsPerPage
    const visibleRows = rows.slice(pageStart, pageStart + tableRowsPerPage)

    return (
      <div className="h-full overflow-auto px-2 pb-2" tabIndex={isInteractionLocked ? -1 : undefined}>
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
        <textarea
          value={textContent || ''}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          lang="nb-NO"
          placeholder="Skriv tekst"
          className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
          style={{ fontSize: '22px', lineHeight: 1.3, fontWeight: 500 }}
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-auto px-2 pb-2" tabIndex={isInteractionLocked ? -1 : undefined}>
      <div
        className="h-full cursor-text overflow-auto whitespace-pre-wrap break-words text-[var(--ax-text-default)]"
        style={{ fontSize: '22px', lineHeight: 1.3, fontWeight: 500 }}
        onClick={() => onStartEditing(id)}
        tabIndex={isInteractionLocked ? -1 : undefined}
      >
        {textContent || 'Skriv tekst'}
      </div>
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} />}
    </div>
  )
}

export default CanvasTextFrame
