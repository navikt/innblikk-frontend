import { BodyShort, ReadMore, VStack } from '@navikt/ds-react'
import { signalLabels, signalSummaries } from '../model/repetition'
import type { RepetitionResult, RepetitionSignal } from '../model/repetition'

const count = (value: number) => value.toLocaleString('nb-NO')

export default function AnalysisInfo({ summary }: { summary?: RepetitionResult['summary'] }) {
  const caveats = summary
    ? [
        summary.interactionEvents > summary.targetedInteractionEvents &&
          `${count(summary.interactionEvents - summary.targetedInteractionEvents)} klikk uten kjent mål`,
        summary.eventsWithoutVisit > 0 && `${count(summary.eventsWithoutVisit)} hendelser uten visit_id`,
        summary.tiedTimestamps > 0 && `${count(summary.tiedTimestamps)} hendelser med samme tidsstempel`,
      ].filter(Boolean)
    : []
  return (
    <ReadMore header="Om analysen">
      <VStack gap="space-8">
        <ul className="m-0 list-disc space-y-1 pl-5">
          {(Object.keys(signalLabels) as RepetitionSignal[]).map((signal) => (
            <li key={signal}>
              <BodyShort size="small">
                <strong>{signalLabels[signal]}:</strong> {signalSummaries[signal]}
              </BodyShort>
            </li>
          ))}
        </ul>
        <BodyShort size="small" textColor="subtle">
          Innen ett besøk. Funnene er signaler, ikke bekreftet frustrasjon. Besøkende telles med cookie-ID, ellers
          fingeravtrykk.
        </BodyShort>
        {summary && (
          <BodyShort size="small">
            {count(summary.totalEvents)} hendelser · {count(summary.totalVisits)} besøk
            {caveats.length > 0 && ` · ${caveats.join(' · ')}`}
          </BodyShort>
        )}
      </VStack>
    </ReadMore>
  )
}
