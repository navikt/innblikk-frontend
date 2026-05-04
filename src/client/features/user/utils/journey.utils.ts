import type { JourneyData, JourneyLink } from '../model'

export function buildAppliedFilterKey(
  websiteId: string | undefined,
  startUrl: string,
  period: string,
  customStartDate: Date | undefined,
  customEndDate: Date | undefined,
  steps: number,
  limit: number,
  direction: string,
): string {
  return JSON.stringify({
    websiteId: websiteId ?? null,
    startUrl,
    period,
    customStartDate: customStartDate?.toISOString() ?? null,
    customEndDate: customEndDate?.toISOString() ?? null,
    steps,
    limit,
    direction,
  })
}

export function downloadJourneyCSV(rawData: JourneyData | null, websiteName: string, journeyDirection: string): void {
  if (!rawData || !rawData.links || rawData.links.length === 0) return

  const headers = ['Steg', 'Til side', 'Fra side', 'Antall brukere']
  const csvRows = [
    headers.join(','),
    ...rawData.links.map((link: JourneyLink) => {
      const sourceNode = rawData.nodes.find((n) => rawData.nodes.indexOf(n) === link.source)
      const targetNode = rawData.nodes.find((n) => rawData.nodes.indexOf(n) === link.target)
      const stepMatch = sourceNode?.nodeId?.match(/^(\d+):/)
      let step: number | string = '-'
      if (stepMatch) {
        const rawStep = parseInt(stepMatch[1])
        step = journeyDirection === 'backward' ? rawStep * -1 : rawStep
      }

      const escapeCSV = (val: unknown) => {
        const str = val !== null && val !== undefined ? String(val) : ''
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }

      return [step, escapeCSV(targetNode?.name || '-'), escapeCSV(sourceNode?.name || '-'), link.value].join(',')
    }),
  ]

  const csvContent = csvRows.join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `brukerreiser_${websiteName || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function downloadJourneyExcel(
  rawData: JourneyData | null,
  websiteName: string,
  journeyDirection: string,
): Promise<void> {
  if (!rawData || !rawData.links || rawData.links.length === 0) return

  const worksheetData = [
    ['Steg', 'Til side', 'Fra side', 'Antall brukere'],
    ...rawData.links.map((link: JourneyLink) => {
      const sourceNode = rawData.nodes.find((n) => rawData.nodes.indexOf(n) === link.source)
      const targetNode = rawData.nodes.find((n) => rawData.nodes.indexOf(n) === link.target)
      const stepMatch = sourceNode?.nodeId?.match(/^(\d+):/)
      let step: number | string = '-'
      if (stepMatch) {
        const rawStep = parseInt(stepMatch[1])
        step = journeyDirection === 'backward' ? rawStep * -1 : rawStep
      }

      return [step, targetNode?.name || '-', sourceNode?.name || '-', link.value]
    }),
  ]

  let xlsx: any
  try {
    const preferred = 'xlsx-js-style'
    xlsx = await import(/* @vite-ignore */ preferred)
  } catch {
    try {
      const fallback = 'xlsx'
      xlsx = await import(/* @vite-ignore */ fallback)
    } catch {
      console.error('Mangler XLSX-bibliotek (xlsx-js-style/xlsx). Kjør npm install.')
      return
    }
  }

  const XLSXUtils = xlsx.utils
  const XLSXWrite = xlsx.write
  const worksheet = XLSXUtils.aoa_to_sheet(worksheetData)
  const workbook = XLSXUtils.book_new()
  XLSXUtils.book_append_sheet(workbook, worksheet, 'Brukerreiser')
  const wbout = XLSXWrite(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `brukerreiser_${websiteName || 'data'}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function copyShareLink(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(window.location.href)
    return true
  } catch (err) {
    console.error('Failed to copy link:', err)
    return false
  }
}
