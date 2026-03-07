import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionMenu, Button, Alert, Loader, Heading, Table, Pagination, Modal, Link, InlineMessage, Tooltip } from '@navikt/ds-react';
import { Monitor, Smartphone, Globe, Clock, User, Laptop, Tablet, ExternalLink, MoreVertical, Search } from 'lucide-react';
import { parseISO } from 'date-fns';
import ChartLayout from '../../analysis/ui/ChartLayout.tsx';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx';
import AnalysisActionModal from '../../analysis/ui/AnalysisActionModal.tsx';
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx';
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx';
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx';
import TransferToMetabaseDialog from '../../../shared/ui/TransferToMetabaseDialog.tsx';
import { openSqlEditorWithContext } from '../../../shared/lib/openSqlEditor.ts';
import type { Website } from '../../../shared/types/chart.ts';
import { translateCountry } from '../../../shared/lib/translations.ts';
import { normalizeUrlToPath, getDateRangeFromPeriod, getStoredPeriod, savePeriodPreference, getCookieCountByParams, getCookieBadge } from '../../../shared/lib/utils.ts';
import { TextField } from '@navikt/ds-react';
import { useCookieSupport, useCookieStartDate } from '../../../shared/hooks/useSiteimproveSupport.ts';
import type { UserProfile, ActivityItem, QueryStats, UsersApiResponse, ActivityApiResponse } from '../model';
import { getUserProfilesSqlTemplate } from '../utils/userProfilesDashboardSql.ts';

const ROWS_PER_PAGE = 50;
const DEFAULT_MAX_USERS = 1000;
const MIN_MAX_USERS = 50;
const MAX_MAX_USERS = 100000;


