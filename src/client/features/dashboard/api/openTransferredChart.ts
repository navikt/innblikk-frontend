import type { SavedChart } from '../../../shared/types/savedChart'
import { fetchWebsites } from '../../../shared/api/websiteApi'
import { buildChartImportUrl, buildTransferChart, type TransferEnvironment } from '../utils/chartTransfer'
import { getChartWebsiteIds } from '../utils/chartTransferWebsites'

export async function openTransferredChart(
  chart: SavedChart,
  websiteId: string | undefined,
  target: TransferEnvironment,
) {
  const payload = buildTransferChart(chart, websiteId)
  const tab = window.open('about:blank', '_blank')
  if (!tab) {
    throw new Error('Nettleseren blokkerte den nye fanen. Tillat popup-vinduer og prøv igjen.')
  }
  try {
    tab.opener = null
    const sourceIds = getChartWebsiteIds(payload)
    if (sourceIds.length > 0) {
      payload.sourceWebsites = (await fetchWebsites())
        .filter((website) => sourceIds.includes(website.id))
        .map(({ id, name, domain }) => ({ id, name, domain }))
    }
    if (tab.closed) throw new Error('Den nye fanen ble lukket. Prøv igjen.')
    tab.location.replace(buildChartImportUrl(payload, target, window.location.origin))
  } catch (err) {
    tab.close()
    throw err
  }
}
