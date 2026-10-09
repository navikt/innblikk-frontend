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
    <Box padding="space-12" background="neutral-soft" borderRadius="8" as="aside" aria-label="Oppsummering">
      <VStack gap="space-8">
        <Heading level="2" size="xsmall">
          Oppsummering
        </Heading>
        <BodyShort size="small">{intro}</BodyShort>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
          {lines.map((line, index) => (
            <li key={index} style={{ marginBottom: '0.25rem' }}>
              <BodyShort as="span" size="small">
                {line.connector && (
                  <BodyShort as="span" size="small" weight="semibold">
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
