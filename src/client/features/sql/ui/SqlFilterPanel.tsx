import { Heading, TextField } from '@navikt/ds-react'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import type { Website } from '../model/types'

interface SqlFilterPanelProps {
  hasMetabaseDateFilter: boolean
  hasUrlPathFilter: boolean
  hasWebsiteIdPlaceholder: boolean
  hasNettsidePlaceholder: boolean
  hasHardcodedWebsiteId: boolean
  customVariables: string[]
  customVariableValues: Record<string, string>
  selectedWebsite: Website | null
  period: string
  dateRange: { from: Date | undefined; to: Date | undefined }
  urlPath: string
  onWebsiteChange: (website: Website | null) => void
  onPeriodChange: (period: string) => void
  onStartDateChange: (date: Date | undefined) => void
  onEndDateChange: (date: Date | undefined) => void
  onUrlPathChange: (value: string) => void
  onCustomVariableChange: (update: (prev: Record<string, string>) => Record<string, string>) => void
}

export default function SqlFilterPanel({
  hasMetabaseDateFilter,
  hasUrlPathFilter,
  hasWebsiteIdPlaceholder,
  hasNettsidePlaceholder,
  hasHardcodedWebsiteId,
  customVariables,
  customVariableValues,
  selectedWebsite,
  period,
  dateRange,
  urlPath,
  onWebsiteChange,
  onPeriodChange,
  onStartDateChange,
  onEndDateChange,
  onUrlPathChange,
  onCustomVariableChange,
}: SqlFilterPanelProps) {
  const showFilters =
    hasMetabaseDateFilter ||
    hasUrlPathFilter ||
    hasWebsiteIdPlaceholder ||
    hasNettsidePlaceholder ||
    hasHardcodedWebsiteId ||
    customVariables.length > 0

  if (!showFilters) return null

  return (
    <>
      <Heading size="xsmall" level="3" style={{ paddingBottom: '8px' }}>
        Filtre
      </Heading>
      <div
        className="flex flex-col gap-4 mb-4 p-3 border border-[var(--ax-border-neutral-subtle)] rounded"
        style={{ backgroundColor: 'var(--ax-bg-default, #fff)' }}
      >
        {(hasWebsiteIdPlaceholder || hasNettsidePlaceholder || hasHardcodedWebsiteId) && (
          <div className="flex-1 min-w-[260px]">
            <WebsitePicker
              selectedWebsite={selectedWebsite}
              onWebsiteChange={onWebsiteChange}
              variant="minimal"
              disableAutoRestore={hasHardcodedWebsiteId}
              customLabel={hasHardcodedWebsiteId ? 'Nettside eller app (overskriver SQL-koden)' : 'Nettside eller app'}
            />
          </div>
        )}

        {hasMetabaseDateFilter && (
          <div className="flex-1 min-w-[260px]">
            <PeriodPicker
              period={period}
              onPeriodChange={onPeriodChange}
              startDate={dateRange.from}
              onStartDateChange={onStartDateChange}
              endDate={dateRange.to}
              onEndDateChange={onEndDateChange}
            />
          </div>
        )}

        {hasUrlPathFilter && (
          <div className="flex-1 min-w-[240px]">
            <TextField
              label="URL"
              size="small"
              description="F.eks. / for forsiden"
              value={urlPath}
              onChange={(e) => onUrlPathChange(e.target.value)}
            />
          </div>
        )}

        {customVariables.map((varName) => (
          <div key={varName} className="flex-1 min-w-[200px]">
            <TextField
              label={varName.replace(/_/g, ' ')}
              size="small"
              value={customVariableValues[varName] || ''}
              onChange={(e) =>
                onCustomVariableChange((prev) => ({
                  ...prev,
                  [varName]: e.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>
    </>
  )
}
