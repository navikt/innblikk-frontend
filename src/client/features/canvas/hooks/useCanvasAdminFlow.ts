import { useCallback, useEffect, useMemo } from 'react'
import {
  createCategory,
  createDashboard,
  createProject,
  deleteCategory,
  fetchCategories,
  fetchDashboards,
  fetchProjects,
  updateCategory,
  updateDashboard,
} from '../../oversikt/api/oversiktApi.ts'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'
import type { CanvasConnection, CanvasFrame } from '../model/types.ts'
import {
  CANVAS_DASHBOARD_TOKEN,
  buildCanvasDashboardDescription,
  isCanvasDashboardDescription,
} from '../utils/canvasUtils.ts'

type Option = { id: number; name: string }

type UseCanvasAdminFlowParams = {
  projectId: number | null
  dashboardId: number | null
  canPersistToDashboard: boolean
  shouldShowCreateCanvasModal: boolean
  lastProjectStorageKey: string
  canvasCategories: GraphCategoryDto[]
  setCanvasCategories: (next: GraphCategoryDto[] | ((current: GraphCategoryDto[]) => GraphCategoryDto[])) => void
  activeCanvasCategoryId: number | null
  setActiveCanvasCategoryId: (next: number | null | ((current: number | null) => number | null)) => void
  frames: CanvasFrame[]
  setFrames: (next: CanvasFrame[] | ((current: CanvasFrame[]) => CanvasFrame[])) => void
  connections: CanvasConnection[]
  setConnections: (next: CanvasConnection[] | ((current: CanvasConnection[]) => CanvasConnection[])) => void
  setCanvasTitle: (next: string) => void
  canvasDashboardDescription: string
  setCanvasDashboardDescription: (next: string) => void
  setCanvasConfiguredWebsiteId: (next: string | null) => void
  setCanvasDefaultPeriod: (next: string) => void
  setCanvasDefaultCustomStartDate: (next: Date | undefined) => void
  setCanvasDefaultCustomEndDate: (next: Date | undefined) => void
  setCanvasHideDateFilter: (next: boolean) => void
  setCanvasUrlPathFilter: (next: string) => void
  setCanvasHideUrlPathFilter: (next: boolean) => void
  selectedWebsiteId: string | null
  setSyncError: (next: string | null) => void
  setIsSavingCanvasItem: (next: boolean) => void
  setIsCanvasSettingsModalOpen: (next: boolean) => void
  setRenameCanvasError: (next: string | null) => void
  setIsCreateTabModalOpen: (next: boolean) => void
  setCreateTabError: (next: string | null) => void
  setCreatingTab: (next: boolean) => void
  setIsManageTabsModalOpen: (next: boolean) => void
  setIsManageTabPreselected: (next: boolean) => void
  manageTabId: string
  setManageTabId: (next: string) => void
  setManageTabName: (next: string) => void
  setManageTabError: (next: string | null) => void
  setSavingManageTab: (next: boolean) => void
  setDeletingManageTab: (next: boolean) => void
  createCanvasProjectId: string
  setCreateCanvasProjectId: (next: string) => void
  setCreateCanvasProjectOptions: (next: Option[] | ((current: Option[]) => Option[])) => void
  setExistingCanvasOptions: (next: Option[]) => void
  setIsLoadingExistingCanvasOptions: (next: boolean) => void
  setExistingCanvasError: (next: string | null) => void
  createCanvasNameInput: string
  setCreateCanvasError: (next: string | null) => void
  setIsCreatingCanvas: (next: boolean) => void
  setIsCreateTeamModalOpen: (next: boolean) => void
  createTeamNameInput: string
  setCreateTeamNameInput: (next: string) => void
  createTeamDescriptionInput: string
  setCreateTeamDescriptionInput: (next: string) => void
  createCanvasError: string | null
  setCreateTeamError: (next: string | null) => void
  setIsCreatingTeam: (next: boolean) => void
}

