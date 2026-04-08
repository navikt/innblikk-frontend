import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionMenu, Alert, Button, Link, Modal, Select, Switch, TextField, Textarea } from '@navikt/ds-react'
import { Edit2, Move, Plus, RefreshCw, Trash2 } from 'lucide-react'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import { getStoredPeriod, savePeriodPreference } from '../../../shared/lib/utils.ts'
import { DashboardWidget } from '../../dashboard'
import { mapGraphTypeToChart } from '../../oversikt'
import {
  createCategory,
  createGraph,
  createQuery,
  deleteGraph,
  fetchCategories,
  fetchDashboards,
  fetchGraphs,
  fetchQueries,
  updateQuery,
} from '../../oversikt/api/oversiktApi.ts'

type CanvasChartType = 'line' | 'bar' | 'pie' | 'table'
type CanvasPayloadKind = 'website' | 'heading' | 'text' | 'sticky' | 'chart' | 'connection'

type CanvasFrame = {
  id: string
  kind: 'website' | 'heading' | 'text' | 'sticky' | 'chart'
  targetUrl?: string
  renderWebsite?: boolean
  headingText?: string
  textContent?: string
  chartType?: CanvasChartType
  chartSql?: string
  label: string
  x: number
  y: number
  width?: number
  height?: number
  categoryId?: number
  graphId?: number
  queryId?: number
  refreshNonce: number
}

type CanvasConnection = {
  id: string
  fromFrameId?: string
  toFrameId?: string
  fromGraphId?: number
  toGraphId?: number
  categoryId?: number
  graphId?: number
  queryId?: number
}

type CanvasConfigPayload = {
  kind: CanvasPayloadKind
  x: number
  y: number
  width?: number
  height?: number
  targetUrl?: string
  renderWebsite?: boolean
  headingText?: string
  textContent?: string
  chartType?: CanvasChartType
  chartSql?: string
  label: string
  fromFrameId?: string
  toFrameId?: string
  fromGraphId?: number
  toGraphId?: number
}

type CanvasChartOption = {
  id: string
  title: string
  chartType: CanvasChartType
  sql: string
}

const CANVAS_DASHBOARD_TOKEN = '[canvas]'
const CANVAS_QUERY_NAME = 'canvas-config'

const normalizeInputToTargetUrl = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('/')) {
    try {
      const url = new URL(trimmed, 'https://www.nav.no/')
      url.hash = ''
      return url.toString()
    } catch {
      return null
    }
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

const getComparableUrl = (value: string): string => {
  try {
    const url = new URL(value)
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
    return `${url.origin}${pathname}${url.search}`
  } catch {
    return value
  }
}

const getFrameLabel = (targetUrl: string): string => {
  try {
    const url = new URL(targetUrl)
    return `${url.hostname}${url.pathname}${url.search}`
  } catch {
    return targetUrl
  }
}

const createPreviewProxySrc = (targetUrl: string): string => {
  return `/api/clickmap-preview?url=${encodeURIComponent(targetUrl)}`
}

const serializeCanvasConfig = (frame: CanvasConfigPayload): string => {
  const json = JSON.stringify(frame)
  const escaped = json.replace(/'/g, "''")
  return `SELECT '${escaped}' AS canvas_config`
}

const buildCanvasStorageGraphName = (frame: CanvasFrame): string => `canvas:${frame.kind}:${frame.id}`.slice(0, 200)
const buildCanvasConnectionStorageGraphName = (connection: CanvasConnection): string =>
  `canvas:connection:${connection.id}`.slice(0, 200)

const isCanvasPayloadKind = (value: unknown): value is CanvasPayloadKind =>
  value === 'website' ||
  value === 'heading' ||
  value === 'text' ||
  value === 'sticky' ||
  value === 'chart' ||
  value === 'connection'

const isRenderableCanvasFrameKind = (value: unknown): value is CanvasFrame['kind'] =>
  value === 'website' || value === 'heading' || value === 'text' || value === 'sticky' || value === 'chart'

const isCanvasChartType = (value: unknown): value is CanvasChartType =>
  value === 'line' || value === 'bar' || value === 'pie' || value === 'table'

const parseCanvasConfig = (raw: string): CanvasConfigPayload | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_config\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasConfigPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (!isCanvasPayloadKind(parsed.kind)) return null
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
    if (!parsed.label || typeof parsed.label !== 'string') return null

    return {
      kind: parsed.kind,
      x: Number(parsed.x),
      y: Number(parsed.y),
      width: Number.isFinite(parsed.width) ? Number(parsed.width) : undefined,
      height: Number.isFinite(parsed.height) ? Number(parsed.height) : undefined,
      targetUrl: typeof parsed.targetUrl === 'string' ? parsed.targetUrl : undefined,
      renderWebsite: typeof parsed.renderWebsite === 'boolean' ? parsed.renderWebsite : undefined,
      headingText: typeof parsed.headingText === 'string' ? parsed.headingText : undefined,
      textContent: typeof parsed.textContent === 'string' ? parsed.textContent : undefined,
      chartType: isCanvasChartType(parsed.chartType) ? parsed.chartType : undefined,
      chartSql: typeof parsed.chartSql === 'string' ? parsed.chartSql : undefined,
      label: parsed.label,
      fromFrameId: typeof parsed.fromFrameId === 'string' ? parsed.fromFrameId : undefined,
      toFrameId: typeof parsed.toFrameId === 'string' ? parsed.toFrameId : undefined,
      fromGraphId: Number.isFinite(parsed.fromGraphId) ? Number(parsed.fromGraphId) : undefined,
      toGraphId: Number.isFinite(parsed.toGraphId) ? Number(parsed.toGraphId) : undefined,
    }
  } catch {
    return null
  }
}

