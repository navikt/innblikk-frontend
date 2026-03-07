import React, { useState } from 'react';
import { Page, Accordion } from "@navikt/ds-react";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type AnalyticsPage, analyticsPages } from '../model/analyticsNavigation.ts';
import { type ChartGroup } from '../model/chartGroups.tsx';
import { KontaktSeksjon } from '../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx';
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx';
import { useChartNavigation } from '../hooks/useChartNavigation.ts';

interface ChartLayoutProps {
    title: string;
    description: string;
    filters?: React.ReactNode;
    children: React.ReactNode;
    currentPage?: AnalyticsPage;
    wideSidebar?: boolean; // Deprecated but kept for compatibility
    hideSidebar?: boolean; // Now hides the top filter bar
    hideAnalysisSelector?: boolean;
    sidebarContent?: React.ReactNode;
    websiteDomain?: string; // Domain for feature support checks
    websiteName?: string;   // Website name for dev environment detection
}

interface SidebarNavigationContentProps {
    filteredChartGroups: ChartGroup[];
    currentPage?: AnalyticsPage;
    onNavigate: (e: React.MouseEvent, href: string) => void;
}

const SkipSidebarLink: React.FC = () => {
    const [isFocused, setIsFocused] = useState(false);

    return (
        <a
            href="#chart-layout-main-content"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={
                isFocused
                    ? 'mb-3 inline-block rounded-md bg-[var(--ax-bg-default)] px-3 py-2 text-sm text-[var(--ax-text-default)] shadow-md'
                    : 'absolute left-[-9999px] top-auto h-px w-px overflow-hidden'
            }
        >
            Hopp over menyen for analysetyper
        </a>
    );
};

