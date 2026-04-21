import { useEffect, useState } from 'react'
import {
  Alert,
  Bleed,
  BodyLong,
  BodyShort,
  Box,
  Checkbox,
  Heading,
  HStack,
  Label,
  Loader,
  VStack,
} from '@navikt/ds-react'
import { PersonIcon } from '@navikt/aksel-icons'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { getFeatureFlags, setFeatureFlag, type FeatureFlags } from '../../../shared/lib/featureFlags.ts'
import type { UserInfo } from '../model'

export default function UserProfile() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [userError, setUserError] = useState<string | null>(null)
  const [flags, setFlags] = useState<FeatureFlags>(getFeatureFlags)

  useEffect(() => {
    fetch('/api/user/me')
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err: { message?: string; error?: string }) => {
            throw new Error(err.message ?? err.error ?? 'Failed to fetch user info')
          })
        }
        return res.json() as Promise<UserInfo>
      })
      .then((data) => {
        setUser(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        setUserError(err.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    const handleChange = (e: Event) => {
      setFlags((e as CustomEvent<FeatureFlags>).detail)
    }
    window.addEventListener('featureFlagsChange', handleChange)
    return () => window.removeEventListener('featureFlagsChange', handleChange)
  }, [])

  const toggle = <K extends keyof FeatureFlags>(key: K, value: boolean) => {
    setFeatureFlag(key, value as FeatureFlags[K])
  }

  return (
    <>
      <PageHeader title="Profil" description="profilvalg" />

      <AppBlock className="pb-16 px-4">
        <VStack gap="space-64" className="max-w-[800px] mx-auto pt-12">
          <section>
            {loading && <Loader size="large" title="Laster brukerinformasjon..." />}

            {userError && (
              <Alert variant="info">
                <Heading size="small" spacing>
                  Autentisering ikke tilgjengelig
                </Heading>
                <BodyShort>{userError}</BodyShort>
                <BodyShort className="mt-2">
                  Dette endepunktet fungerer kun når applikasjonen er deployet til NAIS med Entra ID aktivert.
                </BodyShort>
              </Alert>
            )}

            {!loading && !userError && user && (
              <Box marginBlock={'space-40'}>
                <Bleed asChild reflectivePadding marginBlock={'space-32'} marginInline={'space-32'}>
                  <Box borderColor="neutral-subtle" borderWidth="1" borderRadius={'12'}>
                    <VStack gap="space-4">
                      <HStack gap="space-4" align="center">
                        <PersonIcon fontSize="2rem" />
                        <div>
                          <Label>Nav-ident</Label>
                          <BodyShort weight="semibold">{user.navIdent}</BodyShort>
                        </div>
                      </HStack>

                      <div className="h-px bg-[var(--ax-border-neutral-subtle)]" />

                      <div>
                        <Label>Navn</Label>
                        <BodyShort>{user.name}</BodyShort>
                      </div>

                      <div className="h-px bg-[var(--ax-border-neutral-subtle)]" />

                      <div>
                        <Label>E-post</Label>
                        <BodyShort>{user.email}</BodyShort>
                      </div>
                    </VStack>
                  </Box>
                </Bleed>
              </Box>
            )}
          </section>

          <Bleed asChild reflectivePadding marginBlock={'space-32'} marginInline={'space-32'}>
            <Box background={'brand-beige-soft'} borderColor="brand-beige" borderWidth="1" borderRadius={'12'}>
              <section id="betaprogram">
                <VStack gap="space-16">
                  <div>
                    <Box asChild marginBlock={'space-0 space-6'}>
                      <Heading level="2" size="medium" className="text-[var(--ax-text-brand-beige)]">
                        Betaprogram ❤️
                      </Heading>
                    </Box>
                    <BodyLong textColor="subtle">
                      Få tidlig tilgang til nye funksjoner og hjelp oss å gjøre Innblikk bedre. Som betadeltaker kan du
                      prøve eksperimentelle verktøy og gi tilbakemelding direkte til teamet.
                    </BodyLong>
                  </div>

                  <Checkbox checked={flags.beta_opt_in} onChange={(e) => toggle('beta_opt_in', e.target.checked)}>
                    Meld meg på betaprogrammet
                    <BodyShort as="span" size="small" textColor="subtle" className="block font-normal mt-0.5">
                      Du kan melde deg av når som helst. Preferansen lagres lokalt i nettleseren din og synkroniseres
                      med serveren.
                    </BodyShort>
                  </Checkbox>
                </VStack>
              </section>
            </Box>
          </Bleed>

          <section>
            <VStack gap="space-24">
              <div>
                <Box asChild>
                  <Heading level="2" size="medium">
                    Tilpasning
                  </Heading>
                </Box>
                <BodyLong textColor="subtle">
                  Innstillinger som påvirker hvordan Innblikk oppfører seg for deg.
                </BodyLong>
              </div>

              <VStack gap="space-4">
                <Box asChild>
                  <Heading level="3" size="small">
                    Grafbygger
                  </Heading>
                </Box>
                <Checkbox
                  checked={flags.grafbygger_always_show_sql}
                  onChange={(e) => toggle('grafbygger_always_show_sql', e.target.checked)}
                >
                  Vis alltid SQL-spørringen
                  <BodyShort as="span" size="small" textColor="subtle" className="block font-normal mt-0.5">
                    Viser SQL-koden som genereres direkte i resultatpanelet, uten at du trenger å kjøre spørringen
                    først.
                  </BodyShort>
                </Checkbox>
              </VStack>
            </VStack>
          </section>
        </VStack>
      </AppBlock>
    </>
  )
}