const Canvas = () => {
  const routeContext = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const projectId = Number(params.get('projectId'))
    const dashboardId = Number(params.get('dashboardId'))
    return {
      websiteId: params.get('websiteId') || '',
      projectId: Number.isFinite(projectId) ? projectId : null,
      dashboardId: Number.isFinite(dashboardId) ? dashboardId : null,
    }
  }, [])
  const { websiteId, projectId, dashboardId } = routeContext
  const canPersistToDashboard = projectId !== null && dashboardId !== null
  const [canvasTitle, setCanvasTitle] = useState('Canvas')
  const [period, setPeriodState] = useState<string>(() =>
    getStoredPeriod(new URLSearchParams(window.location.search).get('period')),
  )
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)
  const [frames, setFrames] = useState<CanvasFrame[]>([])
  const [connections, setConnections] = useState<CanvasConnection[]>([])
  const [connectSourceFrameId, setConnectSourceFrameId] = useState<string | null>(null)
  const [isAddPageModalOpen, setIsAddPageModalOpen] = useState(false)
  const [isAddHeadingModalOpen, setIsAddHeadingModalOpen] = useState(false)
  const [isAddTextModalOpen, setIsAddTextModalOpen] = useState(false)
  const [isAddStickyModalOpen, setIsAddStickyModalOpen] = useState(false)
  const [isAddChartModalOpen, setIsAddChartModalOpen] = useState(false)
  const [isEditWebsiteModalOpen, setIsEditWebsiteModalOpen] = useState(false)
  const [editWebsiteFrameId, setEditWebsiteFrameId] = useState<string | null>(null)
  const [editWebsitePathInput, setEditWebsitePathInput] = useState('')
  const [editWebsiteRenderEnabled, setEditWebsiteRenderEnabled] = useState(true)
  const [newPagePathInput, setNewPagePathInput] = useState('')
  const [addPageError, setAddPageError] = useState<string | null>(null)
  const [editWebsiteError, setEditWebsiteError] = useState<string | null>(null)
  const [headingTextInput, setHeadingTextInput] = useState('')
  const [addHeadingError, setAddHeadingError] = useState<string | null>(null)
  const [textContentInput, setTextContentInput] = useState('')
  const [addTextError, setAddTextError] = useState<string | null>(null)
  const [stickyContentInput, setStickyContentInput] = useState('')
  const [addStickyError, setAddStickyError] = useState<string | null>(null)
  const [chartOptions, setChartOptions] = useState<CanvasChartOption[]>([])
  const [selectedChartOptionId, setSelectedChartOptionId] = useState('')
  const [isLoadingChartOptions, setIsLoadingChartOptions] = useState(false)
  const [addChartError, setAddChartError] = useState<string | null>(null)
  const [dragState, setDragState] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [resizeState, setResizeState] = useState<{
    id: string
    startX: number
    startY: number
    startWidth: number
    startHeight: number
  } | null>(null)
  const [canvasCategoryId, setCanvasCategoryId] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [, setIsLoadingCanvasItems] = useState(false)
  const [isSavingCanvasItem, setIsSavingCanvasItem] = useState(false)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)

  const setPeriod = (nextPeriod: string) => {
    setPeriodState(nextPeriod)
    savePeriodPreference(nextPeriod)
  }

  const dashboardWidgetFilters = useMemo(
    () => ({
      urlFilters: [],
      dateRange: period,
      pathOperator: 'equals',
      metricType: 'visitors' as const,
      customStartDate,
      customEndDate,
    }),
    [period, customStartDate, customEndDate],
  )

  const frameItems = useMemo(
    () =>
      frames.map((frame) => ({
        ...frame,
        src: frame.targetUrl ? createPreviewProxySrc(frame.targetUrl) : '',
      })),
    [frames],
  )

  const ensureCanvasCategory = useCallback(async (): Promise<number | null> => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) return null
    if (canvasCategoryId) return canvasCategoryId

    const categories = await fetchCategories(projectId, dashboardId)
    if (categories.length > 0) {
      const firstCategoryId = categories[0].id
      setCanvasCategoryId(firstCategoryId)
      return firstCategoryId
    }

    const createdCategory = await createCategory(projectId, dashboardId, 'Fane 1')
    setCanvasCategoryId(createdCategory.id)
    return createdCategory.id
  }, [canPersistToDashboard, projectId, dashboardId, canvasCategoryId])

  const persistFrame = useCallback(
    async (frame: CanvasFrame): Promise<CanvasFrame> => {
      if (!canPersistToDashboard || projectId === null || dashboardId === null) return frame

      const categoryId = frame.categoryId || (await ensureCanvasCategory())
      if (!categoryId) return frame

      const payload: CanvasConfigPayload = {
        kind: frame.kind,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        targetUrl: frame.targetUrl,
        renderWebsite: frame.renderWebsite,
        headingText: frame.headingText,
        textContent: frame.textContent,
        chartType: frame.chartType,
        chartSql: frame.chartSql,
        label: frame.label,
      }
      const serialized = serializeCanvasConfig(payload)

      if (!frame.graphId) {
        const createdGraph = await createGraph(projectId, dashboardId, categoryId, {
          name: buildCanvasStorageGraphName(frame),
          graphType: 'TEXT',
          width: 100,
          description: CANVAS_DASHBOARD_TOKEN,
        })
        const createdQuery = await createQuery(projectId, dashboardId, categoryId, createdGraph.id, {
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
        })
        return {
          ...frame,
          categoryId,
          graphId: createdGraph.id,
          queryId: createdQuery.id,
        }
      }

      if (frame.queryId) {
        await updateQuery(projectId, dashboardId, categoryId, frame.graphId, frame.queryId, {
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
        })
        return frame
      }

      const createdQuery = await createQuery(projectId, dashboardId, categoryId, frame.graphId, {
        name: CANVAS_QUERY_NAME,
        sqlText: serialized,
      })
      return {
        ...frame,
        categoryId,
        queryId: createdQuery.id,
      }
    },
    [canPersistToDashboard, projectId, dashboardId, ensureCanvasCategory],
  )

  const persistConnection = useCallback(
    async (connection: CanvasConnection): Promise<CanvasConnection> => {
      if (!canPersistToDashboard || projectId === null || dashboardId === null) return connection

      const categoryId = connection.categoryId || (await ensureCanvasCategory())
      if (!categoryId) return connection

      const payload: CanvasConfigPayload = {
        kind: 'connection',
        x: 0,
        y: 0,
        label: 'Connection',
        fromFrameId: connection.fromFrameId,
        toFrameId: connection.toFrameId,
        fromGraphId: connection.fromGraphId,
        toGraphId: connection.toGraphId,
      }
      const serialized = serializeCanvasConfig(payload)

      if (!connection.graphId) {
        const createdGraph = await createGraph(projectId, dashboardId, categoryId, {
          name: buildCanvasConnectionStorageGraphName(connection),
          graphType: 'TEXT',
          width: 100,
          description: CANVAS_DASHBOARD_TOKEN,
        })
        const createdQuery = await createQuery(projectId, dashboardId, categoryId, createdGraph.id, {
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
        })
        return {
          ...connection,
          categoryId,
          graphId: createdGraph.id,
          queryId: createdQuery.id,
        }
      }

      if (connection.queryId) {
        await updateQuery(projectId, dashboardId, categoryId, connection.graphId, connection.queryId, {
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
        })
        return connection
      }

      const createdQuery = await createQuery(projectId, dashboardId, categoryId, connection.graphId, {
        name: CANVAS_QUERY_NAME,
        sqlText: serialized,
      })
      return {
        ...connection,
        categoryId,
        queryId: createdQuery.id,
      }
    },
    [canPersistToDashboard, projectId, dashboardId, ensureCanvasCategory],
  )

  useEffect(() => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) return

    let isActive = true
    const loadCanvasItems = async () => {
      setIsLoadingCanvasItems(true)
      setSyncError(null)
      try {
        const categories = await fetchCategories(projectId, dashboardId)
        if (!isActive) return
        if (categories.length > 0) {
          setCanvasCategoryId(categories[0].id)
        }

        const framesFromStorage: CanvasFrame[] = []
        const connectionsFromStorage: CanvasConnection[] = []
        for (const category of categories) {
          const graphs = await fetchGraphs(projectId, dashboardId, category.id)
          for (const graph of graphs) {
            if (graph.graphType !== 'TEXT') continue
            if ((graph.description || '').toLowerCase().split(/\s+/).includes(CANVAS_DASHBOARD_TOKEN) === false)
              continue

            const queries = await fetchQueries(projectId, dashboardId, category.id, graph.id)
            const configQuery = queries.find((query) => query.name === CANVAS_QUERY_NAME) ?? queries[0]
            const parsedConfig = parseCanvasConfig(configQuery?.sqlText || '')
            if (!parsedConfig) continue

            if (parsedConfig.kind === 'connection') {
              connectionsFromStorage.push({
                id: `stored-connection-${graph.id}`,
                fromFrameId: parsedConfig.fromFrameId,
                toFrameId: parsedConfig.toFrameId,
                fromGraphId: parsedConfig.fromGraphId,
                toGraphId: parsedConfig.toGraphId,
                categoryId: category.id,
                graphId: graph.id,
                queryId: configQuery?.id,
              })
              continue
            }
            if (!isRenderableCanvasFrameKind(parsedConfig.kind)) continue

            framesFromStorage.push({
              id: `stored-${graph.id}`,
              kind: parsedConfig.kind,
              targetUrl: parsedConfig.targetUrl,
              renderWebsite: parsedConfig.renderWebsite,
              headingText: parsedConfig.headingText,
              textContent: parsedConfig.textContent,
              chartType: parsedConfig.chartType,
              chartSql: parsedConfig.chartSql,
              label: parsedConfig.label || graph.name,
              x: parsedConfig.x,
              y: parsedConfig.y,
              width: parsedConfig.width,
              height: parsedConfig.height,
              categoryId: category.id,
              graphId: graph.id,
              queryId: configQuery?.id,
              refreshNonce: 0,
            })
          }
        }

        if (!isActive) return
        setFrames(framesFromStorage)
        setConnections(connectionsFromStorage)
      } catch (error) {
        if (!isActive) return
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke laste canvas-data')
      } finally {
        if (isActive) setIsLoadingCanvasItems(false)
      }
    }

    void loadCanvasItems()
    return () => {
      isActive = false
    }
  }, [canPersistToDashboard, projectId, dashboardId])

  useEffect(() => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) return
    let isActive = true

    const loadCanvasTitle = async () => {
      try {
        const dashboards = await fetchDashboards(projectId)
        if (!isActive) return
        const dashboard = dashboards.find((item) => item.id === dashboardId)
        setCanvasTitle(dashboard?.name?.trim() || 'Canvas')
      } catch {
        if (!isActive) return
        setCanvasTitle('Canvas')
      }
    }

    void loadCanvasTitle()
    return () => {
      isActive = false
    }
  }, [canPersistToDashboard, projectId, dashboardId])

  const handleAddPage = async () => {
    const targetUrl = normalizeInputToTargetUrl(newPagePathInput)
    if (!targetUrl) {
      setAddPageError('Legg inn en gyldig URL, for eksempel https://www.nav.no/aap.')
      return
    }

    const comparableUrl = getComparableUrl(targetUrl)
    if (
      frames.some(
        (frame) => frame.kind === 'website' && frame.targetUrl && getComparableUrl(frame.targetUrl) === comparableUrl,
      )
    ) {
      setAddPageError('Siden er allerede lagt til i canvaset.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'website',
      targetUrl,
      renderWebsite: true,
      label: getFrameLabel(targetUrl),
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 420,
      height: 560,
      refreshNonce: 0,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setNewPagePathInput('')
      setAddPageError(null)
      setIsAddPageModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre nettside i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleOpenEditWebsiteModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'website') return
    setEditWebsiteFrameId(frame.id)
    setEditWebsitePathInput(frame.targetUrl || '')
    setEditWebsiteRenderEnabled(frame.renderWebsite !== false)
    setEditWebsiteError(null)
    setIsEditWebsiteModalOpen(true)
  }

  const handleSaveEditedWebsite = async () => {
    if (!editWebsiteFrameId) return

    const targetUrl = normalizeInputToTargetUrl(editWebsitePathInput)
    if (!targetUrl) {
      setEditWebsiteError('Legg inn en gyldig URL, for eksempel https://www.nav.no/aap.')
      return
    }

    const comparableUrl = getComparableUrl(targetUrl)
    if (
      frames.some(
        (frame) =>
          frame.id !== editWebsiteFrameId &&
          frame.kind === 'website' &&
          frame.targetUrl &&
          getComparableUrl(frame.targetUrl) === comparableUrl,
      )
    ) {
      setEditWebsiteError('Siden er allerede lagt til i canvaset.')
      return
    }

    const currentFrame = frames.find((frame) => frame.id === editWebsiteFrameId)
    if (!currentFrame || currentFrame.kind !== 'website') return

    const updatedFrame: CanvasFrame = {
      ...currentFrame,
      targetUrl,
      renderWebsite: editWebsiteRenderEnabled,
      label: getFrameLabel(targetUrl),
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((frame) => (frame.id === editWebsiteFrameId ? persistedFrame : frame)))
      setIsEditWebsiteModalOpen(false)
      setEditWebsiteFrameId(null)
      setEditWebsiteError(null)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke oppdatere nettside')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const createConnectionBetweenFrames = async (source: CanvasFrame, target: CanvasFrame) => {
    if (source.kind !== 'website' || target.kind !== 'website') return
    if (source.id === target.id) return

    if (
      connections.some(
        (connection) =>
          (connection.fromFrameId === source.id && connection.toFrameId === target.id) ||
          (source.graphId &&
            target.graphId &&
            connection.fromGraphId === source.graphId &&
            connection.toGraphId === target.graphId),
      )
    ) {
      return
    }

    const newConnection: CanvasConnection = {
      id: `${Date.now()}-${Math.random()}`,
      fromFrameId: source.id,
      toFrameId: target.id,
      fromGraphId: source.graphId,
      toGraphId: target.graphId,
    }

    try {
      setIsSavingCanvasItem(true)
      const persisted = await persistConnection(newConnection)
      setConnections((prev) => [...prev, persisted])
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre kobling')
    } finally {
      setIsSavingCanvasItem(false)
      setConnectSourceFrameId(null)
    }
  }

  const handleConnectionDotClick = async (frame: CanvasFrame) => {
    if (frame.kind !== 'website') return

    if (!connectSourceFrameId) {
      setConnectSourceFrameId(frame.id)
      return
    }

    if (connectSourceFrameId === frame.id) {
      setConnectSourceFrameId(null)
      return
    }

    const source = frames.find((item) => item.id === connectSourceFrameId)
    if (!source || source.kind !== 'website') {
      setConnectSourceFrameId(null)
      return
    }

    await createConnectionBetweenFrames(source, frame)
  }

  const handleAddHeadingCard = async () => {
    const heading = headingTextInput.trim()
    if (!heading) {
      setAddHeadingError('Legg inn overskrift.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'heading',
      headingText: heading,
      label: heading,
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 420,
      height: 160,
      refreshNonce: 0,
    }
    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setHeadingTextInput('')
      setAddHeadingError(null)
      setIsAddHeadingModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre overskrift i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleAddTextCard = async () => {
    const content = textContentInput.trim()

    if (!content) {
      setAddTextError('Legg inn tekst.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'text',
      textContent: content,
      label: 'Tekst',
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 340,
      height: 170,
      refreshNonce: 0,
    }
    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setTextContentInput('')
      setAddTextError(null)
      setIsAddTextModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre tekst i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleAddStickyCard = async () => {
    const content = stickyContentInput.trim()

    if (!content) {
      setAddStickyError('Legg inn tekst.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'sticky',
      textContent: content,
      label: 'Sticky note',
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 360,
      height: 260,
      refreshNonce: 0,
    }
    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setStickyContentInput('')
      setAddStickyError(null)
      setIsAddStickyModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre sticky note i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const loadChartOptions = useCallback(async () => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) {
      setChartOptions([])
      setSelectedChartOptionId('')
      return
    }

    setIsLoadingChartOptions(true)
    setAddChartError(null)

    try {
      const categories = await fetchCategories(projectId, dashboardId)
      const options: CanvasChartOption[] = []

      for (const category of categories) {
        const graphs = await fetchGraphs(projectId, dashboardId, category.id)
        for (const graph of graphs) {
          const mappedType = mapGraphTypeToChart(graph.graphType)
          if (mappedType !== 'line' && mappedType !== 'bar' && mappedType !== 'pie' && mappedType !== 'table') {
            continue
          }

          const queries = await fetchQueries(projectId, dashboardId, category.id, graph.id)
          const primaryQuery = queries[0]
          if (!primaryQuery?.sqlText) continue

          options.push({
            id: `${category.id}:${graph.id}:${primaryQuery.id}`,
            title: graph.name || `Graf ${graph.id}`,
            chartType: mappedType,
            sql: primaryQuery.sqlText,
          })
        }
      }

      setChartOptions(options)
      setSelectedChartOptionId((prev) => {
        if (prev && options.some((option) => option.id === prev)) return prev
        return options[0]?.id || ''
      })
    } catch (error) {
      setAddChartError(error instanceof Error ? error.message : 'Kunne ikke laste grafer')
    } finally {
      setIsLoadingChartOptions(false)
    }
  }, [canPersistToDashboard, projectId, dashboardId])

  const handleOpenAddChartModal = () => {
    setAddChartError(null)
    setIsAddChartModalOpen(true)
    void loadChartOptions()
  }

  const handleAddChartCard = async () => {
    const selectedOption = chartOptions.find((option) => option.id === selectedChartOptionId)
    if (!selectedOption) {
      setAddChartError('Velg en graf.')
      return
    }

    const index = frames.length
    const column = index % 2
    const row = Math.floor(index / 2)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'chart',
      label: selectedOption.title,
      chartType: selectedOption.chartType,
      chartSql: selectedOption.sql,
      x: 120 + column * 720,
      y: 120 + row * 520,
      width: 680,
      height: 460,
      refreshNonce: 0,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setAddChartError(null)
      setIsAddChartModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre graf i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleDragStart = (event: React.MouseEvent, frame: CanvasFrame) => {
    const viewport = canvasViewportRef.current
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const pointerCanvasX = event.clientX - rect.left + viewport.scrollLeft
    const pointerCanvasY = event.clientY - rect.top + viewport.scrollTop

    setDragState({
      id: frame.id,
      offsetX: pointerCanvasX - frame.x,
      offsetY: pointerCanvasY - frame.y,
    })
  }

  const getDefaultFrameSize = (
    kind: CanvasFrame['kind'],
  ): { width: number; height: number; minWidth: number; minHeight: number } => {
    if (kind === 'website') return { width: 420, height: 560, minWidth: 320, minHeight: 320 }
    if (kind === 'chart') return { width: 680, height: 460, minWidth: 420, minHeight: 280 }
    if (kind === 'heading') return { width: 420, height: 160, minWidth: 260, minHeight: 120 }
    if (kind === 'text') return { width: 340, height: 170, minWidth: 240, minHeight: 120 }
    return { width: 360, height: 260, minWidth: 280, minHeight: 220 }
  }

  const handleResizeStart = (event: React.MouseEvent, frame: CanvasFrame) => {
    event.stopPropagation()
    const defaults = getDefaultFrameSize(frame.kind)
    setResizeState({
      id: frame.id,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: frame.width ?? defaults.width,
      startHeight: frame.height ?? defaults.height,
    })
  }

  useEffect(() => {
    if (!dragState) return

    const onMouseMove = (event: MouseEvent) => {
      const viewport = canvasViewportRef.current
      if (!viewport) return

      const rect = viewport.getBoundingClientRect()
      const pointerCanvasX = event.clientX - rect.left + viewport.scrollLeft
      const pointerCanvasY = event.clientY - rect.top + viewport.scrollTop

      setFrames((prev) =>
        prev.map((frame) =>
          frame.id === dragState.id
            ? {
                ...frame,
                x: Math.max(0, pointerCanvasX - dragState.offsetX),
                y: Math.max(0, pointerCanvasY - dragState.offsetY),
              }
            : frame,
        ),
      )
    }

    const onMouseUp = () => {
      const movedFrame = frames.find((frame) => frame.id === dragState.id)
      if (movedFrame && movedFrame.graphId) {
        void persistFrame(movedFrame).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre posisjon i canvas')
        })
      }
      setDragState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragState, frames, persistFrame])

  useEffect(() => {
    if (!resizeState) return

    const onMouseMove = (event: MouseEvent) => {
      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.id !== resizeState.id) return frame
          const defaults = getDefaultFrameSize(frame.kind)
          return {
            ...frame,
            width: Math.max(defaults.minWidth, resizeState.startWidth + (event.clientX - resizeState.startX)),
            height: Math.max(defaults.minHeight, resizeState.startHeight + (event.clientY - resizeState.startY)),
          }
        }),
      )
    }

    const onMouseUp = () => {
      const resizedFrame = frames.find((frame) => frame.id === resizeState.id)
      if (resizedFrame?.graphId) {
        void persistFrame(resizedFrame).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre størrelse i canvas')
        })
      }
      setResizeState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [resizeState, frames, persistFrame])

  const handleRemovePage = async (id: string) => {
    const frameToDelete = frames.find((frame) => frame.id === id)
    const linkedConnections = connections.filter(
      (connection) =>
        connection.fromFrameId === id ||
        connection.toFrameId === id ||
        (frameToDelete?.graphId !== undefined &&
          (connection.fromGraphId === frameToDelete.graphId || connection.toGraphId === frameToDelete.graphId)),
    )
    setFrames((prev) => prev.filter((frame) => frame.id !== id))
    setConnections((prev) => prev.filter((connection) => !linkedConnections.some((item) => item.id === connection.id)))
    if (connectSourceFrameId === id) {
      setConnectSourceFrameId(null)
    }

    if (!frameToDelete || !canPersistToDashboard || projectId === null || dashboardId === null) return
    if (!frameToDelete.graphId || !frameToDelete.categoryId) return

    try {
      await deleteGraph(projectId, dashboardId, frameToDelete.categoryId, frameToDelete.graphId)
      await Promise.all(
        linkedConnections.map((connection) => {
          if (!connection.graphId || !connection.categoryId) return Promise.resolve()
          return deleteGraph(projectId, dashboardId, connection.categoryId, connection.graphId)
        }),
      )
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke slette element fra canvas')
    }
  }

  const handleRemoveConnection = async (connectionId: string) => {
    const connection = connections.find((item) => item.id === connectionId)
    setConnections((prev) => prev.filter((item) => item.id !== connectionId))

    if (!connection || !canPersistToDashboard || projectId === null || dashboardId === null) return
    if (!connection.graphId || !connection.categoryId) return

    try {
      await deleteGraph(projectId, dashboardId, connection.categoryId, connection.graphId)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke slette kobling')
    }
  }

  const resolveConnectionFrame = useCallback(
    (connection: CanvasConnection, role: 'from' | 'to'): CanvasFrame | null => {
      const frameId = role === 'from' ? connection.fromFrameId : connection.toFrameId
      const graphId = role === 'from' ? connection.fromGraphId : connection.toGraphId
      if (frameId) {
        const byId = frames.find((frame) => frame.id === frameId)
        if (byId) return byId
      }
      if (graphId) {
        const byGraphId = frames.find((frame) => frame.graphId === graphId)
        if (byGraphId) return byGraphId
      }
      return null
    },
    [frames],
  )

  const connectionSegments = useMemo(
    () =>
      connections
        .map((connection) => {
          const fromFrame = resolveConnectionFrame(connection, 'from')
          const toFrame = resolveConnectionFrame(connection, 'to')
          if (!fromFrame || !toFrame) return null

          const fromDefaults = getDefaultFrameSize(fromFrame.kind)
          const toDefaults = getDefaultFrameSize(toFrame.kind)
          const fromWidth = fromFrame.width ?? fromDefaults.width
          const fromHeight = fromFrame.height ?? fromDefaults.height
          const fromAnchorY = fromFrame.y + fromHeight / 2
          const toHeight = toFrame.height ?? toDefaults.height
          const toAnchorY = toFrame.y + toHeight / 2

          const x1 = fromFrame.x + fromWidth
          const y1 = fromAnchorY
          const x2 = toFrame.x
          const y2 = toAnchorY
          const delta = Math.max(80, Math.abs(x2 - x1) * 0.45)
          const path = `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`

          return {
            id: connection.id,
            path,
          }
        })
        .filter((item): item is { id: string; path: string } => item !== null),
    [connections, resolveConnectionFrame],
  )

  const handleRefreshFrame = (id: string) => {
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === id && frame.kind === 'website'
          ? {
              ...frame,
              refreshNonce: frame.refreshNonce + 1,
            }
          : frame,
      ),
    )
  }

  const handleEditableFrameChange = (id: string, nextValue: string) => {
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== id) return frame
        if (frame.kind === 'heading') {
          return {
            ...frame,
            headingText: nextValue,
            label: nextValue.trim() || 'Overskrift',
          }
        }
        if (frame.kind === 'text' || frame.kind === 'sticky') {
          return {
            ...frame,
            textContent: nextValue,
          }
        }
        return frame
      }),
    )
  }

  const handleEditableFrameBlur = (id: string) => {
    const frame = frames.find((item) => item.id === id)
    if (!frame || frame.kind === 'website' || frame.kind === 'chart') return

    let nextFrame = frame
    if (frame.kind === 'heading') {
      const normalizedHeading = (frame.headingText || '').trim()
      nextFrame = {
        ...frame,
        headingText: normalizedHeading,
        label: normalizedHeading || 'Overskrift',
      }
    } else {
      nextFrame = {
        ...frame,
        textContent: (frame.textContent || '').trim(),
      }
    }

    setFrames((prev) => prev.map((item) => (item.id === id ? nextFrame : item)))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre endringer i canvas')
    })
  }

  return (
    <>
      <section className="relative h-[100dvh] min-h-[100dvh] bg-[var(--ax-bg-neutral-soft)]">
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-20">
          <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2 shadow-sm">
            <div className="min-w-0 flex items-center gap-1.5">
              <a
                href="/"
                aria-label="Gå til forsiden"
                className="grid h-7 w-7 place-items-center text-[var(--ax-text-default)] shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M16.5 10.5C16.5 13.8137 13.8137 16.5 10.5 16.5C7.18629 16.5 4.5 13.8137 4.5 10.5C4.5 7.18629 7.18629 4.5 10.5 4.5C13.8137 4.5 16.5 7.18629 16.5 10.5Z"
                    stroke="currentColor"
                    strokeWidth="1.9"
                  />
                  <path d="M15.2 15.2L20.5 20.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path
                    d="M7.9 12.5V10.2M10.5 12.5V8.5M13.1 12.5V9.3"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                </svg>
              </a>
              <div
                className="truncate text-[20px] font-semibold leading-none text-[var(--ax-text-default)]"
                title={canvasTitle}
              >
                {canvasTitle}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-[210px] [&_label]:sr-only">
                <PeriodPicker
                  period={period}
                  onPeriodChange={setPeriod}
                  startDate={customStartDate}
                  onStartDateChange={setCustomStartDate}
                  endDate={customEndDate}
                  onEndDateChange={setCustomEndDate}
                />
              </div>
              <ActionMenu>
                <ActionMenu.Trigger>
                  <Button size="small" icon={<Plus size={16} />}>
                    Legg til
                  </Button>
                </ActionMenu.Trigger>
                <ActionMenu.Content align="end">
                  <ActionMenu.Item
                    onClick={() => {
                      setAddPageError(null)
                      setIsAddPageModalOpen(true)
                    }}
                  >
                    Nettside
                  </ActionMenu.Item>
                  <ActionMenu.Item onClick={handleOpenAddChartModal}>Graf</ActionMenu.Item>
                  <ActionMenu.Item
                    onClick={() => {
                      setAddHeadingError(null)
                      setIsAddHeadingModalOpen(true)
                    }}
                  >
                    Overskrift
                  </ActionMenu.Item>
                  <ActionMenu.Item
                    onClick={() => {
                      setAddTextError(null)
                      setIsAddTextModalOpen(true)
                    }}
                  >
                    Tekst
                  </ActionMenu.Item>
                  <ActionMenu.Item
                    onClick={() => {
                      setAddStickyError(null)
                      setIsAddStickyModalOpen(true)
                    }}
                  >
                    Sticky note
                  </ActionMenu.Item>
                </ActionMenu.Content>
              </ActionMenu>
            </div>
          </div>
        </div>

        <div className="flex h-full">
          <main ref={canvasViewportRef} className="relative flex-1 overflow-auto">
            <div className="pointer-events-none absolute left-4 top-[68px] z-10 w-[min(640px,calc(100%-2rem))] space-y-2">
              {!canPersistToDashboard && (
                <div className="pointer-events-auto">
                  <Alert variant="warning" size="small">
                    Canvas er ikke koblet til et dashboard. Åpne canvas fra ProjectManager for lagring.
                  </Alert>
                </div>
              )}
              {syncError && (
                <div className="pointer-events-auto">
                  <Alert variant="error" size="small" closeButton onClose={() => setSyncError(null)}>
                    {syncError}
                  </Alert>
                </div>
              )}
            </div>
            <div
              className="relative min-h-[1500px] min-w-[2200px]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, var(--ax-border-neutral-subtle) 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            >
              {connectionSegments.length > 0 && (
                <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible">
                  <defs>
                    <marker
                      id="canvas-connection-arrow"
                      markerWidth="10"
                      markerHeight="8"
                      refX="9"
                      refY="4"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M0,0 L10,4 L0,8 z" fill="var(--ax-border-accent)" />
                    </marker>
                  </defs>
                  {connectionSegments.map((segment) => (
                    <g key={segment.id}>
                      <path
                        d={segment.path}
                        stroke="var(--ax-border-accent)"
                        strokeWidth={2}
                        fill="none"
                        markerEnd="url(#canvas-connection-arrow)"
                      />
                      <path
                        d={segment.path}
                        stroke="transparent"
                        strokeWidth={12}
                        fill="none"
                        className="pointer-events-auto cursor-pointer"
                        onClick={() => void handleRemoveConnection(segment.id)}
                      />
                    </g>
                  ))}
                </svg>
              )}
              {frameItems.map((frame) =>
                (() => {
                  const defaults = getDefaultFrameSize(frame.kind)
                  return (
                    <article
                      key={frame.id}
                      className={
                        frame.kind === 'website'
                          ? `group absolute flex flex-col overflow-visible rounded-lg border ${connectSourceFrameId === frame.id ? 'border-[var(--ax-border-accent)] ring-2 ring-[var(--ax-border-accent)]/20' : 'border-[var(--ax-border-neutral-subtle)]'} bg-white shadow-sm`
                          : frame.kind === 'chart'
                            ? 'group absolute flex flex-col overflow-hidden rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-white shadow-sm'
                            : frame.kind === 'heading'
                              ? 'group absolute flex flex-col overflow-hidden rounded-xl border border-transparent bg-transparent shadow-none'
                              : frame.kind === 'text'
                                ? 'group absolute flex flex-col overflow-hidden rounded-xl border border-transparent bg-transparent shadow-none'
                                : 'group absolute flex flex-col overflow-hidden rounded-xl border border-[#f1dc7d] bg-[#fff5b8] shadow-sm'
                      }
                      style={{
                        left: `${frame.x}px`,
                        top: `${frame.y}px`,
                        width: `${frame.width ?? defaults.width}px`,
                        height: `${frame.height ?? defaults.height}px`,
                        minWidth: `${defaults.minWidth}px`,
                        minHeight: `${defaults.minHeight}px`,
                      }}
                    >
                      <header
                        className={
                          frame.kind === 'website'
                            ? 'flex cursor-move items-center justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-2'
                            : frame.kind === 'sticky'
                              ? 'flex cursor-move items-center justify-between gap-2 border-b border-[#ebd56d] bg-[#fff1a6] px-2 py-2'
                              : 'absolute right-2 top-2 z-10 flex items-center justify-end gap-1 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-focus-within:pointer-events-auto'
                        }
                        onMouseDown={
                          frame.kind === 'website' || frame.kind === 'sticky'
                            ? (event) => handleDragStart(event, frame)
                            : undefined
                        }
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {frame.kind === 'website' && <Move size={14} className="text-[var(--ax-text-subtle)]" />}
                          {frame.kind === 'website' && (
                            <div className="min-w-0 text-sm font-semibold text-[var(--ax-text-default)] break-all">
                              {frame.label}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {frame.kind === 'website' && (
                            <Button
                              size="xsmall"
                              variant="tertiary"
                              icon={<Edit2 size={14} />}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={() => handleOpenEditWebsiteModal(frame)}
                              title="Rediger nettside"
                              aria-label="Rediger nettside"
                            />
                          )}
                          {frame.kind === 'website' && (
                            <Button
                              size="xsmall"
                              variant="tertiary"
                              icon={<RefreshCw size={14} />}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={() => handleRefreshFrame(frame.id)}
                              title="Last inn på nytt"
                              aria-label="Last inn på nytt"
                            />
                          )}
                          {(frame.kind === 'heading' || frame.kind === 'text' || frame.kind === 'chart') && (
                            <Button
                              size="xsmall"
                              variant="tertiary"
                              icon={<Move size={14} />}
                              onMouseDown={(event) => handleDragStart(event, frame)}
                              title="Flytt kort"
                              aria-label="Flytt kort"
                            />
                          )}
                          <Button
                            size="xsmall"
                            variant="tertiary"
                            icon={<Trash2 size={14} />}
                            onClick={() => void handleRemovePage(frame.id)}
                            title="Fjern kort"
                            aria-label="Fjern kort"
                          />
                        </div>
                      </header>

                      <div
                        className={`relative flex-1 ${frame.kind === 'website' || frame.kind === 'chart' ? 'bg-white' : 'px-2 pb-2'}`}
                      >
                        {frame.kind === 'website' && (
                          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-20 overflow-visible">
                            <button
                              type="button"
                              className={`pointer-events-auto absolute left-[-12px] top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
                                connectSourceFrameId === frame.id ? 'opacity-100' : ''
                              }`}
                              aria-label="Kobling"
                              title={connectSourceFrameId ? 'Koble hit' : 'Start kobling'}
                              onClick={() => void handleConnectionDotClick(frame)}
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none h-3.5 w-3.5 rounded-full border border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] shadow-sm ${
                                  connectSourceFrameId === frame.id ? 'bg-[var(--ax-border-accent)]' : ''
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              className={`pointer-events-auto absolute right-[-12px] top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
                                connectSourceFrameId === frame.id ? 'opacity-100' : ''
                              }`}
                              aria-label="Kobling"
                              title={connectSourceFrameId ? 'Koble hit' : 'Start kobling'}
                              onClick={() => void handleConnectionDotClick(frame)}
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none h-3.5 w-3.5 rounded-full border border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] shadow-sm ${
                                  connectSourceFrameId === frame.id ? 'bg-[var(--ax-border-accent)]' : ''
                                }`}
                              />
                            </button>
                          </div>
                        )}
                        {frame.kind === 'website' && frame.src && frame.renderWebsite !== false ? (
                          <iframe
                            key={`${frame.id}-${frame.refreshNonce}`}
                            title={`Canvas-side ${frame.label}`}
                            src={frame.src}
                            className="h-full w-full"
                            loading="lazy"
                            sandbox="allow-same-origin allow-scripts allow-forms"
                          />
                        ) : frame.kind === 'website' ? (
                          <div className="flex h-full items-center justify-center px-6 text-center">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-[var(--ax-text-default)]">{frame.label}</p>
                              {frame.targetUrl && (
                                <Link href={frame.targetUrl} target="_blank" rel="noopener noreferrer">
                                  Åpne nettside i ny fane
                                </Link>
                              )}
                            </div>
                          </div>
                        ) : frame.kind === 'chart' && frame.chartSql && frame.chartType ? (
                          <div className="h-full p-2">
                            <DashboardWidget
                              chart={{
                                id: `canvas-chart-${frame.id}`,
                                title: frame.label,
                                type: frame.chartType,
                                sql: frame.chartSql,
                              }}
                              websiteId={websiteId}
                              filters={dashboardWidgetFilters}
                              chartLinksEnabled={false}
                            />
                          </div>
                        ) : frame.kind === 'heading' ? (
                          <div className="h-full overflow-auto px-2 pb-2">
                            <textarea
                              value={frame.headingText || ''}
                              onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                              onBlur={() => handleEditableFrameBlur(frame.id)}
                              onMouseDown={(event) => event.stopPropagation()}
                              placeholder="Skriv overskrift"
                              className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
                              style={{ fontSize: '42px', lineHeight: 1.1, fontWeight: 700 }}
                            />
                          </div>
                        ) : frame.kind === 'text' ? (
                          <div className="h-full overflow-auto px-2 pb-2">
                            <textarea
                              value={frame.textContent || ''}
                              onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                              onBlur={() => handleEditableFrameBlur(frame.id)}
                              onMouseDown={(event) => event.stopPropagation()}
                              placeholder="Skriv tekst"
                              className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
                              style={{ fontSize: '24px', lineHeight: 1.3, fontWeight: 500 }}
                            />
                          </div>
                        ) : frame.kind === 'sticky' ? (
                          <div className="h-full overflow-auto p-4">
                            <textarea
                              value={frame.textContent || ''}
                              onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                              onBlur={() => handleEditableFrameBlur(frame.id)}
                              placeholder="Skriv sticky note"
                              className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-base leading-7 text-[#4a3d00] outline-none placeholder:text-[#7a6b2a]"
                            />
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--ax-text-subtle)]">
                            Kunne ikke lage forhåndsvisning for denne siden.
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onMouseDown={(event) => handleResizeStart(event, frame)}
                        title="Endre størrelse"
                        aria-label="Endre størrelse"
                        className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-sm border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        <span
                          className="pointer-events-none absolute bottom-[2px] right-[2px] h-2.5 w-2.5"
                          style={{
                            background:
                              'linear-gradient(135deg, transparent 35%, var(--ax-text-subtle) 35%, var(--ax-text-subtle) 45%, transparent 45%, transparent 55%, var(--ax-text-subtle) 55%, var(--ax-text-subtle) 65%, transparent 65%)',
                          }}
                        />
                      </button>
                    </article>
                  )
                })(),
              )}
            </div>
          </main>
        </div>
      </section>

      <Modal
        open={isAddPageModalOpen}
        onClose={() => setIsAddPageModalOpen(false)}
        header={{ heading: 'Legg til side i canvas' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              size="small"
              label="URL"
              value={newPagePathInput}
              onChange={(event) => {
                setNewPagePathInput(event.target.value)
                if (addPageError) setAddPageError(null)
              }}
              autoFocus
            />
            {addPageError && <Alert variant="error">{addPageError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddPage()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button variant="secondary" size="small" onClick={() => setIsAddPageModalOpen(false)}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isEditWebsiteModalOpen}
        onClose={() => {
          setIsEditWebsiteModalOpen(false)
          setEditWebsiteFrameId(null)
          setEditWebsiteError(null)
        }}
        header={{ heading: 'Rediger nettside' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              size="small"
              label="URL"
              value={editWebsitePathInput}
              onChange={(event) => {
                setEditWebsitePathInput(event.target.value)
                if (editWebsiteError) setEditWebsiteError(null)
              }}
              autoFocus
            />
            <Switch
              size="small"
              checked={editWebsiteRenderEnabled}
              onChange={(event) => setEditWebsiteRenderEnabled(event.target.checked)}
            >
              Vis nettsiden i kortet
            </Switch>
            {editWebsiteError && <Alert variant="error">{editWebsiteError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleSaveEditedWebsite()} size="small" loading={isSavingCanvasItem}>
            Lagre
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsEditWebsiteModalOpen(false)
              setEditWebsiteFrameId(null)
              setEditWebsiteError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddChartModalOpen}
        onClose={() => {
          setIsAddChartModalOpen(false)
          setAddChartError(null)
        }}
        header={{ heading: 'Legg til graf' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            {(isLoadingChartOptions || chartOptions.length > 0) && (
              <Select
                label="Graf"
                value={selectedChartOptionId}
                onChange={(event) => {
                  setSelectedChartOptionId(event.target.value)
                  if (addChartError) setAddChartError(null)
                }}
                disabled={isLoadingChartOptions}
              >
                <option value="" disabled>
                  {isLoadingChartOptions ? 'Laster grafer...' : 'Velg graf'}
                </option>
                {chartOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </Select>
            )}
            {addChartError && <Alert variant="error">{addChartError}</Alert>}
            {!isLoadingChartOptions && chartOptions.length === 0 && !addChartError && (
              <Link href="/grafbygger" target="_blank" rel="noopener noreferrer">
                Lag en graf i Grafbyggeren (åpnes i ny fane)
              </Link>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {chartOptions.length > 0 && (
            <Button
              onClick={() => void handleAddChartCard()}
              size="small"
              loading={isSavingCanvasItem}
              disabled={!selectedChartOptionId}
            >
              Legg til
            </Button>
          )}
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddChartModalOpen(false)
              setAddChartError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddHeadingModalOpen}
        onClose={() => {
          setIsAddHeadingModalOpen(false)
          setAddHeadingError(null)
        }}
        header={{ heading: 'Legg til overskrift' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              label="Overskrift"
              value={headingTextInput}
              onChange={(event) => {
                setHeadingTextInput(event.target.value)
                if (addHeadingError) setAddHeadingError(null)
              }}
              autoFocus
            />
            {addHeadingError && <Alert variant="error">{addHeadingError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddHeadingCard()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddHeadingModalOpen(false)
              setAddHeadingError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddTextModalOpen}
        onClose={() => {
          setIsAddTextModalOpen(false)
          setAddTextError(null)
        }}
        header={{ heading: 'Legg til tekst' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Textarea
              label="Tekst"
              minRows={6}
              value={textContentInput}
              onChange={(event) => {
                setTextContentInput(event.target.value)
                if (addTextError) setAddTextError(null)
              }}
            />
            {addTextError && <Alert variant="error">{addTextError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddTextCard()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddTextModalOpen(false)
              setAddTextError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddStickyModalOpen}
        onClose={() => {
          setIsAddStickyModalOpen(false)
          setAddStickyError(null)
        }}
        header={{ heading: 'Legg til sticky note' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Textarea
              label="Tekst"
              minRows={6}
              value={stickyContentInput}
              onChange={(event) => {
                setStickyContentInput(event.target.value)
                if (addStickyError) setAddStickyError(null)
              }}
            />
            {addStickyError && <Alert variant="error">{addStickyError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddStickyCard()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddStickyModalOpen(false)
              setAddStickyError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

export default Canvas
