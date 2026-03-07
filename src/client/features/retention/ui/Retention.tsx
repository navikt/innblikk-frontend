import { useState } from 'react';
import { ActionMenu, Button, Alert, Loader, Switch, Heading, BodyShort, Tooltip } from '@navikt/ds-react';
import { ResponsiveContainer, LineChart } from '@fluentui/react-charting';
import { Share2, Check, MoreVertical } from 'lucide-react';
import ChartLayout from '../../analysis/ui/ChartLayout.tsx';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx';
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx';
import CookieMixNotice from '../../analysis/ui/CookieMixNotice.tsx';
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx';
import TransferToMetabaseDialog from '../../../shared/ui/TransferToMetabaseDialog.tsx';
import { openSqlEditorWithContext } from '../../../shared/lib/openSqlEditor.ts';
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx';
import RetentionStatsCards from './RetentionStatsCards.tsx';
import { useRetention } from '../hooks/useRetention';
import { getRetentionSqlTemplate } from '../utils/retentionDashboardSql.ts';

const Retention = () => {
    const {
        selectedWebsite,
        setSelectedWebsite,
        usesCookies,
        urlPath,
        setUrlPath,
        pathOperator,
        setPathOperator,
        period,
        setPeriod,
        customStartDate,
        setCustomStartDate,
        customEndDate,
        setCustomEndDate,
        retentionData,
        chartData,
        retentionStats,
        queryStats,
        loading,
        error,
        hasAttemptedFetch,
        copySuccess,
        hasUnappliedFilterChanges,
        cookieBadge,
        isPreCookieRange,
        cookieStartDate,
        overriddenGlobalPeriod,
        isCurrentMonthData,
        fetchData,
        downloadCSV,
        copyShareLink,
    } = useRetention();
    const [showTableSection, setShowTableSection] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);
    const [showTransferToMetabaseDialog, setShowTransferToMetabaseDialog] = useState(false);

    return (
        <ChartLayout
            title="Gjenbesøk"
            description="Se hvor mange som kommer tilbake etter sitt første besøk."
            currentPage="brukerlojalitet"
            websiteDomain={selectedWebsite?.domain}
            websiteName={selectedWebsite?.name}
            sidebarContent={
                <WebsitePicker
                    selectedWebsite={selectedWebsite}
                    onWebsiteChange={setSelectedWebsite}
                />
            }
            filters={
                <>
                    <div className="w-full sm:w-[300px]">
                        <UrlPathFilter
                            urlPaths={urlPath ? [urlPath] : []}
                            onUrlPathsChange={(paths) => setUrlPath(paths[0] || '')}
                            pathOperator={pathOperator}
                            onPathOperatorChange={setPathOperator}
                            selectedWebsiteDomain={selectedWebsite?.domain}
                            label="URL"
                        />
                    </div>

                    <PeriodPicker
                        period={period}
                        onPeriodChange={setPeriod}
                        startDate={customStartDate}
                        onStartDateChange={setCustomStartDate}
                        endDate={customEndDate}
                        onEndDateChange={setCustomEndDate}
                        showShortPeriods={usesCookies}
                    />

                    <div className="flex items-end pb-[2px]">
                        <Button
                            onClick={fetchData}
                            size="small"
                            disabled={!selectedWebsite || loading || !hasUnappliedFilterChanges}
                            loading={loading}
                        >
                            Vis
                        </Button>
                    </div>
                </>
            }
        >
            {error && (
                <Alert variant="error" className="mb-4">
                    {error}
                </Alert>
            )}

            {loading && (
                <div className="flex justify-center items-center h-full">
                    <Loader size="xlarge" title="Beregner brukerlojalitet..." />
                </div>
            )}

            {!loading && retentionData.length > 0 && (
                <>
                    {(cookieBadge === 'mix' || isPreCookieRange) && (
                        <CookieMixNotice
                            websiteName={selectedWebsite?.name}
                            cookieStartDate={cookieStartDate}
                            variant={isPreCookieRange ? 'pre' : 'mix'}
                        />
                    )}

                    {overriddenGlobalPeriod && !usesCookies && (
                        <Alert variant="info" className="mb-4">
                            <Heading spacing size="small" level="3">
                                Viser data for forrige måned
                            </Heading>
                            <BodyShort spacing>
                                Med Umami får brukere ny anonym ID ved starten av hver måned.
                                For å måle lojalitet korrekt må vi derfor holde oss innenfor én kalendermåned.
                                Vi viser deg tallene for <strong>forrige måned</strong> som sikrer best datakvalitet.
                            </BodyShort>
                        </Alert>
                    )}

                    {isCurrentMonthData && hasAttemptedFetch && retentionData.length > 0 && !usesCookies && (
                        <Alert variant="warning" className="mb-4">
                            <Heading spacing size="small" level="3">
                                Ufullstendige data for inneværende måned
                            </Heading>
                            <BodyShort spacing>
                                Med Umami får brukere ny anonym ID ved starten av hver måned.
                                Det gjør at tall for inneværende måned kan være ufullstendige.
                                For mest pålitelige tall anbefales det å se på en fullført måned.
                            </BodyShort>
                            <Button
                                size="small"
                                variant="secondary"
                                onClick={() => setPeriod('last_month')}
                                className="mt-2"
                            >
                                Bytt til forrige måned
                            </Button>
                        </Alert>
                    )}

                    {retentionStats && <RetentionStatsCards stats={retentionStats} />}

                    <div className="pt-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <Heading level="3" size="small">Gjenbesøk over tid</Heading>
                            <ActionMenu>
                                <Tooltip content="Flere valg" placement="top">
                                    <ActionMenu.Trigger>
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            size="xsmall"
                                            icon={<MoreVertical aria-hidden />}
                                            aria-label="Flere valg for gjenbesøksgraf"
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
                                    <ActionMenu.Item onClick={() => openSqlEditorWithContext({ sql: getRetentionSqlTemplate(), websiteId: selectedWebsite?.id })}>
                                        Åpne i SQL-editor
                                    </ActionMenu.Item>
                                    <ActionMenu.Item onClick={downloadCSV}>
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
                        </div>
                        <div style={{ width: '100%', height: '500px' }}>
                            {chartData && (
                                <ResponsiveContainer>
                                    <LineChart
                                        data={chartData.data}
                                        legendsOverflowText={'Overflow Items'}
                                        yAxisTickFormat={(d: number | string) => `${Number(d)}% `}
                                        legendProps={{
                                            allowFocusOnLegends: true,
                                            styles: {
                                                text: { color: 'var(--ax-text-default)' },
                                            }
                                        }}
                                    />
                                </ResponsiveContainer>
                            )}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <Switch
                                checked={showTableSection}
                                onChange={(e) => setShowTableSection(e.target.checked)}
                                size="small"
                            >
                                Vis som tabell
                            </Switch>
                        </div>
                    </div>

                    {showTableSection && (
                        <div className="pt-4">
                            <div className="border border-[var(--ax-border-neutral-subtle)] rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
                                <div className="p-4 pb-2">
                                    <TableSectionHeader title="Tabell" />
                                </div>
                                <div className="overflow-x-auto px-4">
                                    <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
                                        <thead className="bg-[var(--ax-bg-neutral-soft)]">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Dag</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Antall brukere</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Prosent</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
                                            {retentionData.map((item, index) => (
                                                <tr key={index} className="hover:bg-[var(--ax-bg-neutral-soft]">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--ax-text-default)]">
                                                        Dag {item.day}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                                                        {item.returning_users.toLocaleString('nb-NO')}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                                                        {item.percentage}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-4 pb-4" aria-hidden="true" />
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end mt-8">
                        <Button
                            size="small"
                            variant="secondary"
                            icon={copySuccess ? <Check size={16} /> : <Share2 size={16} />}
                            onClick={copyShareLink}
                        >
                            {copySuccess ? 'Kopiert!' : 'Del analyse'}
                        </Button>
                    </div>
                    <AddToDashboardDialog
                        open={showAddToDashboardDialog}
                        onClose={() => setShowAddToDashboardDialog(false)}
                        graphName="Gjenbesøk over tid"
                        sqlText={getRetentionSqlTemplate()}
                        graphType="LINE"
                        sourceWebsiteId={selectedWebsite?.id}
                    />
                    <TransferToMetabaseDialog
                        open={showTransferToMetabaseDialog}
                        onClose={() => setShowTransferToMetabaseDialog(false)}
                        sqlText={getRetentionSqlTemplate()}
                        sourceWebsiteId={selectedWebsite?.id}
                    />
                </>
            )}

            {!loading && !error && retentionData.length === 0 && hasAttemptedFetch && (
                <div className="text-center p-8 text-gray-500 bg-[var(--ax-bg-neutral-soft)] rounded-lg border border-[var(--ax-border-neutral-subtle)] mt-4">
                    Ingen data funnet for valgt periode.
                </div>
            )}
        </ChartLayout>
    );
};

export default Retention;
