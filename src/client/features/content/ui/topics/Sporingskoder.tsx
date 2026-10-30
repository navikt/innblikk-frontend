import { BodyShort, Link } from '@navikt/ds-react'
import { TeamWebsites } from '../../../settings'
import { KontaktSeksjon } from '../../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx'
import { Skyra } from '../../../../shared/ui/theme/Skyra/Skyra.tsx'
import { PageHeader } from '../../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { AppBlock } from '../../../../shared/ui/theme/AppBlock/AppBlock.tsx'

function Sporingskoder() {
  return (
    <>
      <PageHeader
        title="Sporingskoder"
        description={
          <>
            Oversikt over alle registrerte nettsider og sporingskodene deres. Vil du registrere eller endre en nettside
            for teamet ditt, ta kontakt med{' '}
            <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B">#researchops</Link> på Slack.
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

      <Skyra />
      <KontaktSeksjon />
    </>
  )
}

export default Sporingskoder
