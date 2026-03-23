import { Button, Alert, Heading, BodyLong } from '@navikt/ds-react'
import { ReadMore } from '@navikt/ds-react'

interface QueryErrorDisplayProps {
  error: string
  lastProcessedSql: string
  onAddDateFilter: () => void
}

export default function QueryErrorDisplay({ error, lastProcessedSql, onAddDateFilter }: QueryErrorDisplayProps) {
  return (
    <Alert variant="error" className="mb-4">
      <Heading level="3" size="small" spacing>
        Query Error
      </Heading>
      <BodyLong>{error}</BodyLong>

      {/* Helper button for partition error */}
      {error.includes('partition elimination') && error.includes('created_at') && (
        <div className="mt-3">
          <Button size="small" variant="secondary" onClick={onAddDateFilter}>
            Legg til datofilter [[AND {'{{created_at}}'}]]
          </Button>
          <p className="text-sm mt-2 text-[var(--ax-text-subtle)]">
            Tabellen krever et filter på created_at for partisjonering
          </p>
        </div>
      )}

      {lastProcessedSql && (
        <ReadMore header="SQL etter filtre" size="small" className="mt-3">
          <pre
            className="bg-[var(--ax-bg-neutral-soft)] border border-[var(--ax-border-neutral-subtle)] rounded p-3 text-xs font-mono whitespace-pre-wrap"
            style={{ margin: 0 }}
          >
            {lastProcessedSql}
          </pre>
        </ReadMore>
      )}
    </Alert>
  )
}
