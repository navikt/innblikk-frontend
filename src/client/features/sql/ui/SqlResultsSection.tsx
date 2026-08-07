import { ResultsPanel } from '../../chartbuilder'
import { Alert, Button, Heading, Link, Modal, ReadMore, Select, TextField, UNSAFE_Combobox } from '@navikt/ds-react'
import { Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import type { ILineChartProps, IVerticalBarChartProps } from '@fluentui/react-charting'
import { truncateJSON } from '../utils/formatters'
import type { QueryResult, QueryStats } from '../model/types'
import {
  createDashboard,
  createProject,
  fetchCategories,
  fetchDashboards,
  fetchProjects,
  saveChartToBackend,
  type DashboardDto,
  type GraphCategoryDto,
  type ProjectDto,
} from '../../chartbuilder/api/chartStorageApi.ts'

const getHostPrefix = () => (typeof window === 'undefined' ? 'server' : window.location.hostname.replace(/\./g, '_'))
const LAST_PROJECT_ID_KEY = `grafbygger_last_project_id_${getHostPrefix()}`
const LAST_DASHBOARD_ID_KEY = `grafbygger_last_dashboard_id_${getHostPrefix()}`

const parseStoredId = (value: string | null): number | null => {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const getLastProjectId = (): number | null => {
  if (typeof window === 'undefined') return null
  return parseStoredId(window.localStorage.getItem(LAST_PROJECT_ID_KEY))
}

const getLastDashboardId = (): number | null => {
  if (typeof window === 'undefined') return null
  return parseStoredId(window.localStorage.getItem(LAST_DASHBOARD_ID_KEY))
}

const saveLastProjectId = (projectId: number | null) => {
  if (typeof window === 'undefined') return
  if (projectId) {
    window.localStorage.setItem(LAST_PROJECT_ID_KEY, String(projectId))
  } else {
    window.localStorage.removeItem(LAST_PROJECT_ID_KEY)
  }
}

const saveLastDashboardId = (dashboardId: number | null) => {
  if (typeof window === 'undefined') return
  if (dashboardId) {
    window.localStorage.setItem(LAST_DASHBOARD_ID_KEY, String(dashboardId))
  } else {
    window.localStorage.removeItem(LAST_DASHBOARD_ID_KEY)
  }
}

interface SqlResultsSectionProps {
  result: QueryResult | null
  loading: boolean
  estimating: boolean
  error: string | null
  queryStats: QueryStats | undefined | null
  query: string
  lastProcessedSql: string
  websiteId: string | undefined
  copiedMetabase: boolean
  hideMetabaseTransfer?: boolean
  showSqlCode?: boolean
  showJson?: boolean
  showExecuteButton?: boolean
  showError?: boolean
  dashboardButtonSize?: 'small' | 'medium'
  onExecuteQuery: () => Promise<void>
  onCopyMetabase: () => void
  prepareLineChartData: (includeAverage?: boolean) => ILineChartProps | null
  prepareBarChartData: () => IVerticalBarChartProps | null
  preparePieChartData: () => { data: Array<{ y: number; x: string }>; total: number } | null
}

export default function SqlResultsSection({
  result,
  loading,
  estimating,
  error,
  queryStats,
  query,
  lastProcessedSql,
  websiteId,
  copiedMetabase,
  hideMetabaseTransfer = false,
  showSqlCode = true,
  showJson = true,
  showExecuteButton = true,
  showError = true,
  dashboardButtonSize = 'small',
  onExecuteQuery,
  onCopyMetabase,
  prepareLineChartData,
  prepareBarChartData,
  preparePieChartData,
}: SqlResultsSectionProps) {
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showSaveSuccessModal, setShowSaveSuccessModal] = useState(false)
  const [savingChart, setSavingChart] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedLocation, setSavedLocation] = useState<{
    projectId: number
    dashboardId: number
    projectName: string
    dashboardName: string
  } | null>(null)
  const [projectName, setProjectName] = useState('Start Umami')
  const [dashboardName, setDashboardName] = useState('Grafbygger')
  const [graphName, setGraphName] = useState('')
  const [graphType, setGraphType] = useState('TABLE')
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [dashboards, setDashboards] = useState<DashboardDto[]>([])
  const [categories, setCategories] = useState<GraphCategoryDto[]>([])
  const [selectedProjectOption, setSelectedProjectOption] = useState<string | null>(null)
  const [selectedDashboardOption, setSelectedDashboardOption] = useState<string | null>(null)
  const [selectedCategoryOption, setSelectedCategoryOption] = useState<string | null>(null)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isCreatingDashboard, setIsCreatingDashboard] = useState(false)
  const [showMetabaseInstructions, setShowMetabaseInstructions] = useState(false)
  const sqlForSave = query || lastProcessedSql
  const isDevEnvironment = typeof window !== 'undefined' && window.location.hostname.includes('.dev.nav.no')
  const metabaseQuestionUrl = isDevEnvironment
    ? 'https://metabase.ansatt.dev.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsImRhdGFiYXNlIjo1Njg2LCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9uYXRpdmUiLCJuYXRpdmUiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX1dfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9'
    : 'https://metabase.ansatt.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsImRhdGFiYXNlIjoxNTQ4LCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9uYXRpdmUiLCJuYXRpdmUiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX1dfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9'

  const openSaveModal = () => {
    setSaveError(null)
    setSavedLocation(null)

    const loadSaveData = async () => {
      try {
        const projectItems = await fetchProjects()
        setProjects(projectItems)

        const rememberedProjectId = getLastProjectId()
        const selectedProject =
          (rememberedProjectId ? projectItems.find((project) => project.id === rememberedProjectId) : null) ??
          projectItems.find((project) => project.name === projectName) ??
          null

        if (selectedProject) {
          const projectOptionValue = String(selectedProject.id)
          setSelectedProjectOption(projectOptionValue)
          setProjectName(selectedProject.name)
          const dashboardItems = await fetchDashboards(selectedProject.id)
          setDashboards(dashboardItems)

          const rememberedDashboardId = getLastDashboardId()
          const selectedDashboard =
            (rememberedDashboardId
              ? dashboardItems.find((dashboard) => dashboard.id === rememberedDashboardId)
              : null) ??
            dashboardItems.find((dashboard) => dashboard.name === dashboardName) ??
            null

          setSelectedDashboardOption(selectedDashboard ? String(selectedDashboard.id) : null)
          setDashboardName(selectedDashboard?.name ?? dashboardName)
          if (selectedDashboard) {
            const categoryItems = await fetchCategories(selectedProject.id, selectedDashboard.id)
            const sortedCategories = [...categoryItems].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
            setCategories(sortedCategories)
            setSelectedCategoryOption(sortedCategories[0] ? String(sortedCategories[0].id) : null)
          } else {
            setCategories([])
            setSelectedCategoryOption(null)
          }
        } else {
          setSelectedProjectOption(null)
          setDashboards([])
          setCategories([])
          setSelectedDashboardOption(null)
          setSelectedCategoryOption(null)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Klarte ikke laste team og dashboards'
        setSaveError(message)
      }
    }

    setShowSaveModal(true)
    void loadSaveData()
  }

  const handleProjectSelection = async (option: string, isSelected: boolean) => {
    if (!isSelected) {
      setSelectedProjectOption(null)
      setProjectName('')
      saveLastProjectId(null)
      setDashboards([])
      setCategories([])
      setDashboardName('')
      setSelectedDashboardOption(null)
      setSelectedCategoryOption(null)
      saveLastDashboardId(null)
      return
    }

    try {
      setSaveError(null)
      setDashboardName('')
      setSelectedDashboardOption(null)
      setCategories([])
      setSelectedCategoryOption(null)

      const selectedProjectById = projects.find((project) => String(project.id) === option)
      const selectedProjectByName = projects.find(
        (project) => project.name.trim().toLowerCase() === option.trim().toLowerCase(),
      )
      const selectedProject = selectedProjectById ?? selectedProjectByName

      let projectToUse = selectedProject
      if (!projectToUse) {
        const trimmedName = option.trim()
        if (!trimmedName) return

        setIsCreatingProject(true)
        const createdProject = await createProject(trimmedName, 'Opprettet fra Grafbyggeren')
        projectToUse = createdProject
        setProjects((prev) => [...prev, createdProject])
      }

      setSelectedProjectOption(String(projectToUse.id))
      setProjectName(projectToUse.name)
      saveLastProjectId(projectToUse.id)
      saveLastDashboardId(null)

      const dashboardItems = await fetchDashboards(projectToUse.id)
      setDashboards(dashboardItems)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Klarte ikke velge eller opprette prosjekt'
      setSaveError(message)
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleDashboardSelection = async (option: string, isSelected: boolean) => {
    if (!isSelected) {
      setSelectedDashboardOption(null)
      setDashboardName('')
      setCategories([])
      setSelectedCategoryOption(null)
      saveLastDashboardId(null)
      return
    }

    if (!selectedProjectOption) {
      setSaveError('Velg eller opprett prosjekt først')
      return
    }

    try {
      setSaveError(null)
      const selectedDashboardById = dashboards.find((dashboard) => String(dashboard.id) === option)
      const selectedDashboardByName = dashboards.find(
        (dashboard) => dashboard.name.trim().toLowerCase() === option.trim().toLowerCase(),
      )
      const selectedDashboard = selectedDashboardById ?? selectedDashboardByName

      let dashboardToUse = selectedDashboard
      if (!dashboardToUse) {
        const trimmedName = option.trim()
        if (!trimmedName) return

        setIsCreatingDashboard(true)
        const createdDashboard = await createDashboard(
          Number(selectedProjectOption),
          trimmedName,
          'Opprettet fra Grafbyggeren',
        )
        dashboardToUse = createdDashboard
        setDashboards((prev) => [...prev, createdDashboard])
      }

      setSelectedDashboardOption(String(dashboardToUse.id))
      setDashboardName(dashboardToUse.name)
      saveLastDashboardId(dashboardToUse.id)
      const categoryItems = await fetchCategories(Number(selectedProjectOption), dashboardToUse.id)
      const sortedCategories = [...categoryItems].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
      setCategories(sortedCategories)
      setSelectedCategoryOption(sortedCategories[0] ? String(sortedCategories[0].id) : null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Klarte ikke velge eller opprette dashboard'
      setSaveError(message)
    } finally {
      setIsCreatingDashboard(false)
    }
  }

  const handleSaveChart = async () => {
    if (!graphName.trim() || !projectName.trim() || !dashboardName.trim()) {
      setSaveError('Velg team/prosjekt, dashboard og fyll ut grafnavn.')
      return
    }

    setSavingChart(true)
    setSaveError(null)

    try {
      const saved = await saveChartToBackend({
        projectName: projectName.trim(),
        dashboardName: dashboardName.trim(),
        graphName: graphName.trim(),
        queryName: `${graphName.trim()} - query`,
        graphType: graphType.trim(),
        sqlText: sqlForSave,
        categoryId: selectedCategoryOption ? Number(selectedCategoryOption) : undefined,
      })

      setSavedLocation({
        projectId: saved.project.id,
        dashboardId: saved.dashboard.id,
        projectName: saved.project.name,
        dashboardName: saved.dashboard.name,
      })
      saveLastProjectId(saved.project.id)
      saveLastDashboardId(saved.dashboard.id)
      setShowSaveModal(false)
      setShowSaveSuccessModal(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Klarte ikke lagre grafen'
      setSaveError(message)
    } finally {
      setSavingChart(false)
    }
  }

  const projectOptions = projects.map((project) => ({
    label: project.name,
    value: String(project.id),
  }))
  const dashboardOptions = dashboards.map((dashboard) => ({
    label: dashboard.name,
    value: String(dashboard.id),
  }))
  const categoryOptions = categories.map((category) => ({
    label: category.name?.trim()
      ? category.name.trim().toLowerCase() === 'general'
        ? 'Fane 1'
        : category.name
      : 'Fane 1',
    value: String(category.id),
  }))

  const selectedProjectLabel = projectOptions.find((option) => option.value === selectedProjectOption)?.label
  const selectedDashboardLabel = dashboardOptions.find((option) => option.value === selectedDashboardOption)?.label
  const savedDashboardUrl = savedLocation
    ? `/dashboard/${savedLocation.dashboardId}?projectId=${savedLocation.projectId}`
    : ''

  const handleGoToSavedDashboard = () => {
    if (!savedDashboardUrl) return
    if (typeof window !== 'undefined') {
      window.location.href = savedDashboardUrl
    }
  }

  return (
    <>
      <ResultsPanel
        result={result}
        loading={loading}
        error={error}
        queryStats={queryStats}
        lastAction={null}
        showLoadingMessage={estimating || loading}
        executeQuery={onExecuteQuery}
        handleRetry={onExecuteQuery}
        prepareLineChartData={prepareLineChartData}
        prepareBarChartData={prepareBarChartData}
        preparePieChartData={preparePieChartData}
        sql={lastProcessedSql || query}
        showSqlCode={showSqlCode}
        showEditButton={true}
        showExecuteButton={showExecuteButton}
        showError={showError}
        showSqlMetabaseActions={false}
        showCost={true}
        websiteId={websiteId}
        compactTableActions={true}
        compactTableTitle="Resultater"
        hideTableFooter={true}
        showDownloadReadMore={false}
        onAddToDashboard={openSaveModal}
      />

      {/* JSON Output - below results */}
      {result && showJson && (
        <ReadMore header="JSON" size="small" className="mt-6">
          <pre
            className="bg-[var(--ax-bg-neutral-soft)] border border-gray-300 rounded p-3 text-xs font-mono whitespace-pre-wrap"
            style={{ margin: 0 }}
          >
            {truncateJSON(result)}
          </pre>
        </ReadMore>
      )}

      {/* Metabase section */}
      <div className="space-y-3 mt-6 mb-4">
        <div className="flex flex-wrap gap-2">
          <Button size={dashboardButtonSize} variant="primary" onClick={openSaveModal}>
            Legg til i dashboard
          </Button>
          {!hideMetabaseTransfer && (
            <Button size="small" variant="secondary" onClick={() => setShowMetabaseInstructions((prev) => !prev)}>
              Overfør til Metabase
            </Button>
          )}
        </div>

        {showMetabaseInstructions && (
          <Alert variant="info" size="small">
            <div className="space-y-3">
              <Heading level="2" size="small">
                Legg til i Metabase
              </Heading>
              <ol className="list-decimal pl-5 space-y-1 text-sm">
                <li>Klikk "Kopier spørringen".</li>
                <li>
                  <Link
                    href={metabaseQuestionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1"
                  >
                    Åpne Metabase <ExternalLink size={14} />
                  </Link>
                </li>
                <li>Lim inn SQL-koden og lagre spørsmålet.</li>
                <li>Legg spørsmålet til i ønsket dashboard.</li>
              </ol>

              <div>
                <Button size="small" variant="secondary" onClick={onCopyMetabase} icon={<Copy size={18} />}>
                  {copiedMetabase ? 'Kopiert!' : 'Kopier spørringen'}
                </Button>
              </div>
            </div>
          </Alert>
        )}
      </div>

      <Modal open={showSaveModal} onClose={() => setShowSaveModal(false)} header={{ heading: 'Legg til i dashboard' }}>
        <Modal.Body>
          <div className="space-y-4">
            <UNSAFE_Combobox
              label="Team"
              description="Skriv for å legge til nytt team"
              options={projectOptions}
              selectedOptions={selectedProjectLabel ? [selectedProjectLabel] : []}
              onToggleSelected={(option: string, isSelected: boolean) => {
                void handleProjectSelection(option, isSelected)
              }}
              isMultiSelect={false}
              allowNewValues
              size="small"
              clearButton
              disabled={isCreatingProject || savingChart}
            />
            <UNSAFE_Combobox
              label="Dashboard"
              description="Skriv for å legge til nytt dashboard"
              options={dashboardOptions}
              selectedOptions={selectedDashboardLabel ? [selectedDashboardLabel] : []}
              onToggleSelected={(option: string, isSelected: boolean) => {
                void handleDashboardSelection(option, isSelected)
              }}
              isMultiSelect={false}
              allowNewValues
              size="small"
              clearButton
              disabled={!selectedProjectOption || isCreatingProject || isCreatingDashboard || savingChart}
            />
            {categories.length > 1 && (
              <Select
                label="Fane"
                value={selectedCategoryOption ?? ''}
                onChange={(e) => setSelectedCategoryOption(e.target.value || null)}
                size="small"
                disabled={savingChart}
              >
                <option value="">Velg fane</option>
                {categoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            )}
            <TextField label="Grafnavn" value={graphName} onChange={(e) => setGraphName(e.target.value)} size="small" />
            <Select label="Visning" value={graphType} onChange={(e) => setGraphType(e.target.value)} size="small">
              <option value="LINE">Linjediagram</option>
              <option value="BAR">Stolpediagram</option>
              <option value="PIE">Kakediagram</option>
              <option value="TABLE">Tabell</option>
            </Select>

            {saveError && (
              <Alert variant="error" size="small">
                {saveError}
              </Alert>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={handleSaveChart} loading={savingChart}>
            Legg til
          </Button>
          <Button variant="secondary" onClick={() => setShowSaveModal(false)} disabled={savingChart}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={showSaveSuccessModal && !!savedLocation}
        onClose={() => setShowSaveSuccessModal(false)}
        header={{ heading: 'Graf lagret' }}
        width="small"
      >
        <Modal.Body>
          {savedLocation && <p>Grafen er lagt til i "{savedLocation.dashboardName}". Hva vil du gjøre nå?</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleGoToSavedDashboard}>Gå til dashboard</Button>
          <Button variant="secondary" onClick={() => setShowSaveSuccessModal(false)}>
            Bli her
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
