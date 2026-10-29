import { useMemo, useState } from 'react'
import { BodyLong, BodyShort, Button, Heading, Link, Loader, LocalAlert, VStack } from '@navikt/ds-react'
import { PlusIcon } from '@navikt/aksel-icons'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { BetaFeatureNotice, BetaFeedbackLine } from '../../../shared/ui/BetaFeatureNotice.tsx'
import {
  createManagedWebsite,
  softDeleteManagedWebsite,
  updateManagedWebsite,
  WebsiteManagementUnavailableError,
  type WebsiteInput,
  type WebsiteRegistration,
} from '../../../shared/api/websiteManagementApi.ts'
import { mergeTeams, useTeamCatalog } from '../../../shared/hooks/useTeamCatalog.ts'
import { useManagedWebsites, useWebsiteManagementContext } from '../model/useWebsiteManagement.ts'
import { WebsiteFormDialog } from './WebsiteFormDialog.tsx'
import { SoftDeleteDialog } from './SoftDeleteDialog.tsx'
import { WebsiteRegistrationsTable } from './WebsiteRegistrationsTable.tsx'

/**
 * Self-service website management for the caller's own teams (beta).
 * /sporingskoder stays the browsing surface for ALL registrations + tracking snippets;
 * this page is only for managing registrations owned by teams the user belongs to.
 */
export default function MineNettsider() {
  const { context, isLoading: contextLoading, error: contextError } = useWebsiteManagementContext()
  const { websites, isLoading, error, reload } = useManagedWebsites({ scope: 'mine' })
  const { teams: catalogTeams } = useTeamCatalog()
  const allTeams = useMemo(() => mergeTeams(context?.teams ?? [], catalogTeams), [context, catalogTeams])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WebsiteRegistration | null>(null)
  const [softDeleting, setSoftDeleting] = useState<WebsiteRegistration | null>(null)

  const ownerIds = [...new Set(websites.map((website) => website.ownerTeamId))]
  const singleOwner = ownerIds.length === 1
  const singleOwnerName = singleOwner
    ? ownerIds[0]
      ? (allTeams.find((team) => team.id === ownerIds[0])?.name ?? 'Ukjent team')
      : 'Ingen eier'
    : null

  const isLoadingAnything = contextLoading || isLoading

  const handleSubmit = async (input: WebsiteInput) => {
    if (editing) {
      await updateManagedWebsite(editing.websiteId, input)
    } else {
      await createManagedWebsite(input)
    }
    reload()
  }

  const handleSoftDelete = async () => {
    if (!softDeleting) return
    await softDeleteManagedWebsite(softDeleting.websiteId)
    reload()
  }

  const unavailable = contextError instanceof WebsiteManagementUnavailableError

  return (
    <>
      <PageHeader
        title="Mine team sine nettsider"
        beta
        description="Registrer og administrer sporingskoder for teamene dine."
      />

      <AppBlock className="pb-16">
        <VStack gap="space-16">
          <BetaFeatureNotice id="nettsideadministrasjon" title="Nettsideadministrasjon er i beta">
            Du kan nå registrere nye nettsider, endre navn og domene, og deaktivere innsamling for nettsider som eies av
            teamene dine. Deaktivering stopper innsamlingen, men sletter ikke historiske data.
            <BetaFeedbackLine />
          </BetaFeatureNotice>

          <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
            Endringene gjelder miljøet du er logget inn på. Den fullstendige oversikten over alle nettsider og
            sporingskoder ligger fortsatt på <Link href="/sporingskoder">Sporingskoder</Link>.
          </BodyShort>

          {isLoadingAnything && <Loader size="large" title="Laster nettsider…" />}

          {!isLoadingAnything && (unavailable || contextError) && (
            <LocalAlert status="announcement">
              <LocalAlert.Content>
                {unavailable
                  ? 'Nettsideadministrasjon er ikke tilgjengelig i dette miljøet ennå. Du kan fortsatt se alle nettsider og sporingskoder på siden Sporingskoder.'
                  : `Kunne ikke laste inn nettsideadministrasjon: ${contextError?.message}`}
              </LocalAlert.Content>
            </LocalAlert>
          )}

          {!isLoadingAnything && !contextError && context && (
            <>
              {error && (
                <LocalAlert status="error" role="alert">
                  <LocalAlert.Content>{error.message}</LocalAlert.Content>
                </LocalAlert>
              )}

              {context.teams.length === 0 ? (
                <BodyLong>
                  Du er ikke registrert som medlem av noe team i Teamkatalogen, så det finnes ingen nettsider du kan
                  administrere her. Ta kontakt med teamet ditt, eller med{' '}
                  <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B">#researchops</Link> på Slack.
                </BodyLong>
              ) : (
                <>
                  <VStack gap="space-8">
                    <Heading level="2" size="small">
                      Nettsider eid av teamene dine
                    </Heading>
                    <div>
                      <Button
                        variant="primary"
                        size="small"
                        icon={<PlusIcon aria-hidden />}
                        onClick={() => {
                          setEditing(null)
                          setFormOpen(true)
                        }}
                      >
                        Registrer ny nettside
                      </Button>
                    </div>
                    {singleOwnerName && (
                      <BodyShort size="small">
                        Eier: <strong>{singleOwnerName}</strong>
                      </BodyShort>
                    )}
                    <WebsiteRegistrationsTable
                      websites={websites}
                      showOwnerColumn={!singleOwner}
                      teams={allTeams}
                      onEdit={(website) => {
                        setEditing(website)
                        setFormOpen(true)
                      }}
                      onSoftDelete={setSoftDeleting}
                    />
                  </VStack>
                </>
              )}
            </>
          )}
        </VStack>
      </AppBlock>

      {context && (
        <>
          <WebsiteFormDialog
            open={formOpen}
            website={editing}
            teams={context.teams}
            onSubmit={handleSubmit}
            onClose={() => setFormOpen(false)}
          />
          <SoftDeleteDialog website={softDeleting} onConfirm={handleSoftDelete} onClose={() => setSoftDeleting(null)} />
        </>
      )}
    </>
  )
}
