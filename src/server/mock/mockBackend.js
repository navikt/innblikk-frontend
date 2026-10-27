import express from 'express'
import { logger } from '../logger.js'

/**
 * In-memory stand-in for innblikk-backend, enabled with MOCK_BACKEND=true.
 *
 * It runs as a tiny HTTP server inside the same process, and BACKEND_BASE_URL is pointed at it
 * (see config/env.js). The real /api/backend/* proxy then talks to it unchanged, so the canvas
 * and presence endpoints that are built from several backend calls keep working.
 *
 * State lives in memory and is reset on every restart. No auth is checked.
 */

const now = () => new Date().toISOString()

const createStore = () => {
  const seq = { project: 0, dashboard: 0, category: 0, graph: 0, query: 0, sidegroup: 0, cohort: 0 }
  const store = {
    projects: [],
    dashboards: [],
    categories: [],
    graphs: [],
    queries: [],
    sidegroups: [],
    cohorts: [],
    userSettings: {},
    next: (kind) => ++seq[kind],
  }

  const project = { id: store.next('project'), name: 'Eksempelprosjekt', description: 'Mock-data', updatedAt: now() }
  store.projects.push(project)
  const dashboard = {
    id: store.next('dashboard'),
    projectId: project.id,
    name: 'Eksempeldashboard',
    description: 'Mock-data',
    updatedAt: now(),
  }
  store.dashboards.push(dashboard)
  const category = {
    id: store.next('category'),
    dashboardId: dashboard.id,
    name: 'Fane 1',
    ordering: 0,
    updatedAt: now(),
  }
  store.categories.push(category)

  const seedGraphs = [
    { name: 'Sidevisninger over tid', graphType: 'LINE', width: 50 },
    { name: 'Topp sider', graphType: 'TABLE', width: 50 },
  ]
  seedGraphs.forEach((g, index) => {
    const graph = { id: store.next('graph'), categoryId: category.id, ordering: index, updatedAt: now(), ...g }
    store.graphs.push(graph)
    store.queries.push({
      id: store.next('query'),
      graphId: graph.id,
      name: g.name,
      sqlText:
        g.graphType === 'LINE'
          ? 'SELECT DATE(created_at) AS date, COUNT(*) AS pageviews FROM `events` GROUP BY date ORDER BY date'
          : 'SELECT url_path AS page, COUNT(*) AS pageviews FROM `events` GROUP BY page ORDER BY pageviews DESC LIMIT 10',
      ordering: 0,
      version: 1,
      updatedAt: now(),
    })
  })

  return store
}

const byOrdering = (a, b) => (a.ordering ?? 0) - (b.ordering ?? 0) || a.id - b.id

