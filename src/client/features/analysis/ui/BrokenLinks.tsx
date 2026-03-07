import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Alert, Loader, Link as DsLink, Tabs, HelpText, Button, TextField, ActionMenu, Heading, Tooltip } from '@navikt/ds-react';
import { ExternalLink, MoreVertical, Search } from 'lucide-react';
import ChartLayout from './ChartLayout.tsx';
import AnalysisActionModal from './AnalysisActionModal.tsx';
import WebsitePicker from './WebsitePicker.tsx';
import type { Website } from '../../../shared/types/chart.ts';
import { getUrlPath } from '../utils/url.ts';
import { downloadCsv } from '../utils/siteimprove.ts';
import { useBrokenLinks, usePageBrokenLinks, useBrokenLinkPages } from '../hooks/useBrokenLinks.ts';

function PageBrokenLinksContent({
    pageId,
    siteimproveId,
    siteimproveBaseUrl,
}: {
    pageId: number;
    siteimproveId: string;
    siteimproveBaseUrl: string;
}) {
    const { pageBrokenLinks, loading, error, retry } = usePageBrokenLinks(pageId, siteimproveId, siteimproveBaseUrl);

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-2">
                <Loader size="small" title="Henter ødelagte lenker..." />
                <span className="text-sm text-[var(--ax-text-subtle)]">Henter ødelagte lenker...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col gap-2 items-start py-2">
                <Alert variant="warning" size="small">{error}</Alert>
                <Button variant="secondary" size="small" onClick={retry}>Prøv igjen</Button>
            </div>
        );
    }

    if (pageBrokenLinks.length === 0) {
        return <span className="text-sm text-[var(--ax-text-subtle)]">Ingen ødelagte lenker funnet.</span>;
    }

    return (
        <div className="py-4">
            <Table>
                <Table.Header>
                    <Table.Row>
                        <Table.HeaderCell>Ødelagte lenker på denne siden</Table.HeaderCell>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {pageBrokenLinks.map((link, idx) => (
                        <Table.Row key={idx}>
                            <Table.DataCell>
                                <DsLink href={link.url} target="_blank" className="break-all flex items-center gap-1 text-base">
                                    {link.url} <ExternalLink size={16} />
                                </DsLink>
                            </Table.DataCell>
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table>
        </div>
    );
}

function BrokenLinkPagesContent({
    linkId,
    siteimproveId,
    siteimproveBaseUrl,
}: {
    linkId: number;
    siteimproveId: string;
    siteimproveBaseUrl: string;
}) {
    const { pages, loading, error, retry } = useBrokenLinkPages(linkId, siteimproveId, siteimproveBaseUrl);

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-2">
                <Loader size="small" title="Henter sider..." />
                <span className="text-sm text-[var(--ax-text-subtle)]">Henter sider...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col gap-2 items-start py-2">
                <Alert variant="warning" size="small">{error}</Alert>
                <Button variant="secondary" size="small" onClick={retry}>Prøv igjen</Button>
            </div>
        );
    }

    if (pages.length === 0) {
        return <span className="text-sm text-[var(--ax-text-subtle)]">Ingen sider funnet.</span>;
    }

    return (
        <div className="py-4">
            <Table>
                <Table.Header>
                    <Table.Row>
                        <Table.HeaderCell>Side URL</Table.HeaderCell>
                        <Table.HeaderCell>Sidetittel</Table.HeaderCell>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {pages.map((page, idx) => (
                        <Table.Row key={idx}>
                            <Table.DataCell>
                                <DsLink href={page.url} target="_blank" className="break-all flex items-center gap-1 text-base">
                                    {getUrlPath(page.url)} <ExternalLink size={16} />
                                </DsLink>
                            </Table.DataCell>
                            <Table.DataCell>
                                {page.title || '-'}
                            </Table.DataCell>
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table>
        </div>
    );
}

const BrokenLinks = () => {
    const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
    const [actionModalUrl, setActionModalUrl] = useState<string | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<string>('pages');
    const [urlPath, setUrlPath] = useState<string>(() => searchParams.get('urlPath') || '');
    const [pagesSearch, setPagesSearch] = useState('');
    const [linksSearch, setLinksSearch] = useState('');
    const [showPagesSearch, setShowPagesSearch] = useState(false);
    const [showLinksSearch, setShowLinksSearch] = useState(false);
    const pagesSearchInputRef = useRef<HTMLInputElement>(null);
    const linksSearchInputRef = useRef<HTMLInputElement>(null);

    const {
        brokenLinks,
        pagesWithBrokenLinks,
        siteimproveId,
        crawlInfo,
        loading,
        error,
        siteimproveBaseUrl,
    } = useBrokenLinks(selectedWebsite);

    const filteredPages = pagesWithBrokenLinks.filter(page => !urlPath || page.url.toLowerCase().includes(urlPath.toLowerCase()));
    const displayedPages = filteredPages.filter((page) => getUrlPath(page.url).toLowerCase().includes(pagesSearch.toLowerCase()));
    const displayedLinks = brokenLinks.filter((link) => link.url.toLowerCase().includes(linksSearch.toLowerCase()));
    const hasUrlFilter = urlPath.trim().length > 0;
    const pagesCount = hasUrlFilter ? filteredPages.length : pagesWithBrokenLinks.length;
    const brokenLinksCount = hasUrlFilter
        ? filteredPages.reduce((sum, page) => sum + page.broken_links, 0)
        : brokenLinks.length;

    useEffect(() => {
        if (showPagesSearch) pagesSearchInputRef.current?.focus();
    }, [showPagesSearch]);

    useEffect(() => {
        if (showLinksSearch) linksSearchInputRef.current?.focus();
    }, [showLinksSearch]);

    return (
        <ChartLayout
            title="Ødelagte lenker"
            description="Oversikt over ødelagte lenker fra Siteimprove."
            currentPage="odelagte-lenker"
            websiteDomain={selectedWebsite?.domain}
            websiteName={selectedWebsite?.name}
            sidebarContent={
                <WebsitePicker
                    selectedWebsite={selectedWebsite}
                    onWebsiteChange={setSelectedWebsite}
                    variant="minimal"
                />
            }
            filters={
                <>
                    <TextField
                        size="small"
                        label="URL"
                        value={urlPath}
                        onChange={(e) => {
                            const val = e.target.value;
                            setUrlPath(val);

                            const newParams = new URLSearchParams(searchParams);
                            if (val) {
                                newParams.set('urlPath', val);
                            } else {
                                newParams.delete('urlPath');
                            }
                            setSearchParams(newParams, { replace: true });
                        }}
                    />
                </>
            }
        >
            {error && (
                <Alert variant="info" className="mb-4">
                    {error}
                </Alert>
            )}

            {!selectedWebsite && !loading && (
                <Alert variant="info">
                    Velg en nettside for å se status på lenker.
                </Alert>
            )}

            {loading && (
                <div className="flex justify-center items-center h-64">
                    <Loader size="xlarge" title="Henter ødelagte lenker..." />
                </div>
            )}

            {!loading && !error && selectedWebsite && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                            <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Antall sider med ødelagte lenker</div>
                            <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                {pagesCount.toLocaleString('nb-NO')}
                            </div>
                        </div>
                        <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                            <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Totalt antall ødelagte lenker</div>
                            <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                {brokenLinksCount.toLocaleString('nb-NO')}
                            </div>
                        </div>
                        <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                            <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Siste scan</div>
                            <div className="flex items-center justify-between">
                                <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                    {crawlInfo?.last_crawl ? new Date(crawlInfo.last_crawl).toLocaleDateString('nb-NO') : '-'}
                                </div>
                                <HelpText title="Status for scan">
                                    <div className="flex flex-col gap-2 min-w-[200px]">
                                        <div>
                                            <div className="font-semibold text-sm">Sist sjekket</div>
                                            <div className="text-sm">
                                                {crawlInfo?.last_crawl ? new Date(crawlInfo.last_crawl).toLocaleString('nb-NO') : '-'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm">Neste planlagte scan</div>
                                            <div className="text-sm">
                                                {crawlInfo?.next_crawl ? new Date(crawlInfo.next_crawl).toLocaleString('nb-NO') : '-'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm">Kjører nå</div>
                                            <div className="text-sm">{crawlInfo?.is_crawl_running ? 'Ja' : 'Nei'}</div>
                                        </div>
                                    </div>
                                </HelpText>
                            </div>
                        </div>
                    </div>

                    <Tabs value={activeTab} onChange={setActiveTab}>
                        <Tabs.List>
                            <Tabs.Tab value="pages" label="Sider med ødelagte lenker" />
                            <Tabs.Tab value="links" label="Alle ødelagte lenker" />
                        </Tabs.List>

                        <Tabs.Panel value="pages" className="pt-4">
                            {displayedPages.length === 0 ? (
                                <Alert variant="success">
                                    {urlPath
                                        ? (pagesSearch ? `Fant ingen treff for "${pagesSearch}" innen "${urlPath}"` : `Fant ingen ødelagte lenker for "${urlPath}"`)
                                        : (pagesSearch ? `Fant ingen treff for "${pagesSearch}"` : 'Fant ingen sider med ødelagte lenker!')
                                    }
                                </Alert>
                            ) : (
                                <div className="border border-[var(--ax-border-neutral-subtle)] rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
                                    <div className="p-4 pb-2">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <Heading level="3" size="small">Sider med ødelagte lenker</Heading>
                                            <div className="flex items-center gap-1">
                                                <Tooltip content="Søk" placement="top">
                                                    <Button
                                                        type="button"
                                                        variant={showPagesSearch ? 'secondary' : 'tertiary'}
                                                        size="xsmall"
                                                        icon={<Search aria-hidden />}
                                                        aria-label="Søk i sider med ødelagte lenker"
                                                        aria-pressed={showPagesSearch}
                                                        onClick={() => {
                                                            setShowPagesSearch((prev) => !prev);
                                                            if (showPagesSearch) setPagesSearch('');
                                                        }}
                                                    />
                                                </Tooltip>
                                                <ActionMenu>
                                                    <Tooltip content="Flere valg" placement="top">
                                                        <ActionMenu.Trigger>
                                                            <Button
                                                                type="button"
                                                                variant="tertiary"
                                                                size="xsmall"
                                                                icon={<MoreVertical aria-hidden />}
                                                                aria-label="Flere valg for sider med ødelagte lenker"
                                                            />
                                                        </ActionMenu.Trigger>
                                                    </Tooltip>
                                                    <ActionMenu.Content align="end">
                                                        <ActionMenu.Item
                                                            onClick={() => {
                                                                downloadCsv(
                                                                    `sider_med_odelagte_lenker_${selectedWebsite?.name || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`,
                                                                    ['URL', 'Ødelagte lenker'],
                                                                    displayedPages.map((page) => [`"${getUrlPath(page.url)}"`, String(page.broken_links)])
                                                                );
                                                            }}
                                                            disabled={displayedPages.length === 0}
                                                        >
                                                            Last ned
                                                        </ActionMenu.Item>
                                                    </ActionMenu.Content>
                                                </ActionMenu>
                                            </div>
                                        </div>
                                        {showPagesSearch && (
                                            <div className="w-full sm:w-64 min-w-0">
                                                <TextField
                                                    label="Søk"
                                                    hideLabel
                                                    placeholder="Søk..."
                                                    size="small"
                                                    value={pagesSearch}
                                                    ref={pagesSearchInputRef}
                                                    onChange={(e) => setPagesSearch(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                <div className="overflow-x-auto px-4 pb-4">
                                    <Table size="small" zebraStripes>
                                        <Table.Header>
                                            <Table.Row>
                                                <Table.HeaderCell />
                                                <Table.HeaderCell>URL</Table.HeaderCell>
                                                <Table.HeaderCell>Ødelagte</Table.HeaderCell>
                                            </Table.Row>
                                        </Table.Header>
                                        <Table.Body>
                                            {displayedPages.map((page, index) => (
                                                <Table.ExpandableRow
                                                    key={page.id || index}
                                                    content={
                                                        siteimproveId ? (
                                                            <PageBrokenLinksContent
                                                                pageId={page.id}
                                                                siteimproveId={siteimproveId}
                                                                siteimproveBaseUrl={siteimproveBaseUrl}
                                                            />
                                                        ) : null
                                                    }
                                                    togglePlacement="left"
                                                >
                                                    <Table.HeaderCell scope="row">
                                                        <DsLink
                                                            href="#"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                setActionModalUrl(getUrlPath(page.url));
                                                            }}
                                                            className="break-all flex items-center gap-1"
                                                        >
                                                            {getUrlPath(page.url)} <ExternalLink size={14} />
                                                        </DsLink>
                                                    </Table.HeaderCell>
                                                    <Table.DataCell>
                                                        {page.broken_links}
                                                    </Table.DataCell>
                                                </Table.ExpandableRow>
                                            ))}
                                        </Table.Body>
                                    </Table>
                                </div>
                                </div>
                            )}
                        </Tabs.Panel>

                        <Tabs.Panel value="links" className="pt-4">
                            {displayedLinks.length === 0 ? (
                                <Alert variant="success">
                                    {linksSearch ? `Fant ingen treff for "${linksSearch}"` : 'Fant ingen ødelagte lenker! 🎉'}
                                </Alert>
                            ) : (
                                <div className="border border-[var(--ax-border-neutral-subtle)] rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
                                    <div className="p-4 pb-2">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <Heading level="3" size="small">Alle ødelagte lenker</Heading>
                                            <div className="flex items-center gap-1">
                                                <Tooltip content="Søk" placement="top">
                                                    <Button
                                                        type="button"
                                                        variant={showLinksSearch ? 'secondary' : 'tertiary'}
                                                        size="xsmall"
                                                        icon={<Search aria-hidden />}
                                                        aria-label="Søk i alle ødelagte lenker"
                                                        aria-pressed={showLinksSearch}
                                                        onClick={() => {
                                                            setShowLinksSearch((prev) => !prev);
                                                            if (showLinksSearch) setLinksSearch('');
                                                        }}
                                                    />
                                                </Tooltip>
                                                <ActionMenu>
                                                    <Tooltip content="Flere valg" placement="top">
                                                        <ActionMenu.Trigger>
                                                            <Button
                                                                type="button"
                                                                variant="tertiary"
                                                                size="xsmall"
                                                                icon={<MoreVertical aria-hidden />}
                                                                aria-label="Flere valg for alle ødelagte lenker"
                                                            />
                                                        </ActionMenu.Trigger>
                                                    </Tooltip>
                                                    <ActionMenu.Content align="end">
                                                        <ActionMenu.Item
                                                            onClick={() => {
                                                                downloadCsv(
                                                                    `odelagte_lenker_${selectedWebsite?.name || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`,
                                                                    ['URL', 'Tilfeller'],
                                                                    displayedLinks.map((bl) => [`"${bl.url}"`, String(bl.pages)])
                                                                );
                                                            }}
                                                            disabled={displayedLinks.length === 0}
                                                        >
                                                            Last ned
                                                        </ActionMenu.Item>
                                                    </ActionMenu.Content>
                                                </ActionMenu>
                                            </div>
                                        </div>
                                        {showLinksSearch && (
                                            <div className="w-full sm:w-64 min-w-0">
                                                <TextField
                                                    label="Søk"
                                                    hideLabel
                                                    placeholder="Søk..."
                                                    size="small"
                                                    value={linksSearch}
                                                    ref={linksSearchInputRef}
                                                    onChange={(e) => setLinksSearch(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                <div className="overflow-x-auto px-4 pb-4">
                                    <Table size="small" zebraStripes>
                                        <Table.Header>
                                            <Table.Row>
                                                <Table.HeaderCell />
                                                <Table.HeaderCell>URL</Table.HeaderCell>
                                                <Table.HeaderCell>Tilfeller</Table.HeaderCell>
                                            </Table.Row>
                                        </Table.Header>
                                        <Table.Body>
                                            {displayedLinks.map((link, index) => (
                                                <Table.ExpandableRow
                                                    key={link.id || index}
                                                    content={
                                                        siteimproveId ? (
                                                            <BrokenLinkPagesContent
                                                                linkId={link.id}
                                                                siteimproveId={siteimproveId}
                                                                siteimproveBaseUrl={siteimproveBaseUrl}
                                                            />
                                                        ) : null
                                                    }
                                                    togglePlacement="left"
                                                >
                                                    <Table.HeaderCell scope="row">
                                                        <DsLink href={link.url} target="_blank" className="break-all flex items-center gap-1">
                                                            {link.url} <ExternalLink size={14} />
                                                        </DsLink>
                                                    </Table.HeaderCell>
                                                    <Table.DataCell>
                                                        {link.pages}
                                                    </Table.DataCell>
                                                </Table.ExpandableRow>
                                            ))}
                                        </Table.Body>
                                    </Table>
                                </div>
                                </div>
                            )}
                        </Tabs.Panel>
                    </Tabs>

                    {siteimproveId && (
                        <div className="mt-6 flex justify-end">
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
                                <DsLink
                                    href={`https://my2.siteimprove.com/QualityAssurance/${siteimproveId}/Links/Pages/1/PageLevel/Asc?pageSize=100`}
                                    target="_blank"
                                    className="font-semibold"
                                >
                                    Åpne i Siteimprove
                                </DsLink>
                                <DsLink
                                    href="https://jira.adeo.no/plugins/servlet/desk/portal/581/create/2641"
                                    target="_blank"
                                >
                                    Få tilgang til Siteimprove
                                </DsLink>
                            </div>
                        </div>
                    )}
                </>
            )}

            <AnalysisActionModal
                open={!!actionModalUrl}
                onClose={() => setActionModalUrl(null)}
                urlPath={actionModalUrl}
                websiteId={selectedWebsite?.id}
                domain={selectedWebsite?.domain}
            />
        </ChartLayout>
    );
};

export default BrokenLinks;
