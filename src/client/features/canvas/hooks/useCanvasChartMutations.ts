import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { mapGraphTypeToChart } from '../../oversikt'
import type { GraphType, OversiktChart } from '../../oversikt/model/types.ts'
import type { CanvasFrame } from '../model/types.ts'
import { CANVAS_QUERY_NAME, mapCanvasChartTypeToGraphType } from '../utils/canvasUtils.ts'

type SaveChartParams = {
  name: string
  graphType: GraphType
  sqlText: string
  width: number
  websiteId?: string
  dashboardId?: number
  addAsVariant?: boolean
  variantName?: string
  newVariants?: Array<{ name: string; sqlText: string }>
  targetQueryId?: number
  targetQueryName?: string
}

type UseCanvasChartMutationsParams = {
  frames: CanvasFrame[]
  activeCanvasCategoryId: number | null
  persistFrame: (frame: CanvasFrame) => Promise<CanvasFrame>
  setFrames: Dispatch<SetStateAction<CanvasFrame[]>>
  setSyncError: Dispatch<SetStateAction<string | null>>
  handleRemovePage: (id: string) => Promise<void>
}

type UseCanvasChartMutationsResult = {
  editChartFrameId: string | null
  editChartTarget: OversiktChart | null
  deleteChartTarget: OversiktChart | null
  chartMutationError: string | null
  savingEditChart: boolean
  deletingChart: boolean
  handleOpenEditChartModal: (frame: CanvasFrame) => void
  handleOpenDeleteChartModal: (frame: CanvasFrame) => void
  handleSaveEditedChart: (params: SaveChartParams) => Promise<void>
  handleDeleteChart: () => Promise<void>
  closeEditChartModal: () => void
  closeDeleteChartModal: () => void
}

const useCanvasChartMutations = ({
  frames,
  activeCanvasCategoryId,
  persistFrame,
  setFrames,
  setSyncError,
  handleRemovePage,
}: UseCanvasChartMutationsParams): UseCanvasChartMutationsResult => {
  const [editChartFrameId, setEditChartFrameId] = useState<string | null>(null)
  const [editChartTarget, setEditChartTarget] = useState<OversiktChart | null>(null)
  const [deleteChartFrameId, setDeleteChartFrameId] = useState<string | null>(null)
  const [deleteChartTarget, setDeleteChartTarget] = useState<OversiktChart | null>(null)
  const [chartMutationError, setChartMutationError] = useState<string | null>(null)
  const [savingEditChart, setSavingEditChart] = useState(false)
  const [deletingChart, setDeletingChart] = useState(false)

  const closeEditChartModal = useCallback(() => {
    setEditChartTarget(null)
    setEditChartFrameId(null)
    setChartMutationError(null)
  }, [])

  const closeDeleteChartModal = useCallback(() => {
    setDeleteChartTarget(null)
    setDeleteChartFrameId(null)
    setChartMutationError(null)
  }, [])

  const getOversiktChartFromCanvasFrame = useCallback(
    (frame: CanvasFrame): OversiktChart | null => {
      if (frame.kind !== 'chart' || !frame.chartSql || !frame.chartType) return null
      return {
        id: `canvas-chart-${frame.id}`,
        title: frame.label || 'Graf',
        type: frame.chartType,
        sql: frame.chartSql,
        width: 'full',
        graphId: frame.graphId ?? 0,
        graphType: mapCanvasChartTypeToGraphType(frame.chartType),
        queryId: frame.queryId ?? 1,
        queryName: CANVAS_QUERY_NAME,
        categoryId: frame.categoryId ?? activeCanvasCategoryId ?? 0,
      }
    },
    [activeCanvasCategoryId],
  )

  const handleOpenEditChartModal = useCallback(
    (frame: CanvasFrame) => {
      const chart = getOversiktChartFromCanvasFrame(frame)
      if (!chart) {
        setChartMutationError('Kunne ikke laste graf for redigering')
        return
      }
      setEditChartFrameId(frame.id)
      setEditChartTarget(chart)
      setChartMutationError(null)
    },
    [getOversiktChartFromCanvasFrame],
  )

  const handleOpenDeleteChartModal = useCallback(
    (frame: CanvasFrame) => {
      const chart = getOversiktChartFromCanvasFrame(frame)
      if (!chart) {
        setChartMutationError('Kunne ikke laste graf for sletting')
        return
      }
      setDeleteChartFrameId(frame.id)
      setDeleteChartTarget(chart)
      setChartMutationError(null)
    },
    [getOversiktChartFromCanvasFrame],
  )

  const handleSaveEditedChart = useCallback(
    async (params: SaveChartParams) => {
      if (!editChartFrameId) return
      const currentFrame = frames.find((frame) => frame.id === editChartFrameId)
      if (!currentFrame || currentFrame.kind !== 'chart') return

      const nextChartType = mapGraphTypeToChart(params.graphType)
      if (nextChartType === 'text' || nextChartType === 'title' || nextChartType === 'siteimprove') {
        setChartMutationError('Ugyldig graftype for canvas')
        return
      }

      const sqlText = params.sqlText.trim()
      if (!sqlText) {
        setChartMutationError('SQL-kode kan ikke være tom')
        return
      }

      const updatedFrame: CanvasFrame = {
        ...currentFrame,
        label: params.name.trim() || currentFrame.label,
        chartType: nextChartType,
        chartSql: sqlText,
        websiteId: params.websiteId?.trim() || currentFrame.websiteId,
        refreshNonce: currentFrame.refreshNonce + 1,
      }

      try {
        setSavingEditChart(true)
        setSyncError(null)
        setChartMutationError(null)
        const persistedFrame = await persistFrame(updatedFrame)
        setFrames((prev) => prev.map((frame) => (frame.id === editChartFrameId ? persistedFrame : frame)))
        closeEditChartModal()
      } catch (error) {
        setChartMutationError(error instanceof Error ? error.message : 'Kunne ikke oppdatere graf')
      } finally {
        setSavingEditChart(false)
      }
    },
    [closeEditChartModal, editChartFrameId, frames, persistFrame, setFrames, setSyncError],
  )

  const handleDeleteChart = useCallback(async () => {
    if (!deleteChartFrameId) return
    try {
      setDeletingChart(true)
      setChartMutationError(null)
      await handleRemovePage(deleteChartFrameId)
      closeDeleteChartModal()
    } catch (error) {
      setChartMutationError(error instanceof Error ? error.message : 'Kunne ikke slette graf')
    } finally {
      setDeletingChart(false)
    }
  }, [closeDeleteChartModal, deleteChartFrameId, handleRemovePage])

  return useMemo(
    () => ({
      editChartFrameId,
      editChartTarget,
      deleteChartTarget,
      chartMutationError,
      savingEditChart,
      deletingChart,
      handleOpenEditChartModal,
      handleOpenDeleteChartModal,
      handleSaveEditedChart,
      handleDeleteChart,
      closeEditChartModal,
      closeDeleteChartModal,
    }),
    [
      chartMutationError,
      closeDeleteChartModal,
      closeEditChartModal,
      deleteChartTarget,
      deletingChart,
      editChartFrameId,
      editChartTarget,
      handleDeleteChart,
      handleOpenDeleteChartModal,
      handleOpenEditChartModal,
      handleSaveEditedChart,
      savingEditChart,
    ],
  )
}

export default useCanvasChartMutations
export type { SaveChartParams }
