// UI Components
export { default as Funnel } from './ui/Funnel'

// Types
export type {
  StepParam,
  FunnelStep,
  QueryStats,
  FunnelResultRow,
  TimingResultRow,
  FunnelApiResponse,
  TimingApiResponse,
  EventsApiResponse,
} from './model/types'

// Hooks
export { useFunnel } from './hooks/useFunnel'

// API
export { fetchFunnelData, fetchTimingData, fetchWebsiteEvents } from './api/funnelApi'

// Utils
export {
  formatDuration,
  downloadCSV,
  copyToClipboard,
  generateMetabaseFunnelSql,
  generateMetabaseTimingSql,
} from './utils/funnelUtils'
export {
  parseStepsFromParams,
  addStep,
  removeStep,
  updateStepValue,
  updateStepType,
  updateStepEventScope,
  addStepParam,
  removeStepParam,
  updateStepParam,
  normalizeStepUrl,
} from './utils/stepUtils'
