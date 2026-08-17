import { useEffect, useState } from 'react'
import { Alert, BodyShort, Box, Heading, HGrid, HStack, Loader, ProgressBar, VStack } from '@navikt/ds-react'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { fetchStats } from '../api/statsApi'
import type { UserStatsResponse } from '../model/types'

const SETTING_LABELS: Record<string, string> = {
  beta_opt_in: 'Beta-tilgang',
  grafbygger_always_show_sql: 'Grafbygger: vis alltid SQL',
}

export default function Stats() {
  const [stats, setStats] = useState<UserStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
      .then((data) => {
        setStats(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <AppBlock>
      <VStack gap="space-12">
        <PageHeader title="Statistikk" description="Aggregerte data fra innstillingstabellen." />

        {loading && <Loader size="medium" title="Laster statistikk…" />}
        {error && <Alert variant="error">{error}</Alert>}

        {stats && (
          <VStack gap="space-36">
            <HGrid columns={{ xs: 1, sm: 2 }} gap="space-4">
              <Box background="raised" borderRadius="8" padding="space-6">
                <VStack gap="space-2">
                  <BodyShort
                    size="small"
                    weight="semibold"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ax-text-subtle)' }}
                  >
                    Totalt antall brukere
                  </BodyShort>
                  <Heading size="xlarge" level="2">
                    {stats.totalUsers}
                  </Heading>
                  <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                    Unike brukere som har logget inn
                  </BodyShort>
                </VStack>
              </Box>

              <Box background="raised" borderRadius="8" padding="space-6">
                <VStack gap="space-2">
                  <BodyShort
                    size="small"
                    weight="semibold"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ax-text-subtle)' }}
                  >
                    Aktive siste {stats.activeUserWindowDays} dager
                  </BodyShort>
                  <Heading size="xlarge" level="2">
                    {stats.activeUsers}
                  </Heading>
                  <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                    Filtrerer bort inaktive brukere
                  </BodyShort>
                </VStack>
              </Box>
            </HGrid>

            <Alert variant="info" inline>
              Tallene under er basert på {stats.activeUsers} aktive brukere (siste {stats.activeUserWindowDays} dager).
              Brukere som ikke har besøkt Innblikk i løpet av denne perioden er utelatt.
            </Alert>

            <VStack gap="space-12">
              {Object.entries(stats.settings).map(([key, values]) => {
                const count = values['true'] ?? 0
                const pct = stats.activeUsers > 0 ? Math.round((count / stats.activeUsers) * 100) : 0
                return (
                  <Box key={key} background="raised" borderRadius="8" padding="space-6">
                    <VStack gap="space-4">
                      <HStack justify="space-between" align="center">
                        <Heading size="small" level="3">
                          {SETTING_LABELS[key] ?? key}
                        </Heading>
                        <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                          {count} av {stats.activeUsers} ({pct}%)
                        </BodyShort>
                      </HStack>
                      <ProgressBar
                        value={count}
                        valueMax={stats.activeUsers}
                        size="medium"
                        aria-label={`${SETTING_LABELS[key] ?? key}: ${count} av ${stats.activeUsers} har aktivert`}
                      />
                    </VStack>
                  </Box>
                )
              })}
            </VStack>
          </VStack>
        )}
      </VStack>
    </AppBlock>
  )
}
