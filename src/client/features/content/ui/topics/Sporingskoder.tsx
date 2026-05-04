import { BodyShort, Link } from '@navikt/ds-react'
import { TeamWebsites } from '../../../settings'
import { KontaktSeksjon } from '../../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx'
import { PageHeader } from '../../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { AppBlock } from '../../../../shared/ui/theme/AppBlock/AppBlock.tsx'

function Sporingskoder() {
  return (
    <>
      <PageHeader
        title="Sporingskoder"
        description={
          <>
            Kontakt{' '}
            <Link target="_blank" href="https://nav-it.slack.com/archives/C02UGFS2J4B">
              #ResearchOps på Slack
            </Link>{' '}
            for å få sporingskode til nettsiden eller appen din.
          </>
        }
      />

      <AppBlock className="pb-16 px-4">
        <TeamWebsites />

        <BodyShort style={{ marginTop: '40px', marginBottom: '40px' }}>
          For teknisk dokumentasjon,{' '}
          <Link target="_blank" href="https://reops-docs.ansatt.dev.nav.no/innsamling/sporingsskript.html">
            se vår sporingsskript-dokumentasjon
          </Link>
          .
        </BodyShort>
      </AppBlock>

      <KontaktSeksjon showMarginBottom={true} />
    </>
  )
}

export default Sporingskoder
