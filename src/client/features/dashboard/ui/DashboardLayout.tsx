import React from 'react';
import { KontaktSeksjon } from '../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx';
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx';
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx';

interface DashboardLayoutProps {
    title: string;
    subtitle?: string; // e.g. Domain or ID
    description?: React.ReactNode;
    headerActions?: React.ReactNode;
    filtersTop?: React.ReactNode;
    filters?: React.ReactNode;
    children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    title,
    subtitle,
    description,
    headerActions,
    filtersTop,
    filters,
    children
}) => {
    return (
        <>
            <PageHeader
                title={title}
                subtitle={subtitle}
                description={description}
                actions={headerActions}
            />

            <AppBlock className="pb-16">
                {filtersTop && (
                    <div className="mb-4">
                        {filtersTop}
                    </div>
                )}

                {filters && (
                    <div className="flex flex-wrap items-end gap-4 p-4 mb-8 bg-[var(--ax-bg-accent-soft)] rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm transition-all">
                        {filters}
                    </div>
                )}

                <div className="min-h-[400px] w-full">
                    {children}
                </div>
            </AppBlock>
            <KontaktSeksjon showMarginBottom={true} />
        </>
    );
};

export default DashboardLayout;
