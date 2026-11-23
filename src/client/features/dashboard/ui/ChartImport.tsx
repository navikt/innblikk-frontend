import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  HStack,
  Link as AkselLink,
  Loader,
  Select,
  TextField,
  UNSAFE_Combobox as Combobox,
  VStack,
} from '@navikt/ds-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock'
import { RESEARCHOPS_SLACK_URL } from '../../../shared/ui/BetaFeatureNotice'
import {
  createDashboard,
  createProject,
  fetchCategories,
  fetchDashboards,
  fetchProjects,
} from '../../oversikt/api/oversiktApi'
import type { DashboardDto, GraphCategoryDto, ProjectDto } from '../../../shared/types/backend'
import type { Website } from '../../../shared/types/website'
import { fetchWebsites } from '../../../shared/api/websiteApi'
import { importTransferredChart } from '../api/importTransferredChart'
import { getMissingWebsiteIds, prepareChartWebsites } from '../utils/chartTransferWebsites'
import { clearChartImport, getTransferEnvironment, initializeChartImport } from '../utils/chartTransfer'

export default function ChartImport() {
  const navigate = useNavigate()
  const [importState] = useState(initializeChartImport)
  const target = getTransferEnvironment(window.location.origin)
  const chart = importState.chart
  const [chartName, setChartName] = useState(chart?.title ?? '')
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [dashboards, setDashboards] = useState<DashboardDto[]>([])
  const [categories, setCategories] = useState<GraphCategoryDto[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [websites, setWebsites] = useState<Website[]>([])
  const [websiteReplacements, setWebsiteReplacements] = useState<Record<string, string>>({})
  const [websitesLoaded, setWebsitesLoaded] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [dashboardId, setDashboardId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingDashboards, setLoadingDashboards] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState<'project' | 'dashboard' | null>(null)
  const [pickerVersion, setPickerVersion] = useState(0)
  const [saved, setSaved] = useState(false)
  const [savedDashboardUrl, setSavedDashboardUrl] = useState('')
  const [error, setError] = useState<string | null>(importState.error)
  const savingRef = useRef(false)
  const creationRef = useRef(false)
  const busy = saving || creating !== null
  const missingWebsiteIds = chart ? getMissingWebsiteIds(chart, websites) : []
  const websiteOptions = websites.map((website) => ({
    value: website.id,
    label: `${website.name} (${website.domain})`,
  }))
  const hasValidWebsiteSelections = missingWebsiteIds.every((id) =>
    websites.some((website) => website.id === websiteReplacements[id]),
  )
  const hasValidCategorySelection =
    categoriesLoaded && (categories.length === 0 || categories.some((item) => item.id === Number(categoryId)))

  useEffect(() => {
    if (!chart || target === null) return
    let active = true
    Promise.all([fetchProjects(), fetchWebsites()])
      .then(([items, websiteItems]) => {
        if (active) {
          setProjects(items)
          setWebsites(websiteItems)
          setWebsitesLoaded(true)
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : `Kunne ikke hente team og nettsteder fra ${target}.`)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [chart, target])

  useEffect(() => {
    if (!projectId || target === null) return
    let active = true
    fetchDashboards(Number(projectId))
      .then((items) => {
        if (active) setDashboards(items)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : `Kunne ikke hente dashboard fra ${target}.`)
      })
      .finally(() => {
        if (active) setLoadingDashboards(false)
      })
    return () => {
      active = false
    }
  }, [projectId, target])

  useEffect(() => {
    if (!projectId || !dashboardId || target === null) return
    let active = true
    fetchCategories(Number(projectId), Number(dashboardId))
      .then((items) => {
        if (active) {
          const sorted = [...items].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
          setCategories(sorted)
          setCategoryId(sorted[0] ? String(sorted[0].id) : '')
          setCategoriesLoaded(true)
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : `Kunne ikke hente faner fra ${target}.`)
      })
      .finally(() => {
        if (active) setLoadingCategories(false)
      })
    return () => {
      active = false
    }
  }, [projectId, dashboardId, target])

  const resetCategories = () => {
    setCategories([])
    setCategoryId('')
    setCategoriesLoaded(false)
    setLoadingCategories(false)
  }

  const selectProject = async (option: string, isSelected: boolean) => {
    if (creationRef.current || savingRef.current) return
    setError(null)
    const name = option.trim()
    const existing = projects.find(
      (project) => String(project.id) === option || project.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (isSelected && existing?.id === Number(projectId)) return
    setProjectId('')
    setDashboardId('')
    setDashboards([])
    setLoadingDashboards(false)
    resetCategories()
    if (!isSelected) return
    if (!name) {
      setError('Skriv et teamnavn.')
      return
    }
    if (existing) {
      setProjectId(String(existing.id))
      setLoadingDashboards(true)
      return
    }
    creationRef.current = true
    setCreating('project')
    try {
      const created = await createProject(name)
      setProjects((items) => [...items, created])
      setProjectId(String(created.id))
      setLoadingDashboards(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke opprette team.')
      setPickerVersion((version) => version + 1)
    } finally {
      creationRef.current = false
      setCreating(null)
    }
  }

  const selectDashboard = async (option: string, isSelected: boolean) => {
    if (creationRef.current || savingRef.current || loadingDashboards || !projectId) return
    setError(null)
    const name = option.trim()
    const existing = dashboards.find(
      (dashboard) => String(dashboard.id) === option || dashboard.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (isSelected && existing?.id === Number(dashboardId)) return
    setDashboardId('')
    resetCategories()
    if (!isSelected) return
    if (!name) {
      setError('Skriv et dashboardnavn.')
      return
    }
    if (existing) {
      setDashboardId(String(existing.id))
      setLoadingCategories(true)
      return
    }
    creationRef.current = true
    setCreating('dashboard')
    try {
      const created = await createDashboard(Number(projectId), name)
      setDashboards((items) => [...items, created])
      setDashboardId(String(created.id))
      setLoadingCategories(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke opprette dashboard.')
      setPickerVersion((version) => version + 1)
    } finally {
      creationRef.current = false
      setCreating(null)
    }
  }

  const save = async () => {
    if (savingRef.current || creationRef.current || saved) return
    if (
      target === null ||
      !chart ||
      !projectId ||
      !dashboardId ||
      !dashboards.some((item) => item.id === Number(dashboardId))
    ) {
      setError('Velg team og dashboard før du lagrer.')
      return
    }
    if (!chartName.trim()) {
      setError('Skriv et grafnavn.')
      return
    }
    if (!websitesLoaded || !hasValidWebsiteSelections) {
      setError(`Velg et nettsted i ${target} for hvert nettsted som mangler.`)
      return
    }
    if (!hasValidCategorySelection) {
      setError('Vent til fanene er hentet, og velg en fane før du legger til grafen.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const graph = await importTransferredChart(
        Number(projectId),
        Number(dashboardId),
        prepareChartWebsites({ ...chart, title: chartName.trim() }, websites, websiteReplacements),
        target,
        categoryId ? Number(categoryId) : undefined,
      )
      setSaved(true)
      const dashboardUrl = `/dashboard/${dashboardId}?categoryId=${graph.categoryId}`
      setSavedDashboardUrl(dashboardUrl)
      clearChartImport()
      await navigate(dashboardUrl, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : `Kunne ikke lagre grafen i ${target}.`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const cancel = async () => {
    if (savingRef.current || creationRef.current) return
    try {
      clearChartImport()
      await navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke avbryte importen.')
    }
  }

  if (!chart || target === null)
    return (
      <Alert variant="error" role="alert">
        {error ?? 'Åpne «Legg til i Innblikk» på nytt fra grafmenyen.'}
      </Alert>
    )

  return (
    <div>
      <PageHeader title={`Legg til i Innblikk ${target}`} />
      <AppBlock>
        <Box maxWidth="40rem" paddingBlock="space-0 space-32">
          <VStack gap="space-24">
            {error && (
              <Alert variant="error" role="alert">
                {error}
              </Alert>
            )}
            {saved ? (
              <Alert variant="success">
                Grafen er lagret i {target}. <Link to={savedDashboardUrl}>Åpne dashboard</Link>
              </Alert>
            ) : loading ? (
              <Loader title={`Henter team og nettsteder fra ${target}`} />
            ) : (
              <>
                <TextField
                  label="Grafnavn"
                  value={chartName}
                  disabled={busy}
                  error={!chartName.trim() ? 'Skriv et grafnavn.' : undefined}
                  onChange={(event) => setChartName(event.target.value)}
                />
                {websitesLoaded &&
                  missingWebsiteIds.map((id, index) => {
                    const source = chart?.sourceWebsites?.find((website) => website.id === id)
                    const sourceName = source?.name || source?.domain || `nettsted ${index + 1}`
                    return (
                      <div key={id} className="focus-within:relative focus-within:z-10">
                        <Combobox
                          label={
                            missingWebsiteIds.length === 1
                              ? `Velg nettsted i ${target}`
                              : `Velg nettsted i ${target} for ${sourceName}`
                          }
                          description={
                            <>
                              Velg nettstedet som skal brukes.
                              {target === 'prod' && index === 0 && (
                                <>
                                  {' '}
                                  Hvis nettstedet mangler sporingskode for prod, kontakt{' '}
                                  <AkselLink href={RESEARCHOPS_SLACK_URL} target="_blank" rel="noopener noreferrer">
                                    #researchops
                                  </AkselLink>{' '}
                                  på Slack.
                                </>
                              )}
                            </>
                          }
                          options={websiteOptions}
                          selectedOptions={websiteOptions.filter((option) => option.value === websiteReplacements[id])}
                          isMultiSelect={false}
                          placeholder="Søk etter nettsted…"
                          clearButton
                          disabled={busy}
                          onToggleSelected={(option, isSelected) =>
                            setWebsiteReplacements((previous) => ({ ...previous, [id]: isSelected ? option : '' }))
                          }
                        />
                      </div>
                    )
                  })}
                {websitesLoaded && missingWebsiteIds.length > 0 && websites.length === 0 && (
                  <Alert variant="error" role="alert">
                    Ingen nettsteder er tilgjengelige i {target}.
                  </Alert>
                )}
                <div className="focus-within:relative focus-within:z-10">
                  <Combobox
                    key={`project-${pickerVersion}`}
                    label={`Team i ${target}`}
                    description="Skriv for å legge til nytt team."
                    options={projects.map((project) => ({ label: project.name, value: String(project.id) }))}
                    selectedOptions={projects
                      .filter((project) => String(project.id) === projectId)
                      .map((project) => project.name)}
                    onToggleSelected={(option, isSelected) => void selectProject(option, isSelected)}
                    isMultiSelect={false}
                    allowNewValues
                    clearButton
                    isLoading={creating === 'project'}
                    disabled={busy || !websitesLoaded}
                  />
                </div>
                <div className="focus-within:relative focus-within:z-10">
                  <Combobox
                    key={`dashboard-${projectId}-${pickerVersion}`}
                    label={`Dashboard i ${target}`}
                    description="Skriv for å legge til nytt dashboard."
                    options={dashboards.map((dashboard) => ({ label: dashboard.name, value: String(dashboard.id) }))}
                    selectedOptions={dashboards
                      .filter((dashboard) => String(dashboard.id) === dashboardId)
                      .map((dashboard) => dashboard.name)}
                    onToggleSelected={(option, isSelected) => void selectDashboard(option, isSelected)}
                    isMultiSelect={false}
                    allowNewValues
                    clearButton
                    isLoading={loadingDashboards || creating === 'dashboard'}
                    disabled={!projectId || loadingDashboards || busy}
                  />
                </div>
                {loadingCategories && <Loader title={`Henter faner fra ${target}`} />}
                {categories.length > 1 && (
                  <Select
                    label="Fane"
                    value={categoryId}
                    disabled={busy}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    {categories.map((category, index) => (
                      <option key={category.id} value={category.id}>
                        {!category.name.trim() || category.name.trim().toLowerCase() === 'general'
                          ? `Fane ${index + 1}`
                          : category.name}
                      </option>
                    ))}
                  </Select>
                )}
                <HStack gap="space-16">
                  <Button
                    onClick={() => void save()}
                    loading={saving}
                    disabled={
                      !chart ||
                      busy ||
                      !chartName.trim() ||
                      !dashboardId ||
                      loadingDashboards ||
                      !hasValidCategorySelection ||
                      !websitesLoaded ||
                      !hasValidWebsiteSelections
                    }
                  >
                    Legg til i Innblikk {target}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void cancel()}>
                    Avbryt
                  </Button>
                </HStack>
              </>
            )}
          </VStack>
        </Box>
      </AppBlock>
    </div>
  )
}
