import React from 'react'
import { Accordion } from '@navikt/ds-react'
import { KontaktSeksjon } from '../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'

interface ProjectManagerLayoutProps {
  title: string
  description: string
  toolbar?: React.ReactNode
  sidebarHeader?: React.ReactNode
  sidebar: React.ReactNode
  children: React.ReactNode
}

const ProjectManagerLayout: React.FC<ProjectManagerLayoutProps> = ({
  title,
  description,
  toolbar,
  sidebarHeader,
  sidebar,
  children,
}) => {
  return (
    <>
      <PageHeader title={title} description={description} />

      <AppBlock className="pb-16">
        <div className="rounded-lg shadow-sm border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] overflow-hidden">
          {(toolbar || sidebarHeader) && (
            <div className="border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-subtle)] flex flex-col md:flex-row md:min-h-[76px]">
              {sidebarHeader && (
                <div className="w-full md:w-[280px] p-4 border-b md:border-b-0 md:border-r border-[var(--ax-border-neutral-subtle)] flex items-center">
                  {sidebarHeader}
                </div>
              )}
              <div
                className={`w-full p-4 flex flex-wrap items-center justify-between gap-3 ${sidebarHeader ? 'md:flex-1' : ''}`}
              >
                {toolbar}
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row min-h-[700px]">
            <aside className="md:w-[280px] bg-[var(--ax-bg-neutral-soft)] border-b md:border-b-0 md:border-r border-[var(--ax-border-neutral-subtle)] flex-shrink-0">
              <div className="md:hidden">
                <Accordion size="small" headingSize="xsmall">
                  <Accordion.Item>
                    <Accordion.Header>Team</Accordion.Header>
                    <Accordion.Content className="p-0 border-t border-[var(--ax-border-neutral-subtle)]">
                      <div className="p-3">{sidebar}</div>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion>
              </div>
              <div className="hidden md:block p-4 md:p-6">{sidebar}</div>
            </aside>

            <main className="flex-1 min-w-0 bg-[var(--ax-bg-default)]">
              <div className="p-4 md:p-6">{children}</div>
            </main>
          </div>
        </div>
      </AppBlock>
      <KontaktSeksjon />
    </>
  )
}

export default ProjectManagerLayout
