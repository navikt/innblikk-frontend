export type CanvasStickyColorOption = {
  id: string
  label: string
  background: string
  border: string
  text: string
  textareaBackground: string
  placeholder: string
}

export const CANVAS_STICKY_COLOR_OPTIONS: CanvasStickyColorOption[] = [
  {
    id: 'yellow',
    label: 'Gul',
    background: '#fff5b8',
    border: '#f1dc7d',
    text: '#4a3d00',
    textareaBackground: '#fff7ca',
    placeholder: '#7a6b2a',
  },
  {
    id: 'blue',
    label: 'Blå',
    background: '#dceeff',
    border: '#9bc4ff',
    text: '#12345c',
    textareaBackground: '#ebf5ff',
    placeholder: '#456b99',
  },
  {
    id: 'green',
    label: 'Grønn',
    background: '#ddf8e8',
    border: '#9fddb7',
    text: '#1b4d2d',
    textareaBackground: '#ebfcef',
    placeholder: '#4d8861',
  },
  {
    id: 'pink',
    label: 'Rosa',
    background: '#ffe3f0',
    border: '#f5b4d3',
    text: '#5f2142',
    textareaBackground: '#fff0f7',
    placeholder: '#9c5b7c',
  },
  {
    id: 'purple',
    label: 'Lilla',
    background: '#eee6ff',
    border: '#c9b7ff',
    text: '#3c2a75',
    textareaBackground: '#f6f1ff',
    placeholder: '#6f5cae',
  },
]

export const DEFAULT_CANVAS_STICKY_COLOR = CANVAS_STICKY_COLOR_OPTIONS[0]?.id ?? 'yellow'

export const getCanvasStickyColor = (value?: string | null): string => {
  if (!value) return DEFAULT_CANVAS_STICKY_COLOR
  return CANVAS_STICKY_COLOR_OPTIONS.some((option) => option.id === value) ? value : DEFAULT_CANVAS_STICKY_COLOR
}

export const getCanvasStickyColorOptionById = (id?: string | null): CanvasStickyColorOption =>
  CANVAS_STICKY_COLOR_OPTIONS.find((option) => option.id === getCanvasStickyColor(id)) ?? CANVAS_STICKY_COLOR_OPTIONS[0]
