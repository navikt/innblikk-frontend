import { BodyShort, Box, Heading, Link, VStack } from '@navikt/ds-react'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { hiddenFeatures, legacyLinks } from '../model/hiddenFeatures'

export default function ReopsInternal() {
  return (
    <AppBlock>
      <VStack gap="space-12">
        <PageHeader
          title="ReOps-internt"
          description="Uannonserte ruter/funksjoner i Innblikk. Kun synlig for ReOps-teamet (nav-ident allowlist i koden)."
        />

        <VStack gap="space-4">
          {hiddenFeatures.map((feature) => (
            <Box key={feature.id} background="raised" borderRadius="8" padding="space-6">
              <VStack gap="space-1">
                <Link href={feature.href}>
                  <Heading level="2" size="small">
                    {feature.label}
                  </Heading>
                </Link>
                <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                  {feature.description}
                </BodyShort>
                <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                  <code>{feature.href}</code>
                </BodyShort>
              </VStack>
            </Box>
          ))}
        </VStack>

        <VStack gap="space-4">
          <Heading level="2" size="medium">
            Utgåtte lenker (behold, ikke slett)
          </Heading>
          <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
            Gamle URL-er som fortsatt fungerer som redirect for eksisterende bokmerker/delte lenker. Ingen egen UI —
            bare `Navigate` til gjeldende rute.
          </BodyShort>
          {legacyLinks.map((link) => (
            <Box key={link.id} background="raised" borderRadius="8" padding="space-6">
              <VStack gap="space-1">
                <BodyShort size="small" weight="semibold">
                  <Link href={link.href}>
                    <code>{link.href}</code>
                  </Link>{' '}
                  → <code>{link.redirectsTo}</code>
                </BodyShort>
                <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                  {link.description}
                </BodyShort>
              </VStack>
            </Box>
          ))}
        </VStack>
      </VStack>
    </AppBlock>
  )
}
