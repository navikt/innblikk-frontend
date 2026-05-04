import { Button } from '@navikt/ds-react'
import { ReadMore } from '@navikt/ds-react'

interface AvailableTablesInfoProps {
  projectId: string
}

function TableEntry({ label, tableName }: { label: string; tableName: string }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="font-semibold text-sm mt-2">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs bg-[var(--ax-bg-neutral-soft)] px-2 py-1 rounded border border-[var(--ax-border-neutral-subtle)]">
          {tableName}
        </span>
        <Button
          size="xsmall"
          variant="tertiary"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(tableName)
          }}
        >
          Kopier
        </Button>
      </div>
    </li>
  )
}

export default function AvailableTablesInfo({ projectId }: AvailableTablesInfoProps) {
  return (
    <ReadMore header="Tilgjengelige tabeller" size="small" className="mt-4">
      <ul className="space-y-3">
        <TableEntry label="Nettsider/apper" tableName={`${projectId}.umami.public_website`} />
        <TableEntry label="Personer" tableName={`${projectId}.umami_views.session`} />
        <TableEntry label="Alle hendelser" tableName={`${projectId}.umami_views.event`} />
        <TableEntry label="Egenfedinerte hendelser metadata" tableName={`${projectId}.umami_views.event_data`} />
      </ul>
      <ReadMore header="Umami (legacy)" size="small" className="mt-6 mb-6">
        <ul className="space-y-3">
          <TableEntry label="Nettsider/apper" tableName={`${projectId}.umami.public_website`} />
          <TableEntry label="Personer" tableName={`${projectId}.umami.public_session`} />
          <TableEntry label="Alle hendelser" tableName={`${projectId}.umami.public_website_event`} />
          <TableEntry label="Egenfedinerte hendelser metadata" tableName={`${projectId}.umami.public_event_data`} />
        </ul>
      </ReadMore>
    </ReadMore>
  )
}
