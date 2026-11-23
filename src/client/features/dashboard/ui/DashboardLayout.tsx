import React from 'react'
import type { ProjectDto } from '../../../shared/types/backend.ts'
import { PageBreadcrumbs } from '../../../shared/ui/PageBreadcrumbs.tsx'
import { KontaktSeksjon } from '../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx'
import { Skyra } from '../../../shared/ui/theme/Skyra/Skyra.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'

interface DashboardLayoutProps {
  title: string
  subtitle?: string // e.g. Domain or ID
  description?: React.ReactNode
  headerActions?: React.ReactNode
  team?: Pick<ProjectDto, 'id' | 'name'>
  filtersTop?: React.ReactNode
  filters?: React.ReactNode
  showKontaktSection?: boolean
  children: React.ReactNode
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  title,
  subtitle,
  description,
  headerActions,
  team,
  filtersTop,
  filters,
  showKontaktSection = true,
  children,
}) => {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        description={description}
        actions={headerActions}
        breadcrumbs={
          team ? (
            <PageBreadcrumbs
              items={[
                { label: 'Dashboard', to: '/dashboard' },
                { label: team.name, to: `/dashboard?projectId=${team.id}` },
                { label: title },
              ]}
            />
          ) : undefined
        }
      />

      <AppBlock className="pb-16">
        {filtersTop && <div className="mb-4">{filtersTop}</div>}

        {filters && (
          <div className="flex flex-wrap items-end gap-4 p-4 mb-8 bg-[var(--ax-bg-accent-soft)] rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm transition-all has-[.sidegroup-management-slot]:pb-10">
            {filters}
          </div>
        )}

        <div className="min-h-[400px] w-full">{children}</div>
      </AppBlock>
      {showKontaktSection && (
        <>
          <Skyra />
          <KontaktSeksjon />
        </>
      )}
    </>
  )
}

export default DashboardLayout