const SidebarNavigationContent: React.FC<SidebarNavigationContentProps> = ({
    filteredChartGroups,
    currentPage,
    onNavigate
}) => (
    <>
        <SkipSidebarLink />
        {filteredChartGroups.map((group) => (
            <div key={group.title}>
                <div className="flex items-center gap-2 px-3 mb-2 text-sm font-semibold text-[var(--ax-text-subtle)] tracking-wide mt-4">
                    {group.icon}
                    <span>{group.title}</span>
                </div>
                <ul className="space-y-0.5">
                    {group.ids.map(id => {
                        const page = analyticsPages.find(p => p.id === id);
                        if (!page) return null;
                        const isActive = currentPage === page.id;
                        return (
                            <li key={page.id}>
                                <a
                                    href={page.href}
                                    onClick={(e) => onNavigate(e, page.href)}
                                    className={`block px-3 py-2 text-base font-medium rounded-md transition-all duration-200 truncate ${isActive
                                        ? 'bg-[var(--ax-bg-accent-strong)] text-white shadow-sm'
                                        : 'text-[var(--ax-text-default)] hover:bg-[var(--ax-bg-neutral-moderate)] hover:text-[var(--ax-text-strong)]'
                                        }`}
                                    title={page.label}
                                >
                                    {page.label}
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </div>
        ))}
    </>
);

const ChartLayout: React.FC<ChartLayoutProps> = ({
    title,
    description,
    filters,
    children,
    currentPage,
    hideSidebar = false,
    hideAnalysisSelector = false,
    sidebarContent,
    websiteDomain
}) => {
    const { filteredChartGroups, handleNavigation } = useChartNavigation(websiteDomain, hideAnalysisSelector);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    return (
        <>
            <PageHeader
                title={title}
                description={description}
                width="2xl"
            />

            <Page.Block width="2xl" gutters className="pb-16">
                <div className="rounded-lg shadow-sm border border-[var(--ax-border-neutral-subtle)] mb-8 bg-[var(--ax-bg-default)] overflow-hidden">
                    {/* Unified Top Bar */}
                    {(sidebarContent || (!hideSidebar && filters)) && (
                    <div className="border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-subtle)] flex flex-col md:flex-row md:min-h-[80px]">
                        
                        {/* Left Column Header (Sidebar Content) */}
                        {!hideAnalysisSelector && (
                        <div className={`w-full md:w-[250px] flex-shrink-0 border-b md:border-b-0 p-4 flex flex-col justify-end transition-all duration-300 ${isSidebarOpen ? 'md:flex' : 'md:hidden'}`}>
                            {sidebarContent}
                        </div>
                        )}

                        {/* Right Column Header (Filters) */}
                        <div className="w-full md:flex-1 p-4 flex flex-wrap items-end gap-4 border-b md:border-b-0 border-[var(--ax-border-neutral-subtle)] md:border-none">
                        {!hideSidebar && filters}
                        </div>

                    </div>
                    )}

                    <div className="flex flex-col md:flex-row min-h-[800px] relative transition-all duration-300">

                        {/* ================= COL 1: NAVIGATION ================= */}
                        {!hideAnalysisSelector && (
                            <>
                            <div className={`bg-[var(--ax-bg-neutral-soft)] md:border-b-0 flex-shrink-0 ${isSidebarOpen ? 'md:w-[250px]' : 'md:w-0'}`}>


                                {/* Mobile: Accordion View */}
                                <div className="md:hidden">
                                    <Accordion size="small" headingSize="xsmall" className="border-b border-[var(--ax-border-neutral-subtle)] md:border-none">
                                        <Accordion.Item>
                                            <Accordion.Header>Velg analyse</Accordion.Header>
                                            <Accordion.Content className="p-0 border-t border-[var(--ax-border-neutral-subtle)]">
                                                <div className="p-4 bg-[var(--ax-bg-neutral-soft)]">
                                                    <SidebarNavigationContent
                                                        filteredChartGroups={filteredChartGroups}
                                                        currentPage={currentPage}
                                                        onNavigate={handleNavigation}
                                                    />
                                                </div>
                                            </Accordion.Content>
                                        </Accordion.Item>
                                    </Accordion>
                                </div>

                                {/* Desktop: Standard View */}
                                <div className={`hidden md:flex flex-col h-full overflow-y-auto overflow-x-hidden min-w-[250px] p-4 space-y-6 ${isSidebarOpen ? '' : 'md:hidden'}`}>
                                    <SidebarNavigationContent
                                        filteredChartGroups={filteredChartGroups}
                                        currentPage={currentPage}
                                        onNavigate={handleNavigation}
                                    />
                                </div>
                            </div>
                            {isSidebarOpen && (
                                <button
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="hidden md:flex absolute top-3 left-[250px] -translate-x-1/2 items-center justify-center w-6 h-12 bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-subtle)] rounded-md shadow-sm hover:bg-[var(--ax-bg-neutral-soft)] hover:border-[var(--ax-border-neutral-strong)] transition-colors z-10"
                                    title="Minimer meny"
                                    aria-label="Minimer meny"
                                >
                                    <ChevronLeft size={16} className="text-[var(--ax-text-accent)]" aria-hidden />
                                </button>
                            )}
                            {!isSidebarOpen && (
                                <button
                                    onClick={() => setIsSidebarOpen(true)}
                                    className="hidden md:flex absolute top-3 left-0 items-center justify-center w-6 h-12 bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-subtle)] rounded-md shadow-sm hover:bg-[var(--ax-bg-neutral-soft)] hover:border-[var(--ax-border-neutral-strong)] transition-colors z-10"
                                    title="Vis meny"
                                    aria-label="Vis meny"
                                >
                                    <ChevronRight size={16} className="text-[var(--ax-text-accent)]" aria-hidden />
                                </button>
                            )}
                            </>
                        )}

                        {/* ================= COL 2: CONTENT ================= */}
                        <div
                            id="chart-layout-main-content"
                            tabIndex={-1}
                            className="flex-1 min-w-0 bg-[var(--ax-bg-default)] flex flex-col z-0 relative focus:outline-none"
                        >
                            <div className="p-6 md:p-8 flex-1 overflow-x-auto">
                                {children}
                            </div>
                        </div>

                    </div>
                </div>
            </Page.Block>
            <KontaktSeksjon showMarginBottom={true} />
        </>
    );
};

export default ChartLayout;