const UserProfiles = () => {
    const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
    const [searchParams] = useSearchParams();

    // State
    const [period, setPeriodState] = useState<string>(() => getStoredPeriod(searchParams.get('period')));

    // Wrap setPeriod to also save to localStorage
    const setPeriod = (newPeriod: string) => {
        setPeriodState(newPeriod);
        savePeriodPreference(newPeriod);
    };

    // Support custom dates from URL
    const fromDateFromUrl = searchParams.get("from");
    const toDateFromUrl = searchParams.get("to");
    const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined;
    const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined;

    const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate);
    const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate);
    const usesCookies = useCookieSupport(selectedWebsite?.domain);
    const cookieStartDate = useCookieStartDate(selectedWebsite?.domain);
    const [pagePath, setPagePath] = useState<string>(() => searchParams.get('urlPath') || searchParams.get('pagePath') || '');
    const [pathOperator, setPathOperator] = useState<string>(() => searchParams.get('pathOperator') || 'equals');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [totalUsers, setTotalUsers] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState<number>(1);
    const [maxUsers, setMaxUsers] = useState<number>(DEFAULT_MAX_USERS);
    const [queryStats, setQueryStats] = useState<QueryStats | null>(null);
    const [showTableSearch, setShowTableSearch] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);
    const [showTransferToMetabaseDialog, setShowTransferToMetabaseDialog] = useState(false);
    const tableSearchInputRef = useRef<HTMLInputElement>(null);

    // Details Modal State
    const [selectedSession, setSelectedSession] = useState<UserProfile | null>(null);
    const [activityLoading, setActivityLoading] = useState<boolean>(false);
    const [activityData, setActivityData] = useState<ActivityItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [selectedActivityUrl, setSelectedActivityUrl] = useState<string | null>(null);

    const getDateRange = useCallback(() => {
        const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate);
        if (!dateRange) {
            throw new Error('Vennligst velg en gyldig periode.');
        }
        return dateRange;
    }, [period, customStartDate, customEndDate]);

    const fetchUsers = useCallback(async (pageOverride?: number) => {
        if (!selectedWebsite) return;

        setLoading(true);
        setError(null);

        const { startDate, endDate } = getDateRange();
        const currentPage = pageOverride ?? page;
        const normalizedMaxUsers = Number.isFinite(maxUsers) && maxUsers > 0
            ? Math.min(Math.max(maxUsers, MIN_MAX_USERS), MAX_MAX_USERS)
            : DEFAULT_MAX_USERS;
        const offset = (currentPage - 1) * ROWS_PER_PAGE;
        const remaining = Math.max(normalizedMaxUsers - offset, 0);
        const limit = Math.min(ROWS_PER_PAGE, remaining);

        if (limit === 0) {
            setUsers([]);
            setTotalUsers(normalizedMaxUsers);
            setQueryStats(null);
            setLoading(false);
            return;
        }

        const { countBy, countBySwitchAt } = getCookieCountByParams(usesCookies, cookieStartDate, startDate, endDate);
        const payload = {
            websiteId: selectedWebsite.id,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            query: searchQuery,
            urlPath: pagePath ? normalizeUrlToPath(pagePath) : undefined,
            pathOperator,
            limit,
            offset,
            maxUsers: normalizedMaxUsers,
            countBy,
            countBySwitchAt
        };

        console.log('Fetching users with payload:', payload);

        try {
            const response = await fetch('/api/bigquery/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) throw new Error('Kunne ikke hente brukere');

            const result: UsersApiResponse = await response.json();
            setUsers(result.users);
            setTotalUsers(result.total);
            setQueryStats(result.queryStats ?? null);

            // Update URL with configuration for sharing
            const newParams = new URLSearchParams(window.location.search);
            newParams.set('period', period);
            if (pagePath) {
                newParams.set('urlPath', pagePath);
                newParams.set('pathOperator', pathOperator);
                newParams.delete('pagePath');
            } else {
                newParams.delete('urlPath');
                newParams.delete('pathOperator');
                newParams.delete('pagePath');
            }

            // Update URL without navigation
            window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'En feil oppstod';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [selectedWebsite, page, maxUsers, searchQuery, pagePath, pathOperator, usesCookies, cookieStartDate, getDateRange, period]);

    const handleSearchClick = useCallback(() => {
        setPage(1);
        fetchUsers(1);
    }, [fetchUsers]);

    useEffect(() => {
        if (selectedWebsite) {
            handleSearchClick(); // Trigger fetch when website/period changes
        }
    }, [selectedWebsite, period, page, handleSearchClick]);

    // Handle "Enter" key in search fields


    const fetchUserActivity = async (sessionId: string) => {
        if (!selectedWebsite) return;

        setActivityLoading(true);
        const { startDate, endDate } = getDateRange();

        try {
            const response = await fetch(`/api/bigquery/users/${sessionId}/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    websiteId: selectedWebsite.id,
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                }),
            });

            if (!response.ok) throw new Error('Kunne ikke hente aktivitet');

            const result: ActivityApiResponse = await response.json();
            setActivityData(result.activity);
        } finally {
            setActivityLoading(false);
        }
    };



    const handleRowClick = (user: UserProfile) => {
        setSelectedSession(user);
        setIsModalOpen(true);
        fetchUserActivity(user.primarySessionId || user.sessionIds?.[0] || user.userId || '');
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('no-NO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Oslo'
        });
    };

    const formatNumber = (num: number) => {
        return num.toLocaleString('no-NO');
    };

    const getDeviceIcon = (device?: string) => {
        switch (device?.toLowerCase()) {
            case 'mobile': return <Smartphone size={16} />;
            case 'tablet': return <Tablet size={16} />;
            case 'laptop':
            case 'desktop': return <Laptop size={16} />;
            default: return <Monitor size={16} />;
        }
    };

    const translateDevice = (device?: string) => {
        switch (device?.toLowerCase()) {
            case 'mobile': return 'Mobil';
            case 'tablet': return 'Nettbrett';
            case 'laptop': return 'Bærbar PC';
            case 'desktop': return 'Stasjonær PC';
            default: return device || 'Ukjent';
        }
    };

    const downloadProfilesCsv = (filteredUsers: UserProfile[]) => {
        const headers = ['Bruker ID', 'ID-type', 'Sesjoner', 'Distinct ID', 'Sist sett', 'Land', 'Enhet', 'Nettleser'];
        const csvRows = [
            headers.join(','),
            ...filteredUsers.map((user) => [
                `"${user.userId}"`,
                `"${user.idType || ''}"`,
                `"${(user.sessionIds || []).length}"`,
                `"${user.distinctId || ''}"`,
                `"${formatDate(user.lastSeen)}"`,
                `"${translateCountry(user.country)}"`,
                `"${translateDevice(user.device)}"`,
                `"${user.browser || '-'}"`
            ].join(','))
        ];
        const csvContent = csvRows.join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `brukerprofiler_${selectedWebsite?.name || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        if (showTableSearch) tableSearchInputRef.current?.focus();
    }, [showTableSearch]);

    return (
        <ChartLayout
            title="Enkeltbrukere"
            description="Se individuelle brukere og deres aktivitetslogg."
            currentPage="enkeltbrukere"
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
                    <div className="w-full sm:w-auto min-w-[200px]">
                        <UrlPathFilter
                            urlPaths={pagePath ? [pagePath] : []}
                            onUrlPathsChange={(paths) => setPagePath(paths[0] || '')}
                            pathOperator={pathOperator}
                            onPathOperatorChange={setPathOperator}
                            selectedWebsiteDomain={selectedWebsite?.domain}
                            label="URL"
                        />
                    </div>

                    <PeriodPicker
                        period={period}
                        onPeriodChange={(newPeriod) => {
                            setPeriod(newPeriod);
                            setPage(1);
                        }}
                        startDate={customStartDate}
                        onStartDateChange={setCustomStartDate}
                        endDate={customEndDate}
                        onEndDateChange={setCustomEndDate}
                    />

                    <div className="w-full sm:w-auto min-w-[160px]">
                        <TextField
                            label="Maks brukere"
                            size="small"
                            type="number"
                            min={MIN_MAX_USERS}
                            max={MAX_MAX_USERS}
                            step={50}
                            value={Number.isFinite(maxUsers) && maxUsers > 0 ? maxUsers : ''}
                            onChange={(e) => {
                                const value = parseInt(e.target.value, 10);
                                setMaxUsers(Number.isFinite(value) ? value : 0);
                            }}
                            onBlur={() => {
                                const normalized = Number.isFinite(maxUsers) && maxUsers > 0
                                    ? Math.min(Math.max(maxUsers, MIN_MAX_USERS), MAX_MAX_USERS)
                                    : DEFAULT_MAX_USERS;
                                if (normalized !== maxUsers) {
                                    setMaxUsers(normalized);
                                }
                            }}
                        />
                    </div>

                    <div className="flex items-end pb-[2px]">
                        <Button
                            className="w-full sm:w-auto"
                            size="small"
                            onClick={handleSearchClick}
                            disabled={!selectedWebsite}
                        >
                            Vis enkeltbrukere
                        </Button>
                    </div>
                </>
            }
        >
            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {loading && (
                <div className="flex justify-center items-center h-64">
                    <Loader size="xlarge" title="Henter brukere..." />
                </div>
            )}

            {!loading && selectedWebsite && users.length === 0 && (
                <Alert variant="info" className="mb-4">
                    <>
                        Ingen brukere funnet.{' '}
                        <Link href="/diagnose">Sjekk diagnostikk</Link> for å se om data blir samlet inn.
                    </>
                </Alert>
            )}

            {!loading && users.length > 0 && (() => {
                const { startDate, endDate } = getDateRange();
                const cookieBadge = getCookieBadge(usesCookies, cookieStartDate, startDate, endDate);
                const isCookieRange = cookieBadge === 'cookie';
                const isMixRange = cookieBadge === 'mix';
                const normalizedMaxUsers = Number.isFinite(maxUsers) && maxUsers > 0
                    ? Math.min(Math.max(maxUsers, MIN_MAX_USERS), MAX_MAX_USERS)
                    : DEFAULT_MAX_USERS;
                const isAtMaxUsersLimit = totalUsers >= normalizedMaxUsers;

                const filteredUsers = users.filter(user =>
                    (user.userId && user.userId.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (user.distinctId && user.distinctId.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (user.sessionIds && user.sessionIds.some((id: string) => id.toLowerCase().includes(searchQuery.toLowerCase()))) ||
                    (user.country && translateCountry(user.country).toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (user.browser && user.browser.toLowerCase().includes(searchQuery.toLowerCase()))
                );
                return (
                    <>
                        <div className="border border-[var(--ax-border-neutral-subtle)] rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
                            <div className="p-4 pb-2">
                                <TableSectionHeader
                                    title={`Viser ${formatNumber(totalUsers)} ${totalUsers === 1 ? 'bruker' : 'enkeltbrukere'}`}
                                    headingLevel="2"
                                    headingSize="medium"
                                    meta={isAtMaxUsersLimit ? (
                                        <div className="mt-3 max-w-[72ch] pb-4">
                                            <InlineMessage status="warning">
                                                {normalizedMaxUsers === DEFAULT_MAX_USERS
                                                    ? `Begrenset til maks ${formatNumber(DEFAULT_MAX_USERS)} brukere. Øk "Maks brukere" ved behov.`
                                                    : `Begrenset til maks ${formatNumber(normalizedMaxUsers)} brukere. Flere ved behov.`}
                                            </InlineMessage>
                                        </div>
                                    ) : undefined}
                                    description={isCookieRange
                                        ? 'Cookies er aktivert. Brukere identifiseres med cookie‑ID på tvers av økter innen perioden.'
                                        : isMixRange
                                            ? 'Perioden krysser overgang til cookies. Listen inneholder både cookie‑ID og sesjons‑ID.'
                                            : 'Brukere er unike hver måned og får en ny bruker ID ved månedsskifte. På den måten kan de ikke spores over tid, noe som ivaretar personvernet.'}
                                    actions={(
                                        <>
                                        <Tooltip content="Søk" placement="top">
                                            <Button
                                                type="button"
                                                variant={showTableSearch ? 'secondary' : 'tertiary'}
                                                size="xsmall"
                                                icon={<Search aria-hidden />}
                                                aria-label="Søk i brukertabell"
                                                aria-pressed={showTableSearch}
                                                onClick={() => {
                                                    setShowTableSearch((prev) => !prev);
                                                    if (showTableSearch) setSearchQuery('');
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
                                                        aria-label="Flere valg for brukertabell"
                                                    />
                                                </ActionMenu.Trigger>
                                            </Tooltip>
                                            <ActionMenu.Content align="end">
                                                <ActionMenu.Item onClick={() => setShowAddToDashboardDialog(true)}>
                                                    Legg til i dashboard
                                                </ActionMenu.Item>
                                                <ActionMenu.Item onClick={() => setShowTransferToMetabaseDialog(true)}>
                                                    Overfør til Metabase
                                                </ActionMenu.Item>
                                                <ActionMenu.Item onClick={() => openSqlEditorWithContext({ sql: getUserProfilesSqlTemplate(), websiteId: selectedWebsite?.id })}>
                                                    Åpne i SQL-editor
                                                </ActionMenu.Item>
                                                <ActionMenu.Item
                                                    onClick={() => downloadProfilesCsv(filteredUsers)}
                                                    disabled={filteredUsers.length === 0}
                                                >
                                                    Last ned CSV
                                                </ActionMenu.Item>
                                                {queryStats && (
                                                    <>
                                                        <ActionMenu.Divider />
                                                        <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                                                            {queryStats.totalBytesProcessedGB} GB prosessert
                                                        </div>
                                                    </>
                                                )}
                                            </ActionMenu.Content>
                                        </ActionMenu>
                                        </>
                                    )}
                                    controls={showTableSearch ? (
                                        <div className="w-full sm:w-64 min-w-0">
                                            <TextField
                                                label="Søk"
                                                hideLabel
                                                placeholder="Søk..."
                                                size="small"
                                                value={searchQuery}
                                                ref={tableSearchInputRef}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                    ) : undefined}
                                />
                            </div>
                            <div className="overflow-x-auto px-4">
                                <Table size="medium" zebraStripes>
                                    <Table.Header>
                                        <Table.Row>
                                            <Table.HeaderCell>Bruker ID</Table.HeaderCell>
                                            <Table.HeaderCell>Sist sett</Table.HeaderCell>
                                            <Table.HeaderCell>Land</Table.HeaderCell>
                                            <Table.HeaderCell>Enhet</Table.HeaderCell>
                                            <Table.HeaderCell>Nettleser</Table.HeaderCell>
                                            <Table.HeaderCell>Handling</Table.HeaderCell>
                                        </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                        {filteredUsers.map((user) => (
                                            <Table.Row
                                                key={user.userId}
                                                onClick={() => handleRowClick(user)}
                                                className="cursor-pointer hover:bg-[var(--ax-bg-neutral-soft)]"
                                            >
                                                <Table.DataCell>
                                                    <Link href="#" onClick={(e) => { e.preventDefault(); handleRowClick(user); }}>
                                                        {user.idType === 'cookie' ? ' 🍪 ' : ''}
                                                        {user.userId ? `${user.userId.substring(0, 8)}...` : '(ukjent)'}                          
                                                    </Link>
                                                </Table.DataCell>
                                                <Table.DataCell>{formatDate(user.lastSeen)}</Table.DataCell>
                                                <Table.DataCell>{translateCountry(user.country ?? '')}</Table.DataCell>
                                                <Table.DataCell>
                                                    <div className="flex items-center gap-2">
                                                        {getDeviceIcon(user.device)}
                                                        {translateDevice(user.device)}
                                                    </div>
                                                </Table.DataCell>
                                                <Table.DataCell>{user.browser || '-'}</Table.DataCell>
                                                <Table.DataCell>
                                                    <Button
                                                        size="small"
                                                        variant="tertiary"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRowClick(user);
                                                        }}
                                                    >
                                                        Vis profil
                                                    </Button>
                                                </Table.DataCell>
                                            </Table.Row>
                                        ))}
                                    </Table.Body>
                                </Table>
                            </div>
                            {totalUsers > ROWS_PER_PAGE ? (
                                <div className="flex justify-center px-4 pb-4 pt-2">
                                    <Pagination
                                        page={page}
                                        onPageChange={setPage}
                                        count={Math.ceil(totalUsers / ROWS_PER_PAGE)}
                                        size="small"
                                    />
                                </div>
                            ) : (
                                <div className="px-4 pb-4" aria-hidden="true" />
                            )}
                            </div>
                    </>
                );
            })()}

            <AddToDashboardDialog
                open={showAddToDashboardDialog}
                onClose={() => setShowAddToDashboardDialog(false)}
                graphName="Enkeltbrukere"
                sqlText={getUserProfilesSqlTemplate()}
                graphType="TABLE"
                sourceWebsiteId={selectedWebsite?.id}
            />
            <TransferToMetabaseDialog
                open={showTransferToMetabaseDialog}
                onClose={() => setShowTransferToMetabaseDialog(false)}
                sqlText={getUserProfilesSqlTemplate()}
                sourceWebsiteId={selectedWebsite?.id}
            />

            <Modal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                header={{
                    heading: "Brukerdetaljer",
                    closeButton: true,
                }}
                width="medium"
            >
                <Modal.Body>
                    {selectedSession && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4 bg-[var(--ax-bg-neutral-soft)] p-4 rounded-lg">
                                <div className="col-span-2">
                                    <Heading level="3" size="xsmall" className="mb-1 text-gray-500">
                                        {selectedSession.idType === 'cookie' ? 'Cookie ID (Distinct ID)' : 'Sesjons‑ID'}
                                    </Heading>
                                    <code className="text-sm break-all">
                                        {selectedSession.userId || '(mangler cookie-id)'}
                                        {selectedSession.idType === 'cookie' ? ' 🍪' : ''}
                                    </code>
                                </div>
                                {selectedSession.sessionIds && selectedSession.sessionIds.length > 0 && selectedSession.idType === 'cookie' && (
                                    <div className="col-span-2">
                                        <Heading level="3" size="xsmall" className="mb-1 text-gray-500">
                                            Sesjoner knyttet til bruker ({selectedSession.sessionIds.length})
                                        </Heading>
                                        <ul className="space-y-1 list-disc list-inside">
                                            {selectedSession.sessionIds.map((id: string) => (
                                                <li key={id} className="break-all">{id}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {selectedSession.distinctId && selectedSession.idType !== 'cookie' && (
                                    <div className="col-span-2">
                                        <Heading level="3" size="xsmall" className="mb-1 text-gray-500">Distinct ID (Cookie ID)</Heading>
                                        <code className="text-sm break-all">{selectedSession.distinctId}</code>
                                    </div>
                                )}
                                <div>
                                    <Heading level="3" size="xsmall" className="mb-1 text-gray-500">Først sett</Heading>
                                    <div className="flex items-center gap-2">
                                        <Clock size={16} className="text-gray-400" />
                                        <span>{formatDate(selectedSession.firstSeen)}</span>
                                    </div>
                                </div>
                                <div>
                                    <Heading level="3" size="xsmall" className="mb-1 text-gray-500">Sist sett</Heading>
                                    <div className="flex items-center gap-2">
                                        <Clock size={16} className="text-gray-400" />
                                        <span>{formatDate(selectedSession.lastSeen)}</span>
                                    </div>
                                </div>
                                <div>
                                    <Heading level="3" size="xsmall" className="mb-1 text-gray-500">Enhet</Heading>
                                    <div className="flex items-center gap-2">
                                        {getDeviceIcon(selectedSession.device)}
                                        <span>{translateDevice(selectedSession.device)}</span>
                                    </div>
                                </div>
                                <div>
                                    <Heading level="3" size="xsmall" className="mb-1 text-gray-500">Operativsystem</Heading>
                                    <div className="flex items-center gap-2">
                                        <Monitor size={16} className="text-gray-400" />
                                        <span>{selectedSession.os || '-'}</span>
                                    </div>
                                </div>
                                <div>
                                    <Heading level="3" size="xsmall" className="mb-1 text-gray-500">Nettleser</Heading>
                                    <div className="flex items-center gap-2">
                                        <Globe size={16} className="text-gray-400" />
                                        <span>{selectedSession.browser || '-'}</span>
                                    </div>
                                </div>
                                <div>
                                    <Heading level="3" size="xsmall" className="mb-1 text-gray-500">Land</Heading>
                                    <div className="flex items-center gap-2">
                                        <Globe size={16} className="text-gray-400" />
                                        <span>{translateCountry(selectedSession.country ?? '')}</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Heading level="3" size="small" className="mb-4">Aktivitetslogg</Heading>

                                {!activityLoading && activityData.length > 0 && (
                                    <div className="bg-[var(--ax-bg-neutral-soft)] p-4 rounded-lg mb-6 flex flex-wrap gap-8 border border-gray-100">
                                        <div>
                                            <span className="text-[var(--ax-text-default)] block text-sm font-medium mb-1">Sidevisninger</span>
                                            <span className="font-bold text-2xl text-[var(--ax-text-default)]">
                                                {activityData.filter(a => a.type === 'pageview').length}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[var(--ax-text-default)] block text-sm font-medium mb-1">Hendelser</span>
                                            <span className="font-bold text-2xl text-[var(--ax-text-default)]">
                                                {activityData.filter(a => a.type !== 'pageview').length}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[var(--ax-text-default)] block text-sm font-medium mb-1">Totalt</span>
                                            <span className="font-bold text-2xl text-[var(--ax-text-default)]">
                                                {activityData.length}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {activityLoading ? (
                                    <div className="flex justify-center p-4">
                                        <Loader />
                                    </div>
                                ) : (
                                    <div className="relative border-l border-[var(--ax-border-neutral-subtle)] ml-3 space-y-8">
                                        {activityData.map((item, index) => (
                                            <div key={index} className="mb-8 ml-8 relative">
                                                <span className="absolute flex items-center justify-center w-8 h-8 bg-[var(--ax-bg-accent-soft)] rounded-full -left-[41px] ring-4 ring-[var(--ax-bg-default)]">
                                                    {item.type === 'pageview' ? (
                                                        <Monitor size={18} className="text-[var(--ax-text-accent)]" />
                                                    ) : (
                                                        <User size={18} className="text-green-600" />
                                                    )}
                                                </span>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-sm text-gray-500">
                                                        {new Date(item.createdAt).toLocaleTimeString('no-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    <h4 className="text-lg font-medium text-[var(--ax-text-default)]">
                                                        {item.type === 'pageview' ? 'Sidevisning' : item.name}
                                                    </h4>
                                                    <p className="text-base text-[var(--ax-text-default)]">
                                                        {item.title || item.url}
                                                    </p>
                                                    {item.url && (
                                                        <code
                                                            className="text-sm text-blue-600 hover:underline cursor-pointer mt-1 bg-[var(--ax-bg-neutral-soft)] p-1.5 rounded w-fit flex items-center gap-1"
                                                            onClick={() => {
                                                                if (item.url) setSelectedActivityUrl(item.url);
                                                            }}
                                                        >
                                                            {item.url} <ExternalLink className="h-3 w-3" />
                                                        </code>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </Modal.Body>
            </Modal>

            <AnalysisActionModal
                open={!!selectedActivityUrl}
                onClose={() => setSelectedActivityUrl(null)}
                urlPath={selectedActivityUrl}
                websiteId={selectedWebsite?.id}
                period={period}
            />
        </ChartLayout >
    );
};

export default UserProfiles;
