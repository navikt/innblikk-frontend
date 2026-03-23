import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Select, TextField } from '@navikt/ds-react'
import type { DashboardDto, GraphCategoryDto, ProjectDto } from '../../model/types.ts'
import type { Website } from '../../../../shared/types/website.ts'
import { fetchWebsites } from '../../../../shared/api/websiteApi.ts'

type CopyChartDialogProps = {
  open: boolean
  chart: { title: string } | null
  projects: ProjectDto[]
  selectedProjectId: number | null
  selectedDashboardId: number | null
  sourceWebsiteId?: string
  loading?: boolean
  error?: string | null
  onClose: () => void
  loadDashboards: (projectId: number) => Promise<DashboardDto[]>
  loadCategories: (projectId: number, dashboardId: number) => Promise<GraphCategoryDto[]>
  onCopy: (params: {
    projectId: number
    projectName: string
    dashboardId: number
    dashboardName: string
    categoryId?: number
    chartName: string
    websiteId?: string
  }) => Promise<void>
}

const CopyChartDialog = ({
  open,
  chart,
  projects,
  selectedProjectId,
  selectedDashboardId,
  loading = false,
  error,
  onClose,
  loadDashboards,
  loadCategories,
  onCopy,
  sourceWebsiteId,
}: CopyChartDialogProps) => {
  const [projectId, setProjectId] = useState<number>(selectedProjectId ?? 0)
  const [dashboardId, setDashboardId] = useState<number>(selectedDashboardId ?? 0)
  const [dashboards, setDashboards] = useState<DashboardDto[]>([])
  const [loadingDashboards, setLoadingDashboards] = useState(false)
  const [categories, setCategories] = useState<GraphCategoryDto[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [categoryId, setCategoryId] = useState<number>(0)
  const [localError, setLocalError] = useState<string | null>(null)
  const [websites, setWebsites] = useState<Website[]>([])
  const [websiteId, setWebsiteId] = useState(sourceWebsiteId ?? '')
  const [chartName, setChartName] = useState(chart?.title ?? '')
  const [loadingWebsites, setLoadingWebsites] = useState(false)

  useEffect(() => {
    if (!open) return
    setProjectId(selectedProjectId ?? 0)
    setDashboardId(selectedDashboardId ?? 0)
    setCategoryId(0)
    setWebsiteId(sourceWebsiteId ?? '')
    setChartName(chart?.title ?? '')
    setLocalError(null)
  }, [open, selectedProjectId, selectedDashboardId, sourceWebsiteId, chart?.title])

  useEffect(() => {
    if (!open) return

    const run = async () => {
      setLoadingWebsites(true)
      try {
        const items = await fetchWebsites()
        setWebsites(items)
      } catch {
        setLocalError('Kunne ikke laste nettsider')
        setWebsites([])
      } finally {
        setLoadingWebsites(false)
      }
    }

    void run()
  }, [open])

  useEffect(() => {
    const run = async () => {
      if (!open || !projectId) {
        setDashboards([])
        return
      }

      setLoadingDashboards(true)
      try {
        const items = await loadDashboards(projectId)
        setDashboards(items)
        setDashboardId((prev) => {
          if (prev && items.some((dashboard) => dashboard.id === prev)) return prev
          return items[0]?.id ?? 0
        })
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : 'Kunne ikke laste dashboards')
        setDashboards([])
        setDashboardId(0)
      } finally {
        setLoadingDashboards(false)
      }
    }

    void run()
  }, [open, projectId, loadDashboards])

  useEffect(() => {
    const run = async () => {
      if (!open || !projectId || !dashboardId) {
        setCategories([])
        setCategoryId(0)
        return
      }

      setLoadingCategories(true)
      try {
        const items = await loadCategories(projectId, dashboardId)
        setCategories(items)
        setCategoryId((prev) => {
          if (prev && items.some((category) => category.id === prev)) return prev
          return items[0]?.id ?? 0
        })
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : 'Kunne ikke laste faner')
        setCategories([])
        setCategoryId(0)
      } finally {
        setLoadingCategories(false)
      }
    }

    void run()
  }, [open, projectId, dashboardId, loadCategories])

  const getCategoryDisplayName = (name?: string) => {
    const trimmed = name?.trim() ?? ''
    if (!trimmed) return 'Fane 1'
    if (trimmed.toLowerCase() === 'general') return 'Fane 1'
    return trimmed
  }

  const handleCopy = async () => {
    if (!chart) return
    if (!projectId) {
      setLocalError('Velg arbeidsområde')
      return
    }
    if (!dashboardId) {
      setLocalError('Velg dashboard')
      return
    }
    if (categories.length > 1 && !categoryId) {
      setLocalError('Velg fane')
      return
    }
    if (!chartName.trim()) {
      setLocalError('Velg et grafnavn')
      return
    }

    setLocalError(null)
    const selectedProjectName =
      projects.find((project) => project.id === projectId)?.name ?? `Arbeidsområde ${projectId}`
    const selectedDashboardName =
      dashboards.find((dashboard) => dashboard.id === dashboardId)?.name ?? `Dashboard ${dashboardId}`
    await onCopy({
      projectId,
      projectName: selectedProjectName,
      dashboardId,
      dashboardName: selectedDashboardName,
      categoryId: categoryId || undefined,
      chartName: chartName.trim(),
      websiteId: websiteId || undefined,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      header={{ heading: chart ? `Kopier graf: ${chart.title}` : 'Kopier graf' }}
      width="small"
    >
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {localError && <Alert variant="error">{localError}</Alert>}
          {error && <Alert variant="error">{error}</Alert>}
          <Select
            label="Arbeidsområde"
            value={projectId ? String(projectId) : ''}
            onChange={(event) => {
              setProjectId(Number(event.target.value))
              setLocalError(null)
            }}
            size="small"
          >
            <option value="">Velg arbeidsområde</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>

          <Select
            label="Dashboard"
            value={dashboardId ? String(dashboardId) : ''}
            onChange={(event) => {
              setDashboardId(Number(event.target.value))
              setCategoryId(0)
            }}
            size="small"
            disabled={!projectId || loadingDashboards}
          >
            <option value="">Velg dashboard</option>
            {dashboards.map((dashboard) => (
              <option key={dashboard.id} value={dashboard.id}>
                {dashboard.name}
              </option>
            ))}
          </Select>

          {categories.length > 1 && (
            <Select
              label="Fane"
              value={categoryId ? String(categoryId) : ''}
              onChange={(event) => {
                setCategoryId(Number(event.target.value))
                setLocalError(null)
              }}
              size="small"
              disabled={!dashboardId || loadingCategories}
            >
              <option value="">Velg fane</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {getCategoryDisplayName(category.name)}
                </option>
              ))}
            </Select>
          )}

          <TextField
            label="Navn på kopi"
            value={chartName}
            onChange={(event) => setChartName(event.target.value)}
            size="small"
          />

          <Select
            label="Nettside for kopi"
            description="Velg hvilken nettside kopien skal bruke."
            value={websiteId}
            onChange={(event) => setWebsiteId(event.target.value)}
            size="small"
            disabled={loadingWebsites}
          >
            <option value="">Velg nettside</option>
            {websites.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name}
              </option>
            ))}
          </Select>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={() => void handleCopy()} loading={loading}>
          Kopier graf
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default CopyChartDialog
