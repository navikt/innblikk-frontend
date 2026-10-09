import { BodyShort, Box, Heading, VStack } from '@navikt/ds-react'
import type { Draft } from '../model/draft.ts'
import { describeDraft, type CohortNames } from '../utils/describe.ts'

interface SummaryPanelProps {
  draft: Draft
  names: CohortNames
}

export function SummaryPanel({ draft, names }: SummaryPanelProps) {
  const { intro, lines } = describeDraft(draft, names)

  return (
    <Box padding="space-16" background="neutral-soft" borderRadius="8" as="aside" aria-label="Slik leser vi gruppen">
      <VStack gap="space-12">
        <Heading level="2" size="small">
          Slik leser vi gruppen
        </Heading>
        <BodyShort>{intro}</BodyShort>
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          {lines.map((line, index) => (
            <li key={index} style={{ marginBottom: '0.5rem' }}>
              <BodyShort as="span">
                {line.connector && (
                  <BodyShort as="span" weight="semibold">
                    {line.connector}{' '}
                  </BodyShort>
                )}
                {line.text}
              </BodyShort>
            </li>
          ))}
        </ul>
      </VStack>
    </Box>
  )
}
