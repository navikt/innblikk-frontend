import { useEffect, useRef, useState } from 'react'
import { Alert, BodyShort, Button, Loader, Select } from '@navikt/ds-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader'
import { fetchCategories, fetchDashboards, fetchProjects } from '../../oversikt/api/oversiktApi'
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
  const [saved, setSaved] = useState(false)
  const [savedDashboardUrl, setSavedDashboardUrl] = useState('')
  const [error, setError] = useState<string | null>(importState.error)
  const savingRef = useRef(false)
  const missingWebsiteIds = chart ? getMissingWebsiteIds(chart, websites) : []
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

  const save = async () => {
    if (savingRef.current || saved) return
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
        prepareChartWebsites(chart, websites, websiteReplacements),
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
      <div className="flex flex-col gap-4 px-4 pb-4 max-w-2xl">
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
            {chart && <BodyShort>Graf: {chart.title}</BodyShort>}
            {websitesLoaded &&
              missingWebsiteIds.map((id, index) => {
                const source = chart?.sourceWebsites?.find((website) => website.id === id)
                const sourceName = source?.name || source?.domain || `nettsted ${index + 1}`
                return (
                  <Select
                    key={id}
                    label={
                      missingWebsiteIds.length === 1
                        ? `Velg nettsted i ${target}`
                        : `Velg nettsted i ${target} for ${sourceName}`
                    }
                    description={
                      source ? `${source.domain} finnes ikke i ${target}.` : `Nettstedet finnes ikke i ${target}.`
                    }
                    value={websiteReplacements[id] ?? ''}
                    disabled={saving}
                    onChange={(event) =>
                      setWebsiteReplacements((previous) => ({ ...previous, [id]: event.target.value }))
                    }
                  >
                    <option value="">Velg nettsted</option>
                    {websites.map((website) => (
                      <option key={website.id} value={website.id}>
                        {website.name} ({website.domain})
                      </option>
                    ))}
                  </Select>
                )
              })}
            {websitesLoaded && missingWebsiteIds.length > 0 && websites.length === 0 && (
              <Alert variant="error" role="alert">
                Ingen nettsteder er tilgjengelige i {target}.
              </Alert>
            )}
            <Select
              label={`Team i ${target}`}
              value={projectId}
              disabled={saving}
              onChange={(event) => {
                setProjectId(event.target.value)
                setDashboardId('')
                setDashboards([])
                setLoadingDashboards(Boolean(event.target.value))
                setCategories([])
                setCategoryId('')
                setCategoriesLoaded(false)
                setLoadingCategories(false)
                setError(null)
              }}
            >
              <option value="">Velg team</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            <Select
              label={`Dashboard i ${target}`}
              value={dashboardId}
              disabled={!projectId || loadingDashboards || saving}
              onChange={(event) => {
                setDashboardId(event.target.value)
                setCategories([])
                setCategoryId('')
                setCategoriesLoaded(false)
                setLoadingCategories(Boolean(event.target.value))
                setError(null)
              }}
            >
              <option value="">{loadingDashboards ? 'Henter dashboard…' : 'Velg dashboard'}</option>
              {dashboards.map((dashboard) => (
                <option key={dashboard.id} value={dashboard.id}>
                  {dashboard.name}
                </option>
              ))}
            </Select>
            {loadingCategories && <Loader title={`Henter faner fra ${target}`} />}
            {categories.length > 1 && (
              <Select
                label="Fane"
                value={categoryId}
                disabled={saving}
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
            {projectId && !loadingDashboards && dashboards.length === 0 && !error && (
              <Alert variant="info">
                Teamet har ingen dashboard i {target}. Opprett et dashboard i {target} først.
              </Alert>
            )}
            <Button
              onClick={() => void save()}
              loading={saving}
              disabled={
                !chart ||
                !dashboardId ||
                loadingDashboards ||
                !hasValidCategorySelection ||
                !websitesLoaded ||
                !hasValidWebsiteSelections
              }
            >
              Legg til i Innblikk {target}
            </Button>
            <Button variant="secondary" disabled={saving} onClick={() => void cancel()}>
              Avbryt
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