const useCanvasAdminFlow = ({
  projectId,
  dashboardId,
  canPersistToDashboard,
  shouldShowCreateCanvasModal,
  lastProjectStorageKey,
  canvasCategories,
  setCanvasCategories,
  activeCanvasCategoryId,
  setActiveCanvasCategoryId,
  frames,
  setFrames,
  connections,
  setConnections,
  setCanvasTitle,
  canvasDashboardDescription,
  setCanvasDashboardDescription,
  setCanvasConfiguredWebsiteId,
  setCanvasDefaultPeriod,
  setCanvasDefaultCustomStartDate,
  setCanvasDefaultCustomEndDate,
  setCanvasHideDateFilter,
  setCanvasUrlPathFilter,
  setCanvasHideUrlPathFilter,
  selectedWebsiteId,
  setSyncError,
  setIsSavingCanvasItem,
  setIsCanvasSettingsModalOpen,
  setRenameCanvasError,
  setIsCreateTabModalOpen,
  setCreateTabError,
  setCreatingTab,
  setIsManageTabsModalOpen,
  setIsManageTabPreselected,
  manageTabId,
  setManageTabId,
  setManageTabName,
  setManageTabError,
  setSavingManageTab,
  setDeletingManageTab,
  createCanvasProjectId,
  setCreateCanvasProjectId,
  setCreateCanvasProjectOptions,
  setExistingCanvasOptions,
  setIsLoadingExistingCanvasOptions,
  setExistingCanvasError,
  createCanvasNameInput,
  setCreateCanvasError,
  setIsCreatingCanvas,
  setIsCreateTeamModalOpen,
  createTeamNameInput,
  setCreateTeamNameInput,
  createTeamDescriptionInput,
  setCreateTeamDescriptionInput,
  createCanvasError,
  setCreateTeamError,
  setIsCreatingTeam,
}: UseCanvasAdminFlowParams) => {
  const loadExistingCanvasOptions = useCallback(
    async (projectIdToLoad: number | null) => {
      if (projectIdToLoad === null) {
        setExistingCanvasOptions([])
        setExistingCanvasError(null)
        return
      }

      setIsLoadingExistingCanvasOptions(true)
      setExistingCanvasError(null)
      try {
        const dashboards = await fetchDashboards(projectIdToLoad)
        const options = dashboards
          .filter((dashboard) => isCanvasDashboardDescription(dashboard.description))
          .map((dashboard) => ({
            id: dashboard.id,
            name: dashboard.name?.trim() || `Canvas ${dashboard.id}`,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'nb', { sensitivity: 'base' }))
        setExistingCanvasOptions(options)
      } catch (error) {
        setExistingCanvasOptions([])
        setExistingCanvasError(error instanceof Error ? error.message : 'Kunne ikke laste canvas')
      } finally {
        setIsLoadingExistingCanvasOptions(false)
      }
    },
    [setExistingCanvasError, setExistingCanvasOptions, setIsLoadingExistingCanvasOptions],
  )

  useEffect(() => {
    if (!shouldShowCreateCanvasModal) return
    let isActive = true
    setCreateCanvasError(null)

    void (async () => {
      try {
        const projects = await fetchProjects()
        if (!isActive) return
        const options = projects
          .map((item) => ({
            id: item.id,
            name: item.name?.trim() || `Team ${item.id}`,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'nb', { sensitivity: 'base' }))
        setCreateCanvasProjectOptions(options)
        const lastVisitedProjectId = (() => {
          if (typeof window === 'undefined') return null
          const raw = window.localStorage.getItem(lastProjectStorageKey)
          const parsed = Number(raw)
          return Number.isFinite(parsed) ? parsed : null
        })()
        const preferredProjectId =
          projectId !== null && options.some((option) => option.id === projectId)
            ? projectId
            : lastVisitedProjectId !== null && options.some((option) => option.id === lastVisitedProjectId)
              ? lastVisitedProjectId
              : null
        setCreateCanvasProjectId(preferredProjectId ? String(preferredProjectId) : '')
        await loadExistingCanvasOptions(preferredProjectId)
      } catch (error) {
        if (!isActive) return
        setCreateCanvasProjectOptions([])
        setCreateCanvasProjectId('')
        setExistingCanvasOptions([])
        setExistingCanvasError(null)
        setCreateCanvasError(error instanceof Error ? error.message : 'Kunne ikke laste team')
      }
    })()

    return () => {
      isActive = false
    }
  }, [
    lastProjectStorageKey,
    loadExistingCanvasOptions,
    projectId,
    setCreateCanvasError,
    setCreateCanvasProjectId,
    setCreateCanvasProjectOptions,
    setExistingCanvasError,
    setExistingCanvasOptions,
    shouldShowCreateCanvasModal,
  ])

  const handleOpenCreateTabModal = () => {
    setCreateTabError(null)
    setIsCreateTabModalOpen(true)
  }

  const handleCreateTab = async (inputValue: string) => {
    const nextTabName = inputValue.trim()
    if (!nextTabName) {
      setCreateTabError('Legg inn et fanenavn.')
      return
    }
    if (projectId === null || dashboardId === null) {
      setCreateTabError('Mangler prosjekt- eller dashboard-kontekst.')
      return
    }

    try {
      setCreatingTab(true)
      setCreateTabError(null)
      const createdCategory = await createCategory(projectId, dashboardId, nextTabName)
      const categories = await fetchCategories(projectId, dashboardId)
      setCanvasCategories(categories)
      setActiveCanvasCategoryId(createdCategory.id)
      setIsCreateTabModalOpen(false)
    } catch (error) {
      setCreateTabError(error instanceof Error ? error.message : 'Kunne ikke opprette fane')
    } finally {
      setCreatingTab(false)
    }
  }

  const handleOpenManageTabsModal = (preferredTabId?: number) => {
    const preferredTabIsValid =
      typeof preferredTabId === 'number' &&
      Number.isFinite(preferredTabId) &&
      canvasCategories.some((category) => category.id === preferredTabId)
    const selectedTabId = preferredTabIsValid
      ? preferredTabId
      : activeCanvasCategoryId !== null && canvasCategories.some((category) => category.id === activeCanvasCategoryId)
        ? activeCanvasCategoryId
        : (canvasCategories[0]?.id ?? null)
    const selectedTab = selectedTabId ? canvasCategories.find((category) => category.id === selectedTabId) : null
    setManageTabId(selectedTab ? String(selectedTab.id) : '')
    setManageTabName(selectedTab?.name ?? '')
    setIsManageTabPreselected(preferredTabIsValid)
    setManageTabError(null)
    setIsManageTabsModalOpen(true)
  }

  const selectedManageTab = useMemo(() => {
    const manageTabCategoryId = Number(manageTabId)
    return Number.isFinite(manageTabCategoryId) && manageTabCategoryId > 0
      ? (canvasCategories.find((category) => category.id === manageTabCategoryId) ?? null)
      : null
  }, [canvasCategories, manageTabId])

  const selectedManageTabIsFirst = useMemo(() => {
    const firstCanvasCategoryId = canvasCategories[0]?.id ?? null
    return (
      selectedManageTab !== null && firstCanvasCategoryId !== null && selectedManageTab.id === firstCanvasCategoryId
    )
  }, [canvasCategories, selectedManageTab])

  const selectedManageTabItemCount = useMemo(() => {
    if (!selectedManageTab) return 0
    return (
      frames.filter((frame) => frame.categoryId === selectedManageTab.id).length +
      connections.filter((connection) => connection.categoryId === selectedManageTab.id).length
    )
  }, [connections, frames, selectedManageTab])

  const selectedManageTabIsEmpty = selectedManageTab !== null && selectedManageTabItemCount === 0

  const handleRenameTab = async (inputValue: string) => {
    const categoryId = Number(manageTabId)
    const nextName = inputValue.trim()
    if (!Number.isFinite(categoryId)) {
      setManageTabError('Velg en fane.')
      return
    }
    if (!nextName) {
      setManageTabError('Legg inn et fanenavn.')
      return
    }
    if (projectId === null || dashboardId === null) {
      setManageTabError('Mangler prosjekt- eller dashboard-kontekst.')
      return
    }

    try {
      setSavingManageTab(true)
      setManageTabError(null)
      await updateCategory(projectId, dashboardId, categoryId, { name: nextName })
      const categories = await fetchCategories(projectId, dashboardId)
      setCanvasCategories(categories)
      setActiveCanvasCategoryId(categoryId)
      setIsManageTabsModalOpen(false)
    } catch (error) {
      setManageTabError(error instanceof Error ? error.message : 'Kunne ikke endre navn på fane')
    } finally {
      setSavingManageTab(false)
    }
  }

  const handleDeleteTab = async () => {
    if (!selectedManageTab) {
      setManageTabError('Velg en fane.')
      return
    }
    if (selectedManageTabIsFirst) {
      setManageTabError('Den første fanen kan ikke slettes.')
      return
    }
    if (!selectedManageTabIsEmpty) {
      setManageTabError('Fanen må være tom før den kan slettes.')
      return
    }
    if (projectId === null || dashboardId === null) {
      setManageTabError('Mangler prosjekt- eller dashboard-kontekst.')
      return
    }

    try {
      setDeletingManageTab(true)
      setManageTabError(null)
      await deleteCategory(projectId, dashboardId, selectedManageTab.id)
      const categories = await fetchCategories(projectId, dashboardId)
      setCanvasCategories(categories)
      setFrames((prev) => prev.filter((frame) => frame.categoryId !== selectedManageTab.id))
      setConnections((prev) => prev.filter((connection) => connection.categoryId !== selectedManageTab.id))
      setActiveCanvasCategoryId((current) => {
        if (current !== selectedManageTab.id) return current
        return categories[0]?.id ?? null
      })
      setIsManageTabsModalOpen(false)
    } catch (error) {
      setManageTabError(error instanceof Error ? error.message : 'Kunne ikke slette fane')
    } finally {
      setDeletingManageTab(false)
    }
  }

  const handleRenameCanvas = async (
    inputValue: string,
    defaultPeriod: string,
    defaultCustomStartDate?: Date,
    defaultCustomEndDate?: Date,
    hideDateFilter?: boolean,
    defaultUrlPath?: string,
    hideUrlPathFilter?: boolean,
  ) => {
    const nextName = inputValue.trim()
    const nextDefaultPeriod = defaultPeriod.trim()
    if (!nextName) {
      setRenameCanvasError('Legg inn et navn.')
      return
    }
    if (nextDefaultPeriod === 'custom' && (!defaultCustomStartDate || !defaultCustomEndDate)) {
      setRenameCanvasError('Velg både fra- og til-dato for egendefinert standardperiode.')
      return
    }

    if (!canPersistToDashboard || projectId === null || dashboardId === null) {
      setCanvasTitle(nextName)
      setCanvasDefaultPeriod(nextDefaultPeriod)
      setCanvasDefaultCustomStartDate(nextDefaultPeriod === 'custom' ? defaultCustomStartDate : undefined)
      setCanvasDefaultCustomEndDate(nextDefaultPeriod === 'custom' ? defaultCustomEndDate : undefined)
      setCanvasHideDateFilter(Boolean(hideDateFilter))
      setCanvasUrlPathFilter(defaultUrlPath?.trim() || '/')
      setCanvasHideUrlPathFilter(Boolean(hideUrlPathFilter))
      setIsCanvasSettingsModalOpen(false)
      return
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const nextDescription = buildCanvasDashboardDescription(
        canvasDashboardDescription,
        selectedWebsiteId ?? undefined,
        nextDefaultPeriod,
        defaultCustomStartDate,
        defaultCustomEndDate,
        Boolean(hideDateFilter),
        defaultUrlPath?.trim() || '/',
        Boolean(hideUrlPathFilter),
      )
      await updateDashboard(projectId, dashboardId, { name: nextName, description: nextDescription })
      setCanvasTitle(nextName)
      setCanvasDashboardDescription(nextDescription)
      setCanvasConfiguredWebsiteId(selectedWebsiteId ?? null)
      setCanvasDefaultPeriod(nextDefaultPeriod)
      setCanvasDefaultCustomStartDate(nextDefaultPeriod === 'custom' ? defaultCustomStartDate : undefined)
      setCanvasDefaultCustomEndDate(nextDefaultPeriod === 'custom' ? defaultCustomEndDate : undefined)
      setCanvasHideDateFilter(Boolean(hideDateFilter))
      setCanvasUrlPathFilter(defaultUrlPath?.trim() || '/')
      setCanvasHideUrlPathFilter(Boolean(hideUrlPathFilter))
      setIsCanvasSettingsModalOpen(false)
      setRenameCanvasError(null)
    } catch (error) {
      setRenameCanvasError(error instanceof Error ? error.message : 'Kunne ikke gi nytt navn')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleCreateCanvas = async () => {
    const selectedProjectId = Number(createCanvasProjectId)
    const canvasName = createCanvasNameInput.trim()

    if (!Number.isFinite(selectedProjectId)) {
      setCreateCanvasError('Velg et team.')
      return
    }
    if (!canvasName) {
      setCreateCanvasError('Legg inn et canvas-navn.')
      return
    }

    try {
      setIsCreatingCanvas(true)
      setCreateCanvasError(null)
      const createdDashboard = await createDashboard(selectedProjectId, canvasName, CANVAS_DASHBOARD_TOKEN)
      window.location.href = `/canvas?projectId=${selectedProjectId}&dashboardId=${createdDashboard.id}`
    } catch (error) {
      setCreateCanvasError(error instanceof Error ? error.message : 'Kunne ikke opprette canvas')
    } finally {
      setIsCreatingCanvas(false)
    }
  }

  const handleCreateTeam = async () => {
    const teamName = createTeamNameInput.trim()
    if (!teamName) {
      setCreateTeamError('Navn er påkrevd.')
      return
    }

    try {
      setIsCreatingTeam(true)
      setCreateTeamError(null)
      const createdProject = await createProject(teamName, createTeamDescriptionInput)
      const option = { id: createdProject.id, name: createdProject.name?.trim() || `Team ${createdProject.id}` }
      setCreateCanvasProjectOptions((current) =>
        [...current, option].sort((a, b) => a.name.localeCompare(b.name, 'nb', { sensitivity: 'base' })),
      )
      setCreateCanvasProjectId(String(createdProject.id))
      void loadExistingCanvasOptions(createdProject.id)
      setIsCreateTeamModalOpen(false)
      setCreateTeamNameInput('')
      setCreateTeamDescriptionInput('')
      setCreateTeamError(null)
      if (createCanvasError) setCreateCanvasError(null)
    } catch (error) {
      setCreateTeamError(error instanceof Error ? error.message : 'Kunne ikke opprette team')
    } finally {
      setIsCreatingTeam(false)
    }
  }

  return {
    loadExistingCanvasOptions,
    handleOpenCreateTabModal,
    handleCreateTab,
    handleOpenManageTabsModal,
    selectedManageTab,
    selectedManageTabIsFirst,
    selectedManageTabItemCount,
    selectedManageTabIsEmpty,
    handleRenameTab,
    handleDeleteTab,
    handleRenameCanvas,
    handleCreateCanvas,
    handleCreateTeam,
  }
}

export default useCanvasAdminFlow
