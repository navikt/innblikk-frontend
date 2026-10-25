import { Button, Alert, Heading, BodyLong } from '@navikt/ds-react'
import { ReadMore } from '@navikt/ds-react'
import { Events } from '@navikt/analytics-types'
import { trackEvent } from '../../../shared/lib/trackEvent.ts'

interface QueryErrorDisplayProps {
  error: string
  lastProcessedSql: string
  onAddDateFilter: () => void
  groupByField?: string | null
  onAddGroupBy?: () => void
  quoteFixValues?: string[]
  onAddQuotes?: () => void
  joinSuggestion?: {
    field: string
    sourceTitle: string
    tableTitle: string
    joinSql: string
    warning: string | null
  } | null
  onAddJoin?: () => void
}

export default function QueryErrorDisplay({
  error,
  lastProcessedSql,
  onAddDateFilter,
  groupByField,
  onAddGroupBy,
  quoteFixValues,
  onAddQuotes,
  joinSuggestion,
  onAddJoin,
}: QueryErrorDisplayProps) {
  return (
    <Alert variant="error" className="mb-4">
      <Heading level="3" size="small" spacing>
        Feil i spørringen
      </Heading>
      {groupByField && onAddGroupBy ? (
        <div className="flex flex-col items-start gap-3">
          <BodyLong>
            Når du teller og samtidig viser {groupByField}, må resultatene grupperes etter {groupByField}.
          </BodyLong>
          <Button size="small" variant="secondary" type="button" onClick={onAddGroupBy}>
            Legg til GROUP BY {groupByField}
          </Button>
        </div>
      ) : quoteFixValues?.length && onAddQuotes ? (
        <div className="flex flex-col items-start gap-3">
          <BodyLong>
            Tekstverdier må stå i anførselstegn, for eksempel <code>'{quoteFixValues[0]}'</code>.
          </BodyLong>
          <Button size="small" variant="secondary" type="button" onClick={onAddQuotes}>
            Legg til anførselstegn
          </Button>
          <ReadMore header="Teknisk feilmelding" size="small">
            <BodyLong>{error}</BodyLong>
          </ReadMore>
        </div>
      ) : joinSuggestion && onAddJoin ? (
        <div className="flex flex-col items-start gap-3">
          <BodyLong>
            <code>{joinSuggestion.field}</code> finnes i {joinSuggestion.tableTitle}, ikke i{' '}
            {joinSuggestion.sourceTitle}.
          </BodyLong>
          {joinSuggestion.warning && <BodyLong size="small">{joinSuggestion.warning}</BodyLong>}
          <Button size="small" variant="secondary" type="button" onClick={onAddJoin}>
            Koble til {joinSuggestion.tableTitle}
          </Button>
          <ReadMore header="Vis JOIN-kode" size="small">
            <pre className="m-0 whitespace-pre-wrap break-words text-xs">{joinSuggestion.joinSql}</pre>
          </ReadMore>
          <ReadMore header="Teknisk feilmelding" size="small">
            <BodyLong>{error}</BodyLong>
          </ReadMore>
        </div>
      ) : (
        <BodyLong>{error}</BodyLong>
      )}

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
        <ReadMore
          header="SQL etter filtre"
          size="small"
          className="mt-3"
          onOpenChange={(open) =>
            trackEvent(open ? Events.LES_MER_APNET : Events.LES_MER_LUKKET, {
              seksjon: 'sql',
              tittel: 'sporre-feil-detaljer',
            })
          }
        >
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
