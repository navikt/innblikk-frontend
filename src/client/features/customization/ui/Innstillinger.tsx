import { useEffect, useState } from 'react'
import { BodyShort, Checkbox, CheckboxGroup, Heading } from '@navikt/ds-react'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { getFeatureFlags, setFeatureFlag, type FeatureFlags } from '../../../shared/lib/featureFlags.ts'

function Innstillinger() {
  const [flags, setFlags] = useState<FeatureFlags>(getFeatureFlags)

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
      <PageHeader title="Innstillinger" description="Tilpass funksjonalitet og aktiver eksperimentelle funksjoner." />

      <AppBlock className="pb-16 px-4">
        <div className="max-w-[800px] mx-auto pt-12 flex flex-col gap-12">
          {/* ── Grafbygger ─────────────────────────────────────────── */}
          <section>
            <Heading level="2" size="medium" spacing>
              Grafbygger
            </Heading>
            <BodyShort className="text-[var(--ax-text-subtle)] mb-6">
              Innstillinger som påvirker grafbygger-siden.
            </BodyShort>

            <CheckboxGroup legend="Funksjoner" hideLegend>
              <Checkbox
                checked={flags.grafbygger_always_show_sql}
                onChange={(e) => toggle('grafbygger_always_show_sql', e.target.checked)}
              >
                Vis alltid SQL-spørringen
                <BodyShort as="span" size="small" className="block text-[var(--ax-text-subtle)] font-normal mt-0.5">
                  Viser SQL-koden som genereres direkte i resultatpanelet, uten at du trenger å kjøre spørringen først.
                </BodyShort>
              </Checkbox>
            </CheckboxGroup>
          </section>
        </div>
      </AppBlock>
    </>
  )
}

export default Innstillinger
