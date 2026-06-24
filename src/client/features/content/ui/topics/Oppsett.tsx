import { BodyShort, Heading, Link, Tag } from '@navikt/ds-react'
import { TeamWebsites } from '../../../settings'
import { KontaktSeksjon } from '../../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx'
import { PageHeader } from '../../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { developerTools } from '../../../analysis/ui/DeveloperToolsNavigation.tsx'
import { AppBlock } from '../../../../shared/ui/theme/AppBlock/AppBlock.tsx'

// Helper to get environment info and switch URL
const getEnvironmentInfo = () => {
  const hostname = window.location.hostname
  const isDev = hostname.includes('.dev.nav.no')
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

  if (isLocalhost) {
    return {
      current: 'Lokal',
      otherEnv: 'Prod',
      otherUrl: 'https://startumami.ansatt.nav.no' + window.location.pathname,
      devUrl: 'https://startumami.ansatt.dev.nav.no' + window.location.pathname,
    }
  }

  if (isDev) {
    // Currently on dev, link to prod
    const prodHostname = hostname.replace('.dev.nav.no', '.nav.no')
    return {
      current: 'Dev',
      otherEnv: 'Prod',
      otherUrl: `https://${prodHostname}${window.location.pathname}`,
    }
  } else {
    // Currently on prod, link to dev
    const devHostname = hostname.replace('.nav.no', '.dev.nav.no')
    return {
      current: 'Prod',
      otherEnv: 'Dev',
      otherUrl: `https://${devHostname}${window.location.pathname}`,
    }
  }
}

