import { useCallback, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { PendingCanvasFrameDraft, PendingCsvStickyImport } from '../model/types.ts'

type UseCanvasPlacementStateParams = {
  setImportStickyProgressCurrent: Dispatch<SetStateAction<number>>
  setImportStickyProgressTotal: Dispatch<SetStateAction<number>>
}

type UseCanvasPlacementStateResult = {
  pendingFrameDraft: PendingCanvasFrameDraft | null
  setPendingFrameDraft: Dispatch<SetStateAction<PendingCanvasFrameDraft | null>>
  pendingFigureDragStart: { x: number; y: number } | null
  setPendingFigureDragStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>
  pendingCsvStickyImport: PendingCsvStickyImport | null
  setPendingCsvStickyImport: Dispatch<SetStateAction<PendingCsvStickyImport | null>>
  pendingFramePlacementLabel: string | null
  setPendingFramePlacementLabel: Dispatch<SetStateAction<string | null>>
  pendingFramePointer: { x: number; y: number } | null
  setPendingFramePointer: Dispatch<SetStateAction<{ x: number; y: number } | null>>
  pendingCsvStickyImportRef: MutableRefObject<PendingCsvStickyImport | null>
  queueFrameForPlacement: (draft: PendingCanvasFrameDraft, label: string) => void
  cancelPendingFramePlacement: () => void
  handleCsvImportPrepared: (params: { pendingImport: PendingCsvStickyImport; placementLabel: string }) => void
}

const useCanvasPlacementState = ({
  setImportStickyProgressCurrent,
  setImportStickyProgressTotal,
}: UseCanvasPlacementStateParams): UseCanvasPlacementStateResult => {
  const [pendingFrameDraft, setPendingFrameDraft] = useState<PendingCanvasFrameDraft | null>(null)
  const [pendingFigureDragStart, setPendingFigureDragStart] = useState<{ x: number; y: number } | null>(null)
  const [pendingCsvStickyImport, setPendingCsvStickyImport] = useState<PendingCsvStickyImport | null>(null)
  const [pendingFramePlacementLabel, setPendingFramePlacementLabel] = useState<string | null>(null)
  const [pendingFramePointer, setPendingFramePointer] = useState<{ x: number; y: number } | null>(null)
  const pendingCsvStickyImportRef = useRef<PendingCsvStickyImport | null>(null)

  const queueFrameForPlacement = useCallback((draft: PendingCanvasFrameDraft, label: string) => {
    setPendingFrameDraft(draft)
    setPendingFramePlacementLabel(label)
    setPendingFramePointer(null)
  }, [])

  const cancelPendingFramePlacement = useCallback(() => {
    setPendingFrameDraft(null)
    setPendingCsvStickyImport(null)
    pendingCsvStickyImportRef.current = null
    setPendingFramePlacementLabel(null)
    setPendingFramePointer(null)
    setImportStickyProgressCurrent(0)
    setImportStickyProgressTotal(0)
  }, [setImportStickyProgressCurrent, setImportStickyProgressTotal])

  const handleCsvImportPrepared = useCallback(
    ({ pendingImport, placementLabel }: { pendingImport: PendingCsvStickyImport; placementLabel: string }) => {
      pendingCsvStickyImportRef.current = pendingImport
      setPendingCsvStickyImport(pendingImport)
      setPendingFramePlacementLabel(placementLabel)
      setPendingFramePointer(null)
      setImportStickyProgressCurrent(0)
      setImportStickyProgressTotal(0)
    },
    [setImportStickyProgressCurrent, setImportStickyProgressTotal],
  )

  return {
    pendingFrameDraft,
    setPendingFrameDraft,
    pendingFigureDragStart,
    setPendingFigureDragStart,
    pendingCsvStickyImport,
    setPendingCsvStickyImport,
    pendingFramePlacementLabel,
    setPendingFramePlacementLabel,
    pendingFramePointer,
    setPendingFramePointer,
    pendingCsvStickyImportRef,
    queueFrameForPlacement,
    cancelPendingFramePlacement,
    handleCsvImportPrepared,
  }
}

export default useCanvasPlacementState
