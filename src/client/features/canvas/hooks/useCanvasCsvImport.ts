import { useCallback, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type {
  CanvasCsvImportRow,
  CanvasCsvImportStyle,
  CanvasCsvTableMode,
  CanvasPrivacyFinding,
  PendingCsvStickyImport,
} from '../model/types.ts'
import {
  IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE,
  buildNumericRatingSummaryText,
  findPrivacyPatternNames,
  formatRatingValue,
  parseCsvImportText,
  summarizeCategoricalValues,
  summarizeNumericRatings,
} from '../utils/canvasUtils.ts'

type CanvasCsvImportPreviewNote = {
  rowIndex: number
  text: string
}

type CanvasCsvImportSummaryRow = {
  value: string
  count: number
  percentage: number
}

type CanvasPreparedCsvImport = {
  pendingImport: PendingCsvStickyImport
  placementLabel: string
}

type UseCanvasCsvImportParams = {
  onImportPrepared: (payload: CanvasPreparedCsvImport) => void
}

const useCanvasCsvImport = ({ onImportPrepared }: UseCanvasCsvImportParams) => {
  const [importStickyCsvFileName, setImportStickyCsvFileName] = useState('')
  const [importStickyCsvHeaders, setImportStickyCsvHeaders] = useState<string[]>([])
  const [importStickyCsvRows, setImportStickyCsvRows] = useState<CanvasCsvImportRow[]>([])
  const [importStickyContentColumn, setImportStickyContentColumn] = useState('')
  const [importStickyStyle, setImportStickyStyle] = useState<CanvasCsvImportStyle>('sticky')
  const [importStickyTableMode, setImportStickyTableMode] = useState<CanvasCsvTableMode>('rows')
  const [importStickyTablePreviewPage, setImportStickyTablePreviewPage] = useState(1)
  const [importStickySectionTitle, setImportStickySectionTitle] = useState('')
  const [importStickyExcludedRowIndexes, setImportStickyExcludedRowIndexes] = useState<number[]>([])
  const [importStickyPrivacyReviewed, setImportStickyPrivacyReviewed] = useState(false)
  const [importStickyCsvError, setImportStickyCsvError] = useState<string | null>(null)
  const importStickyCsvFileInputRef = useRef<HTMLInputElement | null>(null)

  const importStickyPreviewNotes = useMemo(
    () =>
      importStickyContentColumn
        ? importStickyCsvRows
            .map((row, index) => ({
              rowIndex: index,
              text: (row[importStickyContentColumn] || '').trim(),
            }))
            .filter((item) => Boolean(item.text))
            .filter((item) => !importStickyExcludedRowIndexes.includes(item.rowIndex))
        : [],
    [importStickyContentColumn, importStickyCsvRows, importStickyExcludedRowIndexes],
  )

  const importStickyNumericSummary = useMemo(
    () => summarizeNumericRatings(importStickyPreviewNotes.map((item) => item.text)),
    [importStickyPreviewNotes],
  )

  const canChooseNonNumericImportStyle = importStickyPreviewNotes.length > 0 && !importStickyNumericSummary
  const shouldImportStickyAsAggregated = Boolean(importStickyNumericSummary)
  const importStickyCategoricalSummaryRows = useMemo(
    () => summarizeCategoricalValues(importStickyPreviewNotes.map((item) => item.text)),
    [importStickyPreviewNotes],
  )
  const importStickyNumericSummaryRows = useMemo<CanvasCsvImportSummaryRow[]>(
    () =>
      importStickyNumericSummary
        ? importStickyNumericSummary.distribution.map((item) => ({
            value: formatRatingValue(item.value),
            count: item.count,
            percentage: item.percentage,
          }))
        : [],
    [importStickyNumericSummary],
  )
  const importStickyPrivacyFindings = useMemo<CanvasPrivacyFinding[]>(
    () =>
      importStickyPreviewNotes
        .map((item) => ({
          rowIndex: item.rowIndex,
          text: item.text,
          patternNames: findPrivacyPatternNames(item.text),
        }))
        .filter((item) => item.patternNames.length > 0),
    [importStickyPreviewNotes],
  )
  const hasImportStickyPrivacyFindings = importStickyPrivacyFindings.length > 0
  const importStickyTablePreviewPageCount = Math.max(
    1,
    Math.ceil(
      (shouldImportStickyAsAggregated
        ? importStickyNumericSummaryRows.length
        : importStickyStyle === 'table' && importStickyTableMode === 'summary'
          ? importStickyCategoricalSummaryRows.length
          : importStickyPreviewNotes.length) / IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE,
    ),
  )
  const currentImportStickyTablePreviewPage = Math.min(importStickyTablePreviewPage, importStickyTablePreviewPageCount)
  const importStickyTablePreviewNoteRows = useMemo<CanvasCsvImportPreviewNote[]>(() => {
    const startIndex = (currentImportStickyTablePreviewPage - 1) * IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE
    return importStickyPreviewNotes.slice(startIndex, startIndex + IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE)
  }, [currentImportStickyTablePreviewPage, importStickyPreviewNotes])
  const importStickyTablePreviewSummaryRows = useMemo<CanvasCsvImportSummaryRow[]>(() => {
    const startIndex = (currentImportStickyTablePreviewPage - 1) * IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE
    return importStickyCategoricalSummaryRows.slice(startIndex, startIndex + IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE)
  }, [currentImportStickyTablePreviewPage, importStickyCategoricalSummaryRows])
  const importStickyTablePreviewNumericSummaryRows = useMemo<CanvasCsvImportSummaryRow[]>(() => {
    const startIndex = (currentImportStickyTablePreviewPage - 1) * IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE
    return importStickyNumericSummaryRows.slice(startIndex, startIndex + IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE)
  }, [currentImportStickyTablePreviewPage, importStickyNumericSummaryRows])

  const clearImportStickyCsvError = useCallback(() => {
    setImportStickyCsvError(null)
  }, [])

  const handleClearImportStickyCsvFile = useCallback(() => {
    setImportStickyCsvFileName('')
    setImportStickyCsvHeaders([])
    setImportStickyCsvRows([])
    setImportStickyContentColumn('')
    setImportStickyStyle('sticky')
    setImportStickyTableMode('rows')
    setImportStickyTablePreviewPage(1)
    setImportStickySectionTitle('')
    setImportStickyExcludedRowIndexes([])
    setImportStickyPrivacyReviewed(false)
    setImportStickyCsvError(null)
    if (importStickyCsvFileInputRef.current) {
      importStickyCsvFileInputRef.current.value = ''
    }
  }, [])

  const handleImportStickyCsvFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files
      if (!selectedFiles || selectedFiles.length === 0) return
      if (selectedFiles.length > 1) {
        setImportStickyCsvError('Velg kun én CSV-fil.')
        return
      }
      const selectedFile = selectedFiles[0]
      if (!selectedFile) return

      try {
        const content = await selectedFile.text()
        const parsed = parseCsvImportText(content)
        if (parsed.headers.length === 0) {
          setImportStickyCsvError(parsed.error ?? 'Filen ser ikke ut som en CSV med kolonneoverskrifter.')
          setImportStickyCsvFileName(selectedFile.name)
          setImportStickyCsvHeaders([])
          setImportStickyCsvRows([])
          setImportStickyContentColumn('')
          return
        }

        setImportStickyCsvFileName(selectedFile.name)
        setImportStickyCsvHeaders(parsed.headers)
        setImportStickyCsvRows(parsed.rows)
        setImportStickyExcludedRowIndexes([])
        setImportStickyStyle('sticky')
        setImportStickyTableMode('rows')
        setImportStickyTablePreviewPage(1)
        setImportStickyPrivacyReviewed(false)
        const resolvedContentColumn =
          importStickyContentColumn && parsed.headers.includes(importStickyContentColumn)
            ? importStickyContentColumn
            : (parsed.headers[0] ?? '')
        setImportStickyContentColumn(resolvedContentColumn)
        setImportStickySectionTitle(resolvedContentColumn)
        setImportStickyCsvError(parsed.rows.length === 0 ? 'CSV-filen har ingen rader med innhold.' : null)
      } catch {
        setImportStickyCsvError('Kunne ikke lese CSV-filen.')
        setImportStickyCsvFileName('')
        setImportStickyCsvHeaders([])
        setImportStickyCsvRows([])
        setImportStickyContentColumn('')
        setImportStickyStyle('sticky')
        setImportStickyTableMode('rows')
        setImportStickyTablePreviewPage(1)
        setImportStickyExcludedRowIndexes([])
        setImportStickyPrivacyReviewed(false)
      }
    },
    [importStickyContentColumn],
  )

  const handleContentColumnChange = useCallback(
    (nextColumn: string) => {
      setImportStickyContentColumn(nextColumn)
      setImportStickySectionTitle(nextColumn)
      setImportStickyExcludedRowIndexes([])
      setImportStickyPrivacyReviewed(false)
      setImportStickyTableMode('rows')
      setImportStickyTablePreviewPage(1)
      if (importStickyCsvError) setImportStickyCsvError(null)
    },
    [importStickyCsvError],
  )

  const handleImportStyleChange = useCallback(
    (nextStyle: CanvasCsvImportStyle) => {
      setImportStickyStyle(nextStyle)
      setImportStickyTableMode('rows')
      setImportStickyTablePreviewPage(1)
      if (importStickyCsvError) setImportStickyCsvError(null)
    },
    [importStickyCsvError],
  )

  const handleTableModeChange = useCallback((nextMode: CanvasCsvTableMode) => {
    setImportStickyTableMode(nextMode)
    setImportStickyTablePreviewPage(1)
  }, [])

  const handlePrevTablePreviewPage = useCallback(() => {
    setImportStickyTablePreviewPage((current) => Math.max(1, current - 1))
  }, [])

  const handleNextTablePreviewPage = useCallback(() => {
    setImportStickyTablePreviewPage((current) => Math.min(importStickyTablePreviewPageCount, current + 1))
  }, [importStickyTablePreviewPageCount])

  const handleExcludeRow = useCallback((rowIndex: number) => {
    setImportStickyExcludedRowIndexes((current) => (current.includes(rowIndex) ? current : [...current, rowIndex]))
    setImportStickyPrivacyReviewed(false)
  }, [])

  const handleImportStickyCsv = useCallback(() => {
    const contentColumn =
      importStickyContentColumn && importStickyCsvHeaders.includes(importStickyContentColumn)
        ? importStickyContentColumn
        : ''
    if (!contentColumn) {
      setImportStickyCsvError('Velg kolonnen som skal importeres.')
      return false
    }

    if (importStickyCsvRows.length === 0) {
      setImportStickyCsvError('CSV-filen har ingen rader med innhold.')
      return false
    }

    const noteTexts = importStickyPreviewNotes.map((item) => item.text)
    if (noteTexts.length === 0) {
      setImportStickyCsvError('Fant ingen rader med innhold i valgt kolonne.')
      return false
    }
    if (hasImportStickyPrivacyFindings && !importStickyPrivacyReviewed) {
      setImportStickyCsvError('Mulige personopplysninger funnet. Gå gjennom treffene før import.')
      return false
    }

    const numericSummary = summarizeNumericRatings(noteTexts)
    const aggregatedRatingsText = numericSummary ? buildNumericRatingSummaryText(numericSummary) : undefined
    const categoricalSummaryRows = summarizeCategoricalValues(noteTexts)
    const tableHeaders = numericSummary
      ? [contentColumn, 'Antall', 'Andel']
      : importStickyStyle === 'table'
        ? importStickyTableMode === 'summary'
          ? [contentColumn, 'Antall', 'Andel']
          : [contentColumn]
        : undefined
    const tableRows = numericSummary
      ? numericSummary.distribution.map((item) => [
          formatRatingValue(item.value),
          item.count.toLocaleString('nb-NO'),
          `${item.percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %`,
        ])
      : importStickyStyle === 'table'
        ? importStickyTableMode === 'summary'
          ? categoricalSummaryRows.map((item) => [
              item.value,
              item.count.toLocaleString('nb-NO'),
              `${item.percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %`,
            ])
          : noteTexts.map((text) => [text])
        : undefined

    setImportStickyCsvError(null)
    onImportPrepared({
      pendingImport: {
        sectionTitle: importStickySectionTitle.trim(),
        noteTexts,
        aggregatedRatingsText,
        tableHeaders,
        tableRows,
      },
      placementLabel:
        tableHeaders && tableRows ? 'tabell' : aggregatedRatingsText ? 'aggregert vurdering' : 'CSV-lapper',
    })
    return true
  }, [
    hasImportStickyPrivacyFindings,
    importStickyContentColumn,
    importStickyCsvHeaders,
    importStickyCsvRows,
    importStickyPreviewNotes,
    importStickyPrivacyReviewed,
    importStickySectionTitle,
    importStickyStyle,
    importStickyTableMode,
    onImportPrepared,
  ])

  return {
    importStickyCsvFileInputRef,
    importStickyCsvFileName,
    importStickyCsvHeaders,
    importStickyCsvRows,
    importStickyContentColumn,
    importStickyStyle,
    importStickyTableMode,
    importStickySectionTitle,
    importStickyCsvError,
    importStickyPreviewNotes,
    importStickyNumericSummary,
    canChooseNonNumericImportStyle,
    shouldImportStickyAsAggregated,
    importStickyCategoricalSummaryRows,
    importStickyNumericSummaryRows,
    importStickyPrivacyFindings,
    hasImportStickyPrivacyFindings,
    importStickyTablePreviewNoteRows,
    importStickyTablePreviewSummaryRows,
    importStickyTablePreviewNumericSummaryRows,
    importStickyTablePreviewPageCount,
    currentImportStickyTablePreviewPage,
    importStickyPrivacyReviewed,
    setImportStickyPrivacyReviewed,
    clearImportStickyCsvError,
    handleClearImportStickyCsvFile,
    handleImportStickyCsvFileChange,
    handleContentColumnChange,
    handleImportStyleChange,
    handleTableModeChange,
    handlePrevTablePreviewPage,
    handleNextTablePreviewPage,
    handleExcludeRow,
    handleImportStickyCsv,
  }
}

export default useCanvasCsvImport
