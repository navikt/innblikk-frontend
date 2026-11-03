import type { ReactNode } from 'react'
import { Alert, Tabs } from '@navikt/ds-react'
import FunnelChart from '../../../analysis/ui/funnel/FunnelChart'
import HorizontalFunnelChart from '../../../analysis/ui/funnel/HorizontalFunnelChart'
import type { DashboardFunnelView } from '../../utils/funnelData'
import type { FunnelResultRow } from '../../../funnel/model/types'

interface DashboardWidgetFunnelProps {
  steps: FunnelResultRow[] | null
  defaultView: 'funnel' | 'table'
  presentation?: DashboardFunnelView
  table: ReactNode
  websiteId?: string
  period?: string
  heightPx?: number
}

const DashboardWidgetFunnel = ({
  steps,
  defaultView,
  presentation = 'vertical',
  table,
  websiteId,
  period,
  heightPx,
}: DashboardWidgetFunnelProps) => (
  <div style={heightPx ? { maxHeight: heightPx, overflowY: 'auto' } : undefined}>
    <Tabs defaultValue={defaultView}>
      <Tabs.List>
        <Tabs.Tab value="funnel" label="Trakt" />
        <Tabs.Tab value="table" label="Tabell" />
      </Tabs.List>
      <Tabs.Panel value="funnel">
        {steps ? (
          presentation === 'horizontal' ? (
            <HorizontalFunnelChart data={steps} websiteId={websiteId} period={period} />
          ) : (
            <FunnelChart data={steps} websiteId={websiteId} period={period} />
          )
        ) : (
          <Alert variant="error" role="alert" className="mt-4">
            Traktvisning krever minst to steg med navn og ikke-negative heltall. Antallet kan ikke øke mellom stegene.
            Bruk kolonnene step/url/count, step_number/step/count eller name/value.
          </Alert>
        )}
      </Tabs.Panel>
      <Tabs.Panel value="table" className="pt-4">
        {table}
      </Tabs.Panel>
    </Tabs>
  </div>
)

export default DashboardWidgetFunnel
