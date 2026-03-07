import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Table, Alert, Loader, Tabs, TextField, HelpText, Button, Link as DsLink, ActionMenu, Heading, Tooltip } from '@navikt/ds-react';
import { MoreVertical, Search } from 'lucide-react';

import ChartLayout from './ChartLayout.tsx';
import WebsitePicker from './WebsitePicker.tsx';
import type { SpellingIssue } from '../model/types.ts';
import { downloadCsv } from '../utils/siteimprove.ts';
import { useSpellings } from '../hooks/useSpellings.ts';

const Spellings = () => {
    const {
        selectedWebsite, setSelectedWebsite,
        siteimproveId,
        overviewData, activeTab, setActiveTab,
        pageId, misspellings, potentialMisspellings,
        hasAttemptedFetch, crawlInfo,
        loading, error,
        urlPath, setUrlPath,
        fetchSpellingData,
    } = useSpellings();

    const [potentialSearch, setPotentialSearch] = useState('');
    const [misspellingsSearch, setMisspellingsSearch] = useState('');
    const [showPotentialSearch, setShowPotentialSearch] = useState(false);
    const [showMisspellingsSearch, setShowMisspellingsSearch] = useState(false);
    const potentialSearchInputRef = useRef<HTMLInputElement>(null);
    const misspellingsSearchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (showPotentialSearch) potentialSearchInputRef.current?.focus();
    }, [showPotentialSearch]);

    useEffect(() => {
        if (showMisspellingsSearch) misspellingsSearchInputRef.current?.focus();
    }, [showMisspellingsSearch]);

    const renderTable = (
        items: SpellingIssue[],
        emptyMsg: string,
        filename: string,
        title: string,
        search: string,
        setSearch: (value: string) => void,
        showSearch: boolean,
        setShowSearch: (value: boolean) => void,
        searchInputRef: RefObject<HTMLInputElement | null>,
    ) => {
        const filteredItems = items.filter((item) => item.word.toLowerCase().includes(search.toLowerCase()));

        if (filteredItems.length === 0) {
            return <Alert variant="success">{emptyMsg}</Alert>;
        }
        return (
            <div className="space-y-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <Heading level="3" size="small">{title}</Heading>
                    <div className="flex items-center gap-1">
                        <Tooltip content="Søk" placement="top">
                            <Button
                                type="button"
                                variant={showSearch ? 'secondary' : 'tertiary'}
                                size="xsmall"
                                icon={<Search aria-hidden />}
                                aria-label={`Søk i ${title.toLowerCase()}`}
                                aria-pressed={showSearch}
                                onClick={() => {
                                    setShowSearch(!showSearch);
                                    if (showSearch) setSearch('');
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
                                        aria-label={`Flere valg for ${title.toLowerCase()}`}
                                    />
                                </ActionMenu.Trigger>
                            </Tooltip>
                            <ActionMenu.Content align="end">
                                <ActionMenu.Item
                                    onClick={() => {
                                        downloadCsv(
                                            `${filename}_${selectedWebsite?.name || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`,
                                            ['Ord'],
                                            filteredItems.map((item) => [`"${item.word}"`]),
                                        );
                                    }}
                                    disabled={filteredItems.length === 0}
                                >
                                    Last ned
                                </ActionMenu.Item>
                            </ActionMenu.Content>
                        </ActionMenu>
                    </div>
                </div>
                {showSearch && (
                    <div className="w-full sm:w-64 min-w-0">
                        <TextField
                            label="Søk"
                            hideLabel
                            placeholder="Søk..."
                            size="small"
                            value={search}
                            ref={searchInputRef}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                )}
                <div className="border rounded-lg overflow-x-auto bg-[var(--ax-bg-default)]">
                    <Table size="small" zebraStripes>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell>Ord</Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {filteredItems.map((item, idx) => (
                                <Table.Row key={item.id || idx}>
                                    <Table.DataCell className="font-medium text-red-600">
                                        {item.word}
                                    </Table.DataCell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            </div>
        );
    };

    return (
        <ChartLayout
            title="Stavekontroll"
            description="Oversikt over stavefeil fra Siteimprove."
            currentPage="stavekontroll"
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
                        onChange={(e) => setUrlPath(e.target.value)}
                    />

                    <div className="mt-8">
                        <Button
                            onClick={fetchSpellingData}
                            disabled={!selectedWebsite || loading}
                            loading={loading}
                            className="w-full"
                            size="small"
                        >
                            Vis stavefeil
                        </Button>
                    </div>
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
                    Velg en nettside for å se stavekontroll.
                </Alert>
            )}

            {loading && (
                <div className="flex justify-center items-center h-64">
                    <Loader size="xlarge" title="Henter data..." />
                </div>
            )}

            {!loading && !error && selectedWebsite && hasAttemptedFetch && (
                <>
                    {!urlPath && overviewData && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                                    <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Mulige stavefeil</div>
                                    <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                        {overviewData.potential_misspellings.toLocaleString('nb-NO')}
                                    </div>
                                    <div className="text-sm text-[var(--ax-text-subtle)] mt-1">hele nettstedet</div>
                                </div>
                                <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                                    <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Bekreftede stavefeil</div>
                                    <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                        {overviewData.misspellings.toLocaleString('nb-NO')}
                                    </div>
                                    <div className="text-sm text-[var(--ax-text-subtle)] mt-1">hele nettstedet</div>
                                </div>
                                <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                                    <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Siste sjekk</div>
                                    <div className="flex items-center justify-between">
                                        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                            {new Date(overviewData.check_date).toLocaleDateString('nb-NO')}
                                        </div>
                                        <HelpText title="Status for scan">
                                            <div className="flex flex-col gap-2 min-w-[200px]">
                                                <div>
                                                    <div className="font-semibold text-sm">Sist sjekket</div>
                                                    <div className="text-sm">
                                                        {crawlInfo?.last_crawl ? new Date(crawlInfo.last_crawl).toLocaleString('nb-NO') : new Date(overviewData.check_date).toLocaleString('nb-NO')}
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
                            <Alert variant="info" className="mb-4">
                                Legg til en URL-sti i filteret over for å se spesifikke stavefeil for en side.
                            </Alert>
                        </>
                    )}

                    {urlPath && pageId && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                                    <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Mulige stavefeil</div>
                                    <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                        {potentialMisspellings.length}
                                    </div>
                                </div>
                                <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                                    <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Bekreftede stavefeil</div>
                                    <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                        {misspellings.length}
                                    </div>
                                </div>
                                {overviewData && (
                                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                                        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Siste sjekk</div>
                                        <div className="flex items-center justify-between">
                                            <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                                                {new Date(overviewData.check_date).toLocaleDateString('nb-NO')}
                                            </div>
                                            <HelpText title="Status for scan">
                                                <div className="flex flex-col gap-2 min-w-[200px]">
                                                    <div>
                                                        <div className="font-semibold text-sm">Sist sjekket</div>
                                                        <div className="text-sm">
                                                            {crawlInfo?.last_crawl ? new Date(crawlInfo.last_crawl).toLocaleString('nb-NO') : new Date(overviewData.check_date).toLocaleString('nb-NO')}
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
                                )}
                            </div>

                            <Tabs value={activeTab} onChange={setActiveTab}>
                                <Tabs.List>
                                    <Tabs.Tab value="potential" label="Mulige stavefeil" />
                                    <Tabs.Tab value="misspellings" label="Bekreftede stavefeil" />
                                </Tabs.List>

                                <Tabs.Panel value="potential" className="pt-4">
                                    {renderTable(
                                        potentialMisspellings,
                                        potentialSearch ? `Ingen treff for "${potentialSearch}"` : 'Ingen mulige stavefeil funnet.',
                                        'mulige_stavefeil',
                                        'Mulige stavefeil',
                                        potentialSearch,
                                        setPotentialSearch,
                                        showPotentialSearch,
                                        setShowPotentialSearch,
                                        potentialSearchInputRef,
                                    )}
                                </Tabs.Panel>
                                <Tabs.Panel value="misspellings" className="pt-4">
                                    {renderTable(
                                        misspellings,
                                        misspellingsSearch ? `Ingen treff for "${misspellingsSearch}"` : 'Ingen bekreftede stavefeil funnet!',
                                        'bekreftede_stavefeil',
                                        'Bekreftede stavefeil',
                                        misspellingsSearch,
                                        setMisspellingsSearch,
                                        showMisspellingsSearch,
                                        setShowMisspellingsSearch,
                                        misspellingsSearchInputRef,
                                    )}
                                </Tabs.Panel>
                            </Tabs>

                            {siteimproveId && (
                                <div className="mt-6 flex justify-end">
                                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
                                        <DsLink
                                            href={`https://my2.siteimprove.com/QualityAssurance/${siteimproveId}/Spelling/PagesWithSpellingIssues`}
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
                </>
            )}
        </ChartLayout>
    );
};

export default Spellings;