function Oppsett() {
  return (
    <>
      <PageHeader
        title="Teknisk oppsett"
        description={
          <>
            Her finner du utviklerverktøy, veiledning og <Link href="#sporingskoder">sporingskoder</Link> for Innblikk.
          </>
        }
      />

      <AppBlock className="pb-16 px-4">
        <div style={{ marginBottom: '12px', paddingTop: '24px' }}>
          <Heading spacing as="h2" size="medium">
            Nyhet: Hardt skille mellom dev og prod
          </Heading>
          <BodyShort>NB: Det arbeides med å flytte over dev-apper til det nye dev-miljøet.</BodyShort>
        </div>

        {/* Environment Switcher Section - at top */}
        <div
          style={{
            backgroundColor: 'var(--ax-bg-neutral-soft)',
            padding: '12px 20px',
            borderRadius: '8px',
            marginTop: '10px',
            marginBottom: '64px',
            border: '1px solid var(--ax-border-neutral-subtle)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Heading as="h3" size="xsmall" style={{ margin: 0 }}>
              Miljø
            </Heading>
            <Tag
              variant={
                getEnvironmentInfo().current === 'Dev'
                  ? 'warning'
                  : getEnvironmentInfo().current === 'Lokal'
                    ? 'info'
                    : 'success'
              }
              size="xsmall"
            >
              {getEnvironmentInfo().current}
            </Tag>
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '14px' }}>
            {getEnvironmentInfo().current === 'Lokal' ? (
              <>
                <Link href={getEnvironmentInfo().devUrl}>Dev →</Link>
                <Link href={getEnvironmentInfo().otherUrl}>Prod →</Link>
              </>
            ) : (
              <Link href={getEnvironmentInfo().otherUrl}>{getEnvironmentInfo().otherEnv} →</Link>
            )}
          </div>
        </div>

        {/* Veiledninger Section */}
        <div style={{ marginBottom: '32px' }}>
          <Heading as="h2" size="medium">
            Veiledninger
          </Heading>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '48px',
          }}
        >
          {[
            { href: '/komigang', label: 'Oppsett guide', description: 'Sett opp Innblikk for din nettside' },
            {
              href: 'https://navno.sharepoint.com/sites/intranett-utvikling/SitePages/Rutine-for-bruk-av-Umami.aspx',
              label: 'Retningslinjer',
              description: 'Rutine for bruk av Innblikk',
            },
            { href: '/taksonomi', label: 'Taksonomi', description: 'Navngi hendelser og egenskaper' },
          ].map((article) => (
            <Link
              key={article.href}
              href={article.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 24px',
                backgroundColor: 'var(--ax-bg-default)',
                borderRadius: '12px',
                textDecoration: 'none',
                color: 'var(--ax-text-default)',
                border: '1px solid var(--ax-border-neutral-subtle)',
                transition: 'all 0.2s ease',
                fontWeight: 500,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--ax-border-neutral-strong)'
                e.currentTarget.style.backgroundColor = 'var(--ax-bg-neutral-soft)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--ax-border-neutral-subtle)'
                e.currentTarget.style.backgroundColor = 'var(--ax-bg-default)'
              }}
            >
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{article.label}</div>
                <div style={{ fontSize: '14px', color: 'var(--ax-text-subtle)', fontWeight: 400 }}>
                  {article.description}
                </div>
              </div>
              <span style={{ color: 'var(--ax-bg-accent-strong)', fontSize: '18px', marginLeft: '16px' }}>→</span>
            </Link>
          ))}
        </div>

        {/* Utviklerverktøy Section */}
        <div style={{ marginBottom: '32px' }}>
          <Heading as="h2" size="medium">
            Utviklerverktøy
          </Heading>
        </div>

        {/* 3-Column Developer Tools Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
            marginBottom: '25px',
          }}
        >
          {[
            {
              title: 'Grafbygging',
              ids: ['grafbygger', 'sql'],
            },
            {
              title: 'Datasjekk',
              ids: ['personvern', 'diagnose'],
            },
            {
              title: 'Aktiviteter',
              ids: ['event-explorer', 'brukerprofiler'],
            },
          ].map((section) => (
            <div
              key={section.title}
              style={{
                backgroundColor: 'var(--ax-bg-default)',
                padding: '32px',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                border: `1px solid var(--ax-border-neutral-subtle)`,
              }}
            >
              <div
                style={{
                  borderLeft: `4px solid var(--ax-bg-accent-strong)`,
                  paddingLeft: '16px',
                  marginBottom: '24px',
                }}
              >
                <Heading as="h3" size="small" style={{ color: 'var(--ax-text-default)', marginBottom: '4px' }}>
                  {section.title}
                </Heading>
              </div>

              <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {developerTools
                  .filter((tool: { id: string }) => section.ids.includes(tool.id))
                  .map((tool: { id: string; href: string; label: string; description: string }) => (
                    <Link
                      key={tool.id}
                      href={tool.href}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        backgroundColor: 'var(--ax-bg-default)',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        color: 'var(--ax-text-default)',
                        border: '1px solid var(--ax-border-neutral-subtle)',
                        transition: 'all 0.2s ease',
                        fontWeight: 500,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--ax-border-neutral-strong)'
                        e.currentTarget.style.backgroundColor = 'var(--ax-bg-neutral-soft)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--ax-border-neutral-subtle)'
                        e.currentTarget.style.backgroundColor = 'var(--ax-bg-default)'
                      }}
                    >
                      <span>{tool.label}</span>
                      <span style={{ color: 'var(--ax-bg-accent-strong)', fontSize: '18px' }}>→</span>
                    </Link>
                  ))}
              </nav>
            </div>
          ))}
        </div>

        <Heading spacing as="h2" size="medium" className="mt-12 pt-2 mb-3" id="sporingskoder">
          Sporingskoder
        </Heading>
        <BodyShort className="mb-8">
          Kontakt{' '}
          <Link target="_blank" href="https://nav-it.slack.com/archives/C02UGFS2J4B">
            #ResearchOps på Slack
          </Link>{' '}
          for å få sporingskode til nettsiden eller appen din.
        </BodyShort>

        <TeamWebsites />

        <BodyShort style={{ marginTop: '40px', marginBottom: '40px' }}>
          For teknisk dokumentasjon,{' '}
          <Link target="_blank" href="https://reops-docs.ansatt.dev.nav.no/innsamling/sporingsskript.html">
            se vår sporingsskript-dokumentasjon
          </Link>
          .
        </BodyShort>
      </AppBlock>
      <KontaktSeksjon />
    </>
  )
}

export default Oppsett
