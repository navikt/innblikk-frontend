export type VisualizationMode = 'clickmap' | 'heatmap' | 'scrollmap'

export const CLICKMAP_VISUALIZATION_MODE_OPTIONS: Array<{ value: VisualizationMode; label: string }> = [
  { value: 'clickmap', label: 'Klikkkart' },
  { value: 'heatmap', label: 'Varmekart' },
  { value: 'scrollmap', label: 'Scrollkart' },
]

export const ROUTE_BY_VISUALIZATION_MODE: Record<VisualizationMode, string> = {
  clickmap: '/klikkoversikt',
  heatmap: '/klikkoversikt/varmekart',
  scrollmap: '/klikkoversikt/scrollkart',
}

export const getClickmapDatasetFromVisualizationMode = (mode: VisualizationMode): 'clickmap' | 'scrollmap' =>
  mode === 'scrollmap' ? 'scrollmap' : 'clickmap'

export const isVisualizationMode = (value: unknown): value is VisualizationMode =>
  value === 'clickmap' || value === 'heatmap' || value === 'scrollmap'
