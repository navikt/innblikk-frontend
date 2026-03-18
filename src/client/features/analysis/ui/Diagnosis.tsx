import { Alert, Loader, Radio, RadioGroup, Table, Heading, Tooltip, Tabs, Button } from '@navikt/ds-react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';
import { LineChart } from '@fluentui/react-charting';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import ChartLayout from './ChartLayoutOriginal.tsx';
import WebsitePicker from './WebsitePicker.tsx';
import PeriodPicker from './PeriodPicker.tsx';
import { useDiagnosis } from '../hooks/useDiagnosis.ts';
import { getEnvironmentTitle } from '../utils/diagnosis.ts';

const Diagnosis = () => {
    const {
        period, setPeriod,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        environment, setEnvironment,
        activeTab, setActiveTab,
        sort, handleSort,
        selectedWebsiteFilter, setSelectedWebsiteFilter,
        data, loading, error, queryStats,
        sortedData, totalWebsites, activeWebsites, inactiveWebsites,
        highlightedWebsite,
        selectedWebsite, historyLoading, absoluteLastEvent,
        isModalOpen, setIsModalOpen,
        historyQueryStats, chartData, handleExplore, fetchData,
    } = useDiagnosis();

    return (
        <ChartLayout
            title="Diagnoseverktøy"
            description="Oversikt over aktivitet på alle nettsteder og apper."
            currentPage="diagnose"
            filters={
                <>
                    <WebsitePicker
                        selectedWebsite={selectedWebsiteFilter}
                        onWebsiteChange={setSelectedWebsiteFilter}
                        variant="minimal"
                    />

                    <PeriodPicker
                        period={period}
                        onPeriodChange={setPeriod}
                        startDate={customStartDate}
                        onStartDateChange={setCustomStartDate}
                        endDate={customEndDate}
                        onEndDateChange={setCustomEndDate}
                    />

                    <RadioGroup
                        size="small"
                        legend="Miljø"
                        value={environment}
                        onChange={(val: string) => setEnvironment(val)}
                    >
                        <div className="flex gap-4">
                            <Radio value="all">Alle miljø</Radio>
                            <Radio value="prod">Prod-miljø</Radio>
                            <Radio value="dev">Dev-miljø</Radio>
                        </div>
                    </RadioGroup>
                    <div className="flex items-end pb-[2px] mt-8">
                        <Button onClick={() => void fetchData()} disabled={loading} loading={loading} size="small">
                            {selectedWebsiteFilter ? 'Kjør diagnose' : 'Søk i alle nettsteder'}
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
                <div className="flex flex-col justify-center items-center h-full gap-4">
                    <Loader size="xlarge" title="Henter diagnose..." />
                    <div className="text-center text-[var(--ax-text-subtle)]">
                        <p className="font-medium">Dette kan ta noen sekunder</p>
                        <p className="text-sm">Vi analyserer alle data i valgt periode</p>
                    </div>
                </div>
            )}

            {!loading && data && (
                <div className="flex flex-col gap-6">
                    {/* Highlighted Website Section */}
                    {highlightedWebsite && (
                        <div className="flex flex-col gap-4 mb-3">
                            <Heading level="2" size="medium">Valgt nettsted eller app</Heading>
                            <div className="bg-[var(--ax-bg-default)] border border-gray-300 rounded-lg p-5 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <Heading level="3" size="medium">{highlightedWebsite.website_name || highlightedWebsite.website_id}</Heading>
                                    {highlightedWebsite.last_event_at ? (
                                        <Tooltip content="Aktiv i perioden">
                                            <CheckCircle size={20} className="text-green-500" />
                                        </Tooltip>
                                    ) : (
                                        <Tooltip content="Ingen aktivitet registrert i perioden">
                                            <><AlertTriangle size={20} className="text-yellow-500" /> (trenger tilsyn)</>
                                        </Tooltip>
                                    )}
                                </div>
                                {highlightedWebsite.domain && (
                                    <div className="text-sm text-gray-500 -mt-2 mb-4">{highlightedWebsite.domain}</div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                                    <div className="p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
                                        <div className="text-sm text-gray-500 mb-1 font-medium">Sidevisninger</div>
                                        <div className="text-2xl font-bold">{highlightedWebsite.pageviews.toLocaleString('no-NO')}</div>
                                    </div>
                                    <div className="p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
                                        <div className="text-sm text-gray-500 mb-1 font-medium">Egendefinerte</div>
                                        <div className="text-2xl font-bold">{highlightedWebsite.custom_events.toLocaleString('no-NO')}</div>
                                    </div>
                                    <div className="p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
                                        <div className="text-sm text-gray-500 mb-1 font-medium">Siste aktivitet</div>
                                        <div className="text-xl font-semibold">
                                            {highlightedWebsite.last_event_at
                                                ? format(new Date(highlightedWebsite.last_event_at), 'd. MMM yyyy', { locale: nb })
                                                : <span className="text-red-600">Ingen for valgt periode</span>
                                            }
                                        </div>
                                    </div>
                                </div>
                                {!highlightedWebsite.last_event_at ? (
                                    <button
                                        onClick={() => handleExplore(highlightedWebsite)}
                                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-md font-medium transition-colors shadow-sm"
                                    >
                                        Kjør diagnose
                                    </button>
                                ) : (
                                    <></>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <Heading level="2" size="medium">Resultater for {getEnvironmentTitle(environment)}</Heading>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                            <div className="text-sm text-gray-500 font-medium">Totalt antall nettsteder</div>
                            <div className="text-2xl font-bold mt-1">{totalWebsites}</div>
                        </div>
                        <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                            <div className="text-sm text-gray-500 font-medium">Active i perioden</div>
                            <div className="text-2xl font-bold mt-1 text-green-600">{activeWebsites}</div>
                        </div>
                        <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                            <div className="text-sm text-gray-500 font-medium">Ingen aktivitet i perioden</div>
                            <div className="text-2xl font-bold mt-1 text-red-600">{inactiveWebsites}</div>
                        </div>
                    </div>

                    <div className="bg-[var(--ax-bg-default)] rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-[var(--ax-border-neutral-subtle)]">
                            <Tabs value={activeTab} onChange={setActiveTab}>
                                <Tabs.List>
                                    <Tabs.Tab value="all" label="Alle" />
                                    <Tabs.Tab value="attention" label="Trenger tilsyn" icon={<AlertTriangle size={16} className="text-yellow-500" />} />
                                </Tabs.List>
                            </Tabs>
                        </div>

                        <div className="overflow-x-auto">
                            <Table sort={sort} onSortChange={handleSort}>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell>Status</Table.HeaderCell>
                                        <Table.HeaderCell>Nettsted</Table.HeaderCell>
                                        <Table.HeaderCell onClick={() => handleSort('pageviews')} align="right" className="cursor-pointer hover:bg-[var(--ax-bg-neutral-soft)]">
                                            Sidevisninger
                                        </Table.HeaderCell>
                                        <Table.HeaderCell onClick={() => handleSort('custom_events')} align="right" className="cursor-pointer hover:bg-[var(--ax-bg-neutral-soft)]">
                                            Egendefinerte
                                        </Table.HeaderCell>
                                        <Table.HeaderCell onClick={() => handleSort('total')} align="right" className="cursor-pointer hover:bg-[var(--ax-bg-neutral-soft)]">
                                            Totalt
                                        </Table.HeaderCell>
                                        {activeTab !== 'attention' && (
                                            <Table.HeaderCell onClick={() => handleSort('last_event_at')} align="right" className="cursor-pointer hover:bg-[var(--ax-bg-neutral-soft)]">
                                                Siste aktivitet
                                            </Table.HeaderCell>
                                        )}
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {sortedData.map((row) => (
                                        <Table.Row key={row.website_id}>
                                            <Table.DataCell>
                                                {row.last_event_at ? (
                                                    <Tooltip content="Aktiv i perioden">
                                                        <CheckCircle size={20} className="text-green-500" />
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip content="Ingen aktivitet registrert i perioden">
                                                        <AlertTriangle size={20} className="text-yellow-500" />
                                                    </Tooltip>
                                                )}
                                            </Table.DataCell>
                                            <Table.DataCell className="font-medium">
                                                <button
                                                    onClick={() => handleExplore(row)}
                                                    className="text-blue-600 hover:underline text-left"
                                                >
                                                    {row.website_name || row.website_id}
                                                </button>
                                                {row.domain && <div className="text-xs text-gray-500">{row.domain}</div>}
                                            </Table.DataCell>
                                            <Table.DataCell align="right">
                                                {row.pageviews.toLocaleString('no-NO')}
                                            </Table.DataCell>
                                            <Table.DataCell align="right">
                                                {row.custom_events.toLocaleString('no-NO')}
                                            </Table.DataCell>
                                            <Table.DataCell align="right" className="font-semibold">
                                                {(row.pageviews + row.custom_events).toLocaleString('no-NO')}
                                            </Table.DataCell>
                                            {activeTab !== 'attention' && (
                                                <Table.DataCell align="right" className="whitespace-nowrap">
                                                    {row.last_event_at
                                                        ? format(new Date(row.last_event_at), 'd. MMM yyyy HH:mm', { locale: nb })
                                                        : <span className="text-gray-400">-</span>
                                                    }
                                                </Table.DataCell>
                                            )}
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table>
                        </div>
                        {queryStats && (
                            <div className="p-4 border-t border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] text-xs text-gray-500 text-right">
                                Data prosessert: {queryStats.totalBytesProcessedGB} GB
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div
                    className="fixed inset-0 flex items-center justify-center p-4"
                    style={{
                        zIndex: 9999,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0
                    }}
                    onClick={() => setIsModalOpen(false)}
                >
                    <div
                        className="bg-[var(--ax-bg-default)] rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-[var(--ax-bg-default)] border-b border-[var(--ax-border-neutral-subtle)] px-6 py-4 flex justify-between items-center">
                            <Heading level="2" size="medium">
                                {selectedWebsite?.website_name || 'Nettstedsanalyse'}
                            </Heading>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-[var(--ax-text-subtle)] transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="px-6 py-6">
                            {historyLoading ? (
                                <div className="flex justify-center p-8">
                                    <Loader size="large" />
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-[var(--ax-bg-neutral-soft)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
                                        <Heading level="3" size="xsmall" className="mb-1 text-[var(--ax-text-subtle)]">
                                            Siste registrerte aktivitet
                                        </Heading>
                                        <div className="text-xl font-bold">
                                            {absoluteLastEvent
                                                ? format(new Date(absoluteLastEvent), 'd. MMMM yyyy HH:mm', { locale: nb })
                                                : 'Aldri registrert aktivitet'
                                            }
                                        </div>
                                    </div>

                                    <div>
                                        <Heading level="3" size="small" className="mb-4">
                                            Aktivitet siste 6 måneder
                                        </Heading>
                                        <div className="h-64 w-full">
                                            {chartData ? (
                                                <LineChart
                                                    data={chartData.data}
                                                    legendsOverflowText={'Overflow Items'}
                                                    yAxisTickFormat={(d: number | string) => Number(d).toLocaleString('nb-NO')}
                                                    yAxisTickCount={5}
                                                    allowMultipleShapesForPoints={false}
                                                    enablePerfOptimization={true}
                                                    margins={{ left: 35, right: 20, top: 20, bottom: 35 }}
                                                    legendProps={{
                                                        allowFocusOnLegends: true,
                                                        styles: {
                                                            text: { color: 'var(--ax-text-default)' },
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-500">
                                                    Ingen data funnet for siste 6 måneder
                                                </div>
                                            )}
                                        </div>
                                        {historyQueryStats && (
                                            <div className="text-sm text-[var(--ax-text-subtle)] text-right mt-2">
                                                Data prosessert: {historyQueryStats.totalBytesProcessedGB} GB
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </ChartLayout>
    );
};

export default Diagnosis;