export function createMockBackendApp() {
  const store = createStore()
  const app = express()
  app.use(express.json())
  const api = express.Router()
  app.use('/api', api)

  const num = (value) => Number(value)
  const notFound = (res) => res.status(404).json({ error: 'Not found (mock backend)' })

  const removeById = (list, id) => {
    const index = list.findIndex((item) => item.id === id)
    if (index === -1) return null
    return list.splice(index, 1)[0]
  }

  const applyOrdering = (list, entries) => {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const item = list.find((candidate) => candidate.id === num(entry.id))
      if (item) item.ordering = entry.ordering
    }
  }

  // ── Misc ──
  api.get('/stats', (_req, res) =>
    res.json({
      totalUsers: 12,
      activeUsers: 5,
      activeUserWindowDays: 30,
      settings: { grafbygger_always_show_sql: { true: 3, false: 9 } },
    }),
  )
  api.get('/user-settings', (_req, res) => res.json({ settings: store.userSettings }))
  api.put('/user-settings', (req, res) => {
    store.userSettings = { ...store.userSettings, ...(req.body?.settings ?? {}) }
    res.json({ settings: store.userSettings })
  })
  api.post('/user-settings/touch', (_req, res) => res.status(204).end())
  api.post('/canvas/ws-ticket', (_req, res) => res.json({ ticket: 'mock-ticket' }))

  // ── Projects ──
  api.get('/projects', (_req, res) => res.json(store.projects))
  api.post('/projects', (req, res) => {
    const project = {
      id: store.next('project'),
      name: req.body?.name ?? 'Uten navn',
      description: req.body?.description,
      updatedAt: now(),
    }
    store.projects.push(project)
    res.status(201).json(project)
  })
  api.get('/projects/:projectId', (req, res) => {
    const project = store.projects.find((p) => p.id === num(req.params.projectId))
    return project ? res.json(project) : notFound(res)
  })
  api.put('/projects/:projectId', (req, res) => {
    const project = store.projects.find((p) => p.id === num(req.params.projectId))
    if (!project) return notFound(res)
    Object.assign(project, {
      name: req.body?.name ?? project.name,
      description: req.body?.description,
      updatedAt: now(),
    })
    res.json(project)
  })
  api.delete('/projects/:projectId', (req, res) => {
    const id = num(req.params.projectId)
    if (!removeById(store.projects, id)) return notFound(res)
    store.dashboards.filter((d) => d.projectId === id).forEach((d) => removeById(store.dashboards, d.id))
    res.status(204).end()
  })

  // ── Dashboards ──
  api.get('/projects/:projectId/dashboards', (req, res) =>
    res.json(store.dashboards.filter((d) => d.projectId === num(req.params.projectId))),
  )
  api.post('/projects/:projectId/dashboards', (req, res) => {
    const dashboard = {
      id: store.next('dashboard'),
      projectId: num(req.params.projectId),
      name: req.body?.name ?? 'Uten navn',
      description: req.body?.description,
      updatedAt: now(),
    }
    store.dashboards.push(dashboard)
    res.status(201).json(dashboard)
  })
  api.get('/projects/:projectId/dashboards/:dashboardId', (req, res) => {
    const dashboard = store.dashboards.find((d) => d.id === num(req.params.dashboardId))
    return dashboard ? res.json(dashboard) : notFound(res)
  })
  api.put('/projects/:projectId/dashboards/:dashboardId', (req, res) => {
    const dashboard = store.dashboards.find((d) => d.id === num(req.params.dashboardId))
    if (!dashboard) return notFound(res)
    Object.assign(dashboard, {
      name: req.body?.name ?? dashboard.name,
      description: req.body?.description,
      projectId: req.body?.projectId ?? dashboard.projectId,
      updatedAt: now(),
    })
    res.json(dashboard)
  })
  api.delete('/projects/:projectId/dashboards/:dashboardId', (req, res) => {
    if (!removeById(store.dashboards, num(req.params.dashboardId))) return notFound(res)
    res.status(204).end()
  })

  // ── Categories ──
  const categoriesPath = '/projects/:projectId/dashboards/:dashboardId/categories'
  api.get(categoriesPath, (req, res) =>
    res.json(store.categories.filter((c) => c.dashboardId === num(req.params.dashboardId)).sort(byOrdering)),
  )
  api.post(`${categoriesPath}/ordering`, (req, res) => {
    applyOrdering(store.categories, req.body)
    res.status(204).end()
  })
  api.post(categoriesPath, (req, res) => {
    const dashboardId = num(req.params.dashboardId)
    const category = {
      id: store.next('category'),
      dashboardId,
      name: req.body?.name ?? 'Ny fane',
      ordering: store.categories.filter((c) => c.dashboardId === dashboardId).length,
      updatedAt: now(),
    }
    store.categories.push(category)
    res.status(201).json(category)
  })
  api.put(`${categoriesPath}/:categoryId`, (req, res) => {
    const category = store.categories.find((c) => c.id === num(req.params.categoryId))
    if (!category) return notFound(res)
    Object.assign(category, { name: req.body?.name ?? category.name, updatedAt: now() })
    res.json(category)
  })
  api.delete(`${categoriesPath}/:categoryId`, (req, res) => {
    const id = num(req.params.categoryId)
    if (!removeById(store.categories, id)) return notFound(res)
    store.graphs.filter((g) => g.categoryId === id).forEach((g) => removeById(store.graphs, g.id))
    res.status(204).end()
  })

  // ── Graphs ──
  const graphsPath = `${categoriesPath}/:categoryId/graphs`
  api.get(graphsPath, (req, res) =>
    res.json(store.graphs.filter((g) => g.categoryId === num(req.params.categoryId)).sort(byOrdering)),
  )
  api.post(`${graphsPath}/ordering`, (req, res) => {
    applyOrdering(store.graphs, req.body)
    res.status(204).end()
  })
  api.post(graphsPath, (req, res) => {
    const categoryId = num(req.params.categoryId)
    const graph = {
      id: store.next('graph'),
      categoryId,
      name: req.body?.name ?? 'Uten navn',
      description: req.body?.description,
      graphType: req.body?.graphType ?? 'LINE',
      width: req.body?.width ?? 50,
      ordering: store.graphs.filter((g) => g.categoryId === categoryId).length,
      updatedAt: now(),
    }
    store.graphs.push(graph)
    res.status(201).json(graph)
  })
  api.get(`${graphsPath}/:graphId`, (req, res) => {
    const graph = store.graphs.find((g) => g.id === num(req.params.graphId))
    return graph ? res.json(graph) : notFound(res)
  })
  api.put(`${graphsPath}/:graphId`, (req, res) => {
    const graph = store.graphs.find((g) => g.id === num(req.params.graphId))
    if (!graph) return notFound(res)
    Object.assign(graph, {
      ...req.body,
      id: graph.id,
      categoryId: req.body?.categoryId ?? graph.categoryId,
      updatedAt: now(),
    })
    res.json(graph)
  })
  api.delete(`${graphsPath}/:graphId`, (req, res) => {
    const id = num(req.params.graphId)
    if (!removeById(store.graphs, id)) return notFound(res)
    store.queries.filter((q) => q.graphId === id).forEach((q) => removeById(store.queries, q.id))
    res.status(204).end()
  })

  // ── Queries ──
  const queriesPath = `${graphsPath}/:graphId/queries`
  api.get(queriesPath, (req, res) =>
    res.json(store.queries.filter((q) => q.graphId === num(req.params.graphId)).sort(byOrdering)),
  )
  api.post(`${queriesPath}/ordering`, (req, res) => {
    applyOrdering(store.queries, req.body)
    res.status(204).end()
  })
  api.post(queriesPath, (req, res) => {
    const graphId = num(req.params.graphId)
    const query = {
      id: store.next('query'),
      graphId,
      name: req.body?.name ?? 'Uten navn',
      sqlText: req.body?.sqlText ?? '',
      ordering: store.queries.filter((q) => q.graphId === graphId).length,
      version: 1,
      updatedAt: now(),
    }
    store.queries.push(query)
    res.status(201).json(query)
  })
  api.put(`${queriesPath}/:queryId`, (req, res) => {
    const query = store.queries.find((q) => q.id === num(req.params.queryId))
    if (!query) return notFound(res)
    Object.assign(query, {
      name: req.body?.name ?? query.name,
      sqlText: req.body?.sqlText ?? query.sqlText,
      version: (query.version ?? 1) + 1,
      updatedAt: now(),
    })
    res.json(query)
  })
  api.delete(`${queriesPath}/:queryId`, (req, res) => {
    if (!removeById(store.queries, num(req.params.queryId))) return notFound(res)
    res.status(204).end()
  })

  // ── Sidegroups ──
  api.get('/sidegroup', (_req, res) => res.json(store.sidegroups))
  api.post('/sidegroup', (req, res) => {
    const sidegroup = { id: String(store.next('sidegroup')), ...req.body }
    store.sidegroups.push(sidegroup)
    res.status(201).json(sidegroup)
  })
  api.put('/sidegroup/:id', (req, res) => {
    const sidegroup = store.sidegroups.find((s) => s.id === req.params.id)
    if (!sidegroup) return notFound(res)
    Object.assign(sidegroup, req.body, { id: sidegroup.id })
    res.json(sidegroup)
  })
  api.delete('/sidegroup/:id', (req, res) => {
    const index = store.sidegroups.findIndex((s) => s.id === req.params.id)
    if (index === -1) return notFound(res)
    store.sidegroups.splice(index, 1)
    res.status(204).end()
  })

  // ── Cohorts ──
  const summarize = ({ id, websiteId, name, description }) => ({ id, websiteId, name, description })
  const findCohort = (id) => store.cohorts.find((c) => c.id === id)
  api.get('/cohort', (req, res) =>
    res.json(store.cohorts.filter((c) => !c.deleted && c.websiteId === req.query.websiteId).map(summarize)),
  )
  api.get('/cohort/trash', (req, res) =>
    res.json(store.cohorts.filter((c) => c.deleted && c.websiteId === req.query.websiteId).map(summarize)),
  )
  api.post('/cohort', (req, res) => {
    const cohort = {
      ...req.body,
      id: String(store.next('cohort')),
      root: req.body?.root ?? null,
      deleted: false,
    }
    store.cohorts.push(cohort)
    res.status(201).json(cohort)
  })
  api.get('/cohort/:id', (req, res) => {
    const cohort = findCohort(req.params.id)
    return cohort ? res.json(cohort) : notFound(res)
  })
  api.put('/cohort/:id', (req, res) => {
    const cohort = findCohort(req.params.id)
    if (!cohort) return notFound(res)
    Object.assign(cohort, req.body, { id: cohort.id })
    res.json(cohort)
  })
  api.put('/cohort/:id/criteria', (req, res) => {
    const cohort = findCohort(req.params.id)
    if (!cohort) return notFound(res)
    cohort.root = req.body
    res.json(cohort.root)
  })
  api.post('/cohort/:id/restore', (req, res) => {
    const cohort = findCohort(req.params.id)
    if (!cohort) return notFound(res)
    cohort.deleted = false
    res.json(summarize(cohort))
  })
  api.delete('/cohort/:id/permanent', (req, res) => {
    const index = store.cohorts.findIndex((c) => c.id === req.params.id)
    if (index === -1) return notFound(res)
    store.cohorts.splice(index, 1)
    res.status(204).end()
  })
  api.delete('/cohort/:id', (req, res) => {
    const cohort = findCohort(req.params.id)
    if (!cohort) return notFound(res)
    cohort.deleted = true
    res.status(204).end()
  })

  api.use((req, res) => {
    logger.warn({ method: req.method, url: req.originalUrl }, '[Mock Backend] Unmocked endpoint')
    res.status(404).json({ error: `Endpoint not implemented in mock backend: ${req.method} ${req.originalUrl}` })
  })

  return app
}

export function startMockBackend({ port }) {
  const server = createMockBackendApp().listen(port, '127.0.0.1', () => {
    logger.info({ port }, '[Mock Backend] Running in-memory stand-in for innblikk-backend (MOCK_BACKEND=true)')
  })
  return server
}
