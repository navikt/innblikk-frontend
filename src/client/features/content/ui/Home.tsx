import { Heading, HStack } from '@navikt/ds-react'
import { UrlSearchForm } from '../../dashboard'
import { KontaktSeksjon } from '../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { BetaBadge } from '../../../shared/ui/theme/Header/BetaBadge.tsx'
import { getFeatureFlag } from '../../../shared/lib/featureFlags.ts'

function Home() {
  const isBetaUser = getFeatureFlag('beta_opt_in')
  return (
    <div
      style={{
        width: '100%',
        minHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--ax-bg-default)',
        backgroundImage: 'linear-gradient(180deg, var(--ax-bg-accent-soft) 0%, var(--ax-bg-default) 68%)',
      }}
    >
      <section
        style={{
          width: '100%',
          color: 'var(--ax-text-default)',
          flex: '1 0 auto',
          minHeight: 'clamp(440px, 62vh, 760px)',
          display: 'grid',
          placeItems: 'center',
          paddingTop: '24px',
          paddingBottom: '24px',
        }}
      >
        <AppBlock style={{ width: '100%' }}>
          <div style={{ width: '100%', maxWidth: '680px', margin: '0 auto' }}>
            <HStack justify={'center'} style={{ marginBottom: 'var(--ax-space-64)' }}>
              {!isBetaUser && <BetaBadge />}
            </HStack>
            <Heading spacing={true} as="h1" size="xlarge">
              Forstå brukeradferd med Innblikk
            </Heading>
            <UrlSearchForm />
          </div>
        </AppBlock>
      </section>

      <KontaktSeksjon showMarginBottom={true} />
    </div>
  )
}

export default Home
