import { useMemo, useState } from 'react'
import { BodyShort, Button, Heading, Link, Loader, LocalAlert, Switch, VStack } from '@navikt/ds-react'
import { PlusIcon } from '@navikt/aksel-icons'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { BetaFeatureNotice, BetaFeedbackLine } from '../../../shared/ui/BetaFeatureNotice.tsx'
import {
  createManagedWebsite,
  hardDeleteManagedWebsite,
  softDeleteManagedWebsite,
  updateManagedWebsite,
  type WebsiteInput,
  type WebsiteRegistration,
} from '../../../shared/api/websiteManagementApi.ts'
import { mergeTeams, useTeamCatalog } from '../../../shared/hooks/useTeamCatalog.ts'
import { useManagedWebsites, useWebsiteManagementContext } from '../model/useWebsiteManagement.ts'
import { WebsiteFormDialog } from './WebsiteFormDialog.tsx'
import { SoftDeleteDialog } from './SoftDeleteDialog.tsx'
import { HardDeleteDialog } from './HardDeleteDialog.tsx'
import { WebsiteRegistrationsTable } from './WebsiteRegistrationsTable.tsx'

/**
 * ReOps admin surface: ALL registrations, including unassigned (ownerTeamId = null) and
 * soft-deleted ones. Admins can assign/reassign ownership by picking a Team Catalog team — existing
 * rows are never auto-mapped, ownership is set explicitly and manually here.
 */
export default function AdminNettsider() {
  const { context, isLoading: contextLoading, error: contextError } = useWebsiteManagementContext()
  const [includeDeleted, setIncludeDeleted] = useState(true)
  const { websites, isLoading, error, reload } = useManagedWebsites({ scope: 'all', includeDeleted })
  const { teams: catalogTeams } = useTeamCatalog()
  const allTeams = useMemo(() => mergeTeams(context?.teams ?? [], catalogTeams), [context, catalogTeams])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WebsiteRegistration | null>(null)
  const [softDeleting, setSoftDeleting] = useState<WebsiteRegistration | null>(null)
  const [hardDeleting, setHardDeleting] = useState<WebsiteRegistration | null>(null)

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

  const handleHardDelete = async (confirmation: string) => {
    if (!hardDeleting) return
    await hardDeleteManagedWebsite(hardDeleting.websiteId, confirmation)
    reload()
  }

  return (
    <>
      <PageHeader
        title="Alle nettsideregistreringer"
        beta
        description="ReOps-intern oversikt over alle registreringer, inkludert deaktiverte og registreringer uten eier."
      />

      <AppBlock className="pb-16">
        <VStack gap="space-16">
          <BetaFeatureNotice id="nettsideadministrasjon" title="Nettsideadministrasjon er i beta">
            Eksisterende registreringer har foreløpig ingen eier (eierskap er ikke utledet fra tidligere team-ID-er).
            Tildel eierskap manuelt per registrering ved å søke opp teamet.
            <BetaFeedbackLine />
          </BetaFeatureNotice>

          {(contextLoading || isLoading) && <Loader size="large" title="Laster registreringer…" />}

          {!contextLoading && !isLoading && (contextError || error) && (
            <LocalAlert status="error" role="alert">
              <LocalAlert.Content>{(contextError ?? error)?.message}</LocalAlert.Content>
            </LocalAlert>
          )}

          {!contextLoading && !isLoading && !contextError && !error && context && (
            <>
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

              <Switch checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)}>
                Vis deaktiverte registreringer
              </Switch>

              <Heading level="2" size="small">
                {websites.length} registreringer
              </Heading>

              <WebsiteRegistrationsTable
                websites={websites}
                teams={allTeams}
                onEdit={(website) => {
                  setEditing(website)
                  setFormOpen(true)
                }}
                onSoftDelete={setSoftDeleting}
                onHardDelete={setHardDeleting}
              />

              <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                «Slett» fjerner kun registreringen i Postgres — ingenting i Kafka, BigQuery eller analysedata berøres.
                Vanlige brukere administrerer egne nettsider på{' '}
                <Link href="/mine-nettsider">Mine team sine nettsider</Link>.
              </BodyShort>
            </>
          )}
        </VStack>
      </AppBlock>

      {context && (
        <>
          <WebsiteFormDialog
            open={formOpen}
            website={editing}
            teams={allTeams}
            adminMode
            onSubmit={handleSubmit}
            onClose={() => setFormOpen(false)}
          />
          <SoftDeleteDialog website={softDeleting} onConfirm={handleSoftDelete} onClose={() => setSoftDeleting(null)} />
          <HardDeleteDialog website={hardDeleting} onConfirm={handleHardDelete} onClose={() => setHardDeleting(null)} />
        </>
      )}
    </>
  )
}
