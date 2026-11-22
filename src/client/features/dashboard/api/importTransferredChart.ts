import { createCategory, createGraph, createQuery, deleteGraph, fetchCategories } from '../../oversikt/api/oversiktApi'
import { convertSqlForEnvironment, type TransferChart, type TransferEnvironment } from '../utils/chartTransfer'

export async function importTransferredChart(
  projectId: number,
  dashboardId: number,
  chart: TransferChart,
  target: TransferEnvironment,
  categoryId?: number,
) {
  const categories = await fetchCategories(projectId, dashboardId)
  const selectedCategory = categoryId === undefined ? categories[0] : categories.find((item) => item.id === categoryId)
  if (categoryId !== undefined && !selectedCategory) {
    throw new Error('Fanen finnes ikke lenger i dashboardet. Velg dashboard på nytt og prøv igjen.')
  }
  const category = selectedCategory ?? (await createCategory(projectId, dashboardId, 'Standard'))
  const graph = await createGraph(projectId, dashboardId, category.id, {
    name: chart.title,
    graphType: chart.graphType,
    width: chart.width,
    description: chart.description,
  })
  try {
    for (const query of chart.queries) {
      await createQuery(projectId, dashboardId, category.id, graph.id, {
        name: query.name,
        sqlText: convertSqlForEnvironment(query.sql, target),
      })
    }
  } catch (error) {
    try {
      await deleteGraph(projectId, dashboardId, category.id, graph.id)
    } catch (rollbackError) {
      console.error('Could not remove incomplete imported chart', rollbackError)
      throw Object.assign(
        new Error(
          'Lagringen feilet, og den ufullstendige grafen kunne ikke fjernes. Slett grafen i dashboardet før du prøver igjen.',
        ),
        { cause: rollbackError },
      )
    }
    throw error
  }
  return graph
}
