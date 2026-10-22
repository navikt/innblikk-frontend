import { BodyShort, Button, HStack, Table, Tag } from '@navikt/ds-react'
import { PencilIcon, TrashIcon, XMarkOctagonIcon } from '@navikt/aksel-icons'
import type { WebsiteManagementTeam, WebsiteRegistration } from '../../../shared/api/websiteManagementApi.ts'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface WebsiteRegistrationsTableProps {
  websites: WebsiteRegistration[]
  /** Team lookup for owner names. Unknown/unassigned owners are labeled clearly. */
  teams: WebsiteManagementTeam[]
  onEdit?: (website: WebsiteRegistration) => void
  onSoftDelete?: (website: WebsiteRegistration) => void
  /** ReOps-only hard delete. When provided, a destructive action is shown per row. */
  onHardDelete?: (website: WebsiteRegistration) => void
}

export function WebsiteRegistrationsTable({
  websites,
  teams,
  onEdit,
  onSoftDelete,
  onHardDelete,
}: WebsiteRegistrationsTableProps) {
  const teamName = (ownerTeamId: string | null) => {
    if (!ownerTeamId) return 'Ingen eier'
    return teams.find((team) => team.id === ownerTeamId)?.name ?? 'Ukjent team'
  }

  if (websites.length === 0) {
    return <BodyShort>Ingen nettsider å vise.</BodyShort>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <Table>
        <caption className="aksel-sr-only">Nettsideregistreringer, eierskap og tilgjengelige handlinger</caption>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell scope="col">Navn</Table.HeaderCell>
            <Table.HeaderCell scope="col">Domene</Table.HeaderCell>
            <Table.HeaderCell scope="col">Eier</Table.HeaderCell>
            <Table.HeaderCell scope="col">Opprettet</Table.HeaderCell>
            <Table.HeaderCell scope="col">Sist endret</Table.HeaderCell>
            <Table.HeaderCell scope="col">Status</Table.HeaderCell>
            <Table.HeaderCell scope="col">Handlinger</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {websites.map((website) => {
            const isDeleted = website.deletedAt != null
            return (
              <Table.Row key={website.websiteId}>
                <Table.HeaderCell scope="row">
                  {website.name}
                  <BodyShort size="small">
                    <code>{website.websiteId}</code>
                  </BodyShort>
                </Table.HeaderCell>
                <Table.DataCell>{website.domain}</Table.DataCell>
                <Table.DataCell>
                  {teamName(website.ownerTeamId)}
                  {website.ownerTeamId ? (
                    <BodyShort size="small">
                      <code>{website.ownerTeamId}</code>
                    </BodyShort>
                  ) : (
                    <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
                      Kan tildeles av Team ResearchOps
                    </BodyShort>
                  )}
                </Table.DataCell>
                <Table.DataCell>{formatDate(website.createdAt)}</Table.DataCell>
                <Table.DataCell>{formatDate(website.updatedAt)}</Table.DataCell>
                <Table.DataCell>
                  {isDeleted ? (
                    <Tag variant="neutral" size="small">
                      Deaktivert {formatDate(website.deletedAt)}
                    </Tag>
                  ) : (
                    <Tag variant="success" size="small">
                      Aktiv
                    </Tag>
                  )}
                </Table.DataCell>
                <Table.DataCell>
                  <HStack gap="space-4">
                    {!isDeleted && onEdit && (
                      <Button
                        variant="tertiary"
                        size="small"
                        icon={<PencilIcon aria-hidden />}
                        onClick={() => onEdit(website)}
                        aria-label={`Rediger ${website.name}`}
                      >
                        Rediger
                      </Button>
                    )}
                    {!isDeleted && onSoftDelete && (
                      <Button
                        variant="tertiary"
                        size="small"
                        icon={<XMarkOctagonIcon aria-hidden />}
                        onClick={() => onSoftDelete(website)}
                        aria-label={`Deaktiver innsamling for ${website.name}`}
                      >
                        Deaktiver
                      </Button>
                    )}
                    {onHardDelete && (
                      <Button
                        variant="tertiary"
                        size="small"
                        data-color="danger"
                        icon={<TrashIcon aria-hidden />}
                        onClick={() => onHardDelete(website)}
                        aria-label={`Slett registreringen for ${website.name} permanent`}
                      >
                        Slett
                      </Button>
                    )}
                  </HStack>
                </Table.DataCell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table>
    </div>
  )
}
