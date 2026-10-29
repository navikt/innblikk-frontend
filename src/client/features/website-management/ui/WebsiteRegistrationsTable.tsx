import { useMemo, useState } from 'react'
import { BodyShort, Button, HStack, Tag, VStack } from '@navikt/ds-react'
import { DataGrid } from '@navikt/ds-react/PREVIEW'
import { PencilIcon, TrashIcon, XMarkOctagonIcon } from '@navikt/aksel-icons'
import type { WebsiteManagementTeam, WebsiteRegistration } from '../../../shared/api/websiteManagementApi.ts'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type SortOrder = NonNullable<DataGrid.Table.Sorting['sortOrder']>

interface WebsiteRegistrationsTableProps {
  websites: WebsiteRegistration[]
  /** Team Catalog lookup for owner names. Unknown/unassigned owners are labeled clearly. */
  teams: WebsiteManagementTeam[]
  /** Hide the Eier column when the owner is shown elsewhere (e.g. all rows share one team). */
  showOwnerColumn?: boolean
  onEdit?: (website: WebsiteRegistration) => void
  onSoftDelete?: (website: WebsiteRegistration) => void
  /** ReOps-only hard delete. When provided, a destructive action is shown per row. */
  onHardDelete?: (website: WebsiteRegistration) => void
}

export function WebsiteRegistrationsTable({
  websites,
  teams,
  showOwnerColumn = true,
  onEdit,
  onSoftDelete,
  onHardDelete,
}: WebsiteRegistrationsTableProps) {
  const [sortOrder, setSortOrder] = useState<SortOrder>([])

  const teamName = (ownerTeamId: string | null) => {
    if (!ownerTeamId) return 'Ingen eier'
    return teams.find((team) => team.id === ownerTeamId)?.name ?? 'Ukjent team'
  }

  const sortedWebsites = useMemo(() => {
    if (sortOrder.length === 0) return websites
    const nameOf = (id: string | null) => (id ? (teams.find((team) => team.id === id)?.name ?? 'Ukjent team') : '')
    const valueOf = (website: WebsiteRegistration, columnId: string): string => {
      switch (columnId) {
        case 'name':
          return website.name
        case 'domain':
          return website.domain
        case 'owner':
          return nameOf(website.ownerTeamId)
        case 'createdAt':
          return website.createdAt ?? ''
        case 'updatedAt':
          return website.updatedAt ?? ''
        case 'status':
          return website.deletedAt ? '1' : '0'
        default:
          return ''
      }
    }
    return [...websites].sort((a, b) => {
      for (const { columnId, direction } of sortOrder) {
        const comparison = valueOf(a, columnId).localeCompare(valueOf(b, columnId), 'nb')
        if (comparison !== 0) return direction === 'asc' ? comparison : -comparison
      }
      return 0
    })
  }, [websites, teams, sortOrder])

  const ownerColumn: DataGrid.Columns<WebsiteRegistration>[number] = {
    id: 'owner',
    header: 'Eier',
    bodyCell: (website) =>
      website.ownerTeamId ? (
        teamName(website.ownerTeamId)
      ) : (
        <span style={{ color: 'var(--ax-text-neutral-subtle)' }}>Ingen eier</span>
      ),
    isSortable: true,
  }

  const columns: DataGrid.Columns<WebsiteRegistration> = [
    {
      id: 'name',
      header: 'Navn',
      bodyCell: (website) => website.name,
      isRowHeader: true,
      isSortable: true,
      width: { defaultValue: 200 },
    },
    { id: 'domain', header: 'Domene', bodyCell: (website) => website.domain, isSortable: true },
    ...(showOwnerColumn ? [ownerColumn] : []),
    {
      id: 'updatedAt',
      header: 'Sist endret',
      bodyCell: (website) => formatDate(website.updatedAt),
      isSortable: true,
      width: { defaultValue: 120 },
    },
    {
      id: 'status',
      header: 'Status',
      bodyCell: (website) =>
        website.deletedAt != null ? (
          <Tag data-color="neutral" variant="outline" size="small">
            Deaktivert {formatDate(website.deletedAt)}
          </Tag>
        ) : (
          <Tag data-color="success" variant="outline" size="small">
            Aktiv
          </Tag>
        ),
      isSortable: true,
      width: { defaultValue: 170 },
    },
    {
      id: 'actions',
      header: 'Handlinger',
      bodyCell: (website) => {
        const isDeleted = website.deletedAt != null
        return (
          <HStack gap="space-4" wrap={false}>
            {!isDeleted && onEdit && (
              <Button
                variant="tertiary"
                size="xsmall"
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
                size="xsmall"
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
                size="xsmall"
                data-color="danger"
                icon={<TrashIcon aria-hidden />}
                onClick={() => onHardDelete(website)}
                aria-label={`Slett registreringen for ${website.name} permanent`}
              >
                Slett
              </Button>
            )}
          </HStack>
        )
      },
      width: { defaultValue: 290 },
    },
  ]

  if (websites.length === 0) {
    return <BodyShort>Ingen nettsider å vise.</BodyShort>
  }

  return (
    <DataGrid
      columns={columns}
      data={sortedWebsites}
      getRowId={(website) => website.websiteId}
      settings={{ stickyColumns: { end: 1 } }}
    >
      <DataGrid.Table<WebsiteRegistration>
        sorting={{ sortOrder, onSortOrderChange: setSortOrder, allowMultiSort: false }}
        detailsPanel={{
          getContent: (website) => (
            <VStack gap="space-8" padding="space-16">
              <div>
                <BodyShort size="small" weight="semibold">
                  Opprettet
                </BodyShort>
                <BodyShort size="small">{formatDate(website.createdAt)}</BodyShort>
              </div>
              <div>
                <BodyShort size="small" weight="semibold">
                  Nettside-ID
                </BodyShort>
                <BodyShort size="small">
                  <code>{website.websiteId}</code>
                </BodyShort>
              </div>
              <div>
                <BodyShort size="small" weight="semibold">
                  Team-ID ({teamName(website.ownerTeamId)})
                </BodyShort>
                <BodyShort size="small">
                  {website.ownerTeamId ? (
                    <code>{website.ownerTeamId}</code>
                  ) : (
                    'Ingen eier ennå. Kan tildeles av Team ResearchOps.'
                  )}
                </BodyShort>
              </div>
            </VStack>
          ),
        }}
      />
    </DataGrid>
  )
}
