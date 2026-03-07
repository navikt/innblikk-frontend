import { Heading, TextField, Button, Alert, Loader, Tabs, Radio, RadioGroup, Select, UNSAFE_Combobox as Combobox, Modal, ActionMenu, Tooltip } from '@navikt/ds-react';
import { Plus, Trash2, Share2, Check, Code2, ExternalLink, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';
import ChartLayout from '../../analysis/ui/ChartLayout.tsx';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx';
import FunnelChart from '../../analysis/ui/funnel/FunnelChart.tsx';
import HorizontalFunnelChart from '../../analysis/ui/funnel/HorizontalFunnelChart.tsx';
import FunnelStats from '../../analysis/ui/funnel/FunnelStats.tsx';
import { SqlViewer } from '../../chartbuilder';
import AnalysisActionModal from '../../analysis/ui/AnalysisActionModal.tsx';
import { useFunnel } from '../hooks/useFunnel';
import {
    addStep,
    removeStep,
    updateStepValue,
    updateStepType,
    updateStepEventScope,
    addStepParam,
    removeStepParam,
    updateStepParam,
    normalizeStepUrl,
} from '../utils/stepUtils';
import {
    formatDuration,
    downloadCSV,
    copyToClipboard,
    generateMetabaseFunnelSql,
    generateMetabaseTimingSql,
} from '../utils/funnelUtils';

const Funnel = () => {
    const state = useFunnel();

    const {
        selectedWebsite,
        setSelectedWebsite,
        steps,
        setSteps,
        isStepsOpen,
        setIsStepsOpen,
        period,
        setPeriod,
        customStartDate,
        setCustomStartDate,
        customEndDate,
        setCustomEndDate,
        onlyDirectEntry,
        setOnlyDirectEntry,
        funnelData,
        loading,
        error,
        funnelSql,
        funnelQueryStats,
        hasAttemptedFetch,
        timingData,
        timingLoading,
        timingError,
        showTiming,
        timingQueryStats,
        timingSql,
        availableEvents,
        loadingEvents,
        activeTab,
        setActiveTab,
        copySuccess,
        metabaseCopySuccess,
        timingMetabaseCopySuccess,
        modalSql,
        setModalSql,
        selectedTableUrl,
        setSelectedTableUrl,
        selectedTimingUrl,
        setSelectedTimingUrl,
        fetchData,
        fetchTiming,
        copyShareLink,
        setMetabaseCopySuccess,
        setTimingMetabaseCopySuccess,
    } = state;

    const copyMetabaseSql = async () => {
        if (!selectedWebsite) return;
        const sql = generateMetabaseFunnelSql(funnelData, steps, selectedWebsite, onlyDirectEntry);
        if (!sql) return;
        const ok = await copyToClipboard(sql);
        if (ok) {
            setMetabaseCopySuccess(true);
            setTimeout(() => setMetabaseCopySuccess(false), 2000);
        }
    };

    const copyTimingMetabaseSql = async () => {
        if (!selectedWebsite) return;
        const sql = timingSql ?? generateMetabaseTimingSql(timingData, steps, selectedWebsite, onlyDirectEntry);
        if (!sql) return;
        const ok = await copyToClipboard(sql);
        if (ok) {
            setTimingMetabaseCopySuccess(true);
            setTimeout(() => setTimingMetabaseCopySuccess(false), 2000);
        }
    };

    return (
        <ChartLayout
            title="Trakt"
            description="Se hvor folk faller fra i en prosess."
            currentPage="trakt"
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
                        legend="Flyt"
                        value={onlyDirectEntry ? 'strict' : 'loose'}
                        onChange={(val: string) => setOnlyDirectEntry(val === 'strict')}
                    >
                        <div className="flex gap-4">
                            <Radio value="strict">Direkte fra steg til steg</Radio>
                            <Radio value="loose">Tillat andre steg imellom</Radio>
                        </div>
                    </RadioGroup>
                </>
            }
        >
            <div className="flex flex-col xl:flex-row gap-8 items-start relative">
                {/* Left Column: Configuration */}
                {isStepsOpen && (
                    <div className="w-full xl:w-[450px] flex-shrink-0 space-y-6 relative group">
                        <div className="bg-[var(--ax-bg-neutral-soft)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
                            <div className="flex items-center justify-between gap-3 mb-6">
                                <Heading level="2" size="small">Steg i trakten</Heading>
                                <Button
                                    size="small"
                                    variant="tertiary-neutral"
                                    icon={<ChevronLeft size={16} />}
                                    onClick={() => setIsStepsOpen(false)}
                                    className="hidden xl:inline-flex"
                                >
                                    Minimer
                                </Button>
                            </div>

                            <div className="space-y-3">
                                {steps.map((step, index) => (
                                    <div key={index} className="border border-gray-300 rounded-lg p-3 bg-[var(--ax-bg-default)] relative shadow-sm">
                                        <div className="flex items-start gap-3">
                                            {/* Step number badge */}
                                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs mt-1">
                                                {index + 1}
                                            </div>

                                            {/* Step content */}
                                            <div className="flex-grow space-y-3">
                                                {/* Type selector with label */}
                                                <Select
                                                    label={`Stegtype`}
                                                    size="small"
                                                    value={step.type}
                                                    onChange={(e) => setSteps(updateStepType(steps, index, e.target.value as 'url' | 'event'))}
                                                >
                                                    <option value="url">URL-sti</option>
                                                    <option value="event">Hendelse</option>
                                                </Select>

                                                {/* Value input */}
                                                {step.type === 'url' ? (
                                                    <TextField
                                                        label={`URL-sti`}
                                                        value={step.value}
                                                        onChange={(e) => setSteps(updateStepValue(steps, index, e.target.value))}
                                                        onBlur={(e) => e.target.value.trim() && setSteps(updateStepValue(steps, index, normalizeStepUrl(e.target.value)))}
                                                        size="small"
                                                    />
                                                ) : (
                                                    <Combobox
                                                        label={`Hendelse`}
                                                        size="small"
                                                        options={availableEvents.map(e => ({ label: e, value: e }))}
                                                        selectedOptions={step.value ? [step.value] : []}
                                                        onToggleSelected={(option, isSelected) => {
                                                            if (isSelected) {
                                                                setSteps(updateStepValue(steps, index, option));
                                                            } else {
                                                                setSteps(updateStepValue(steps, index, ''));
                                                            }
                                                        }}
                                                        isLoading={loadingEvents}
                                                        shouldAutocomplete
                                                        clearButton
                                                    />
                                                )}

                                                {/* Event scope options */}
                                                {step.type === 'event' && (
                                                    <RadioGroup
                                                        legend="Hendelsens plassering"
                                                        size="small"
                                                        value={step.eventScope || 'current-path'}
                                                        onChange={(val: string) => setSteps(updateStepEventScope(steps, index, val as 'current-path' | 'anywhere'))}
                                                    >
                                                        <Radio value="current-path">På nåværende sti</Radio>
                                                        <Radio value="anywhere">Hvor som helst</Radio>
                                                    </RadioGroup>
                                                )}

                                                {/* Event Parameters (WHERE clause) */}
                                                {step.type === 'event' && (
                                                    <div className="mt-1">
                                                        <div className="text-sm font-semibold mb-2">Filtrer på hendelsesdetaljer</div>
                                                        {step.params && step.params.length > 0 && (
                                                            <div className="space-y-3 mb-3">
                                                                {step.params.map((param, pIndex) => (
                                                                    <div key={pIndex} className="bg-[var(--ax-bg-neutral-soft)] rounded-md p-3 relative group border border-[var(--ax-border-neutral-subtle)]">
                                                                        <Button
                                                                            variant="tertiary-neutral"
                                                                            size="small"
                                                                            icon={<Trash2 size={12} />}
                                                                            onClick={() => setSteps(removeStepParam(steps, index, pIndex))}
                                                                            title="Fjern filter"
                                                                            className="absolute top-2 right-2"
                                                                        />
                                                                        <div className="flex items-end gap-2 pr-8">
                                                                            <div className="flex-1">
                                                                                <TextField
                                                                                    label="Detalj"
                                                                                    size="small"
                                                                                    value={param.key}
                                                                                    onChange={(e) => setSteps(updateStepParam(steps, index, pIndex, 'key', e.target.value))}
                                                                                />
                                                                            </div>
                                                                            <div className="pb-1">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setSteps(updateStepParam(steps, index, pIndex, 'operator', param.operator === 'equals' ? 'contains' : 'equals'))}
                                                                                    className="px-2 py-1.5 text-sm font-mono bg-[var(--ax-bg-default)] border border-gray-300 rounded hover:bg-[var(--ax-bg-neutral-soft)] transition-colors"
                                                                                    title={param.operator === 'equals' ? 'Eksakt match (klikk for inneholder)' : 'Inneholder (klikk for eksakt)'}
                                                                                >
                                                                                    {param.operator === 'equals' ? '=' : '≈'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-2">
                                                                            <TextField
                                                                                label="Verdi"
                                                                                size="small"
                                                                                value={param.value}
                                                                                onChange={(e) => setSteps(updateStepParam(steps, index, pIndex, 'value', e.target.value))}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <Button
                                                            size="small"
                                                            variant="tertiary"
                                                            icon={<Plus size={14} />}
                                                            onClick={() => setSteps(addStepParam(steps, index))}
                                                        >
                                                            Legg til filter
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Delete button */}
                                            {steps.length > 2 && (
                                                <Button
                                                    variant="tertiary-neutral"
                                                    size="small"
                                                    icon={<Trash2 size={16} />}
                                                    onClick={() => setSteps(removeStep(steps, index))}
                                                    aria-label="Fjern steg"
                                                    className="flex-shrink-0 mt-1"
                                                />
                                            )}
                                        </div>

                                        {/* Connector line to next step */}
                                        {
                                            index < steps.length - 1 && (
                                                <div className="absolute left-[23px] top-[40px] w-0.5 h-[calc(100%-10px)] bg-gray-300 -bottom-3 translate-y-full z-0"
                                                    style={{ height: '24px' }} />
                                            )
                                        }
                                    </div>
                                ))}
                                <Button
                                    variant="secondary"
                                    size="small"
                                    icon={<Plus size={20} />}
                                    onClick={() => setSteps(addStep(steps))}
                                    className="w-full mb-6"
                                >
                                    Legg til steg
                                </Button>
                            </div>

                            <Button
                                onClick={fetchData}
                                disabled={!selectedWebsite || loading || steps.filter(s => s.value.trim() !== '').length < 2}
                                loading={loading}
                                className="w-full"
                                style={{ marginTop: '2rem' }}
                            >
                                Lag trakt
                            </Button>
                        </div>
                    </div>
                )}

                {/* Right Column: Results */}
                <div className="flex-1 min-w-0 w-full transition-all duration-300">
                    {!isStepsOpen && (
                        <div className="hidden xl:flex mb-4">
                            <Button
                                size="small"
                                variant="secondary"
                                icon={<ChevronRight size={16} />}
                                onClick={() => setIsStepsOpen(true)}
                            >
                                Vis steg i trakten
                            </Button>
                        </div>
                    )}

                    {error && (
                        <Alert variant="error" className="mb-4">
                            {error}
                        </Alert>
                    )}

                    {
                        loading && (
                            <div className="flex justify-center items-center h-64 border rounded-lg bg-[var(--ax-bg-neutral-soft)] border-dashed border-gray-300">
                                <Loader size="xlarge" title="Beregner trakt..." />
                            </div>
                        )
                    }

                    {
                        !loading && funnelData.length > 0 && (
                            <>
                                <FunnelStats data={funnelData} />
                                <div className="flex justify-between items-center mb-4 mt-8">
                                    <Heading level="2" size="medium">Resultater</Heading>
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        icon={copySuccess ? <Check size={16} /> : <Share2 size={16} />}
                                        onClick={copyShareLink}
                                    >
                                        {copySuccess ? 'Kopiert!' : 'Del analyse'}
                                    </Button>
                                </div>
                                <Tabs value={activeTab} onChange={setActiveTab}>
                                    <Tabs.List>
                                        <Tabs.Tab value="vertical" label="Vertikal trakt" />
                                        <Tabs.Tab value="horizontal" label="Horisontal trakt" />
                                        <Tabs.Tab value="table" label="Tabell" />
                                        <Tabs.Tab value="timing" label="Tidsbruk" />
                                    </Tabs.List>

                                    <Tabs.Panel value="vertical" className="pt-4">
                                        <FunnelChart
                                            data={funnelData}
                                            loading={loading}
                                            websiteId={selectedWebsite?.id}
                                            period={period}
                                        />
                                        <div className="flex gap-2 justify-between items-center mt-4">
                                            {funnelQueryStats && (
                                                <span className="text-sm text-[var(--ax-text-subtle)] mr-auto">
                                                    Data prosessert: {funnelQueryStats.totalBytesProcessedGB} GB
                                                </span>
                                            )}
                                            <Button
                                                size="small"
                                                variant="tertiary"
                                                onClick={copyMetabaseSql}
                                                icon={metabaseCopySuccess ? <Check size={16} /> : <Code2 size={16} />}
                                            >
                                                {metabaseCopySuccess ? 'Kopiert!' : 'Kopier for Metabase'}
                                            </Button>
                                            {funnelSql && (
                                                <Button
                                                    size="small"
                                                    variant="tertiary"
                                                    onClick={() => setModalSql(funnelSql)}
                                                    icon={<Code2 size={16} />}
                                                >
                                                    Vis SQL
                                                </Button>
                                            )}
                                        </div>
                                    </Tabs.Panel>

                                    <Tabs.Panel value="horizontal" className="pt-4">
                                        <HorizontalFunnelChart
                                            data={funnelData}
                                            loading={loading}
                                            websiteId={selectedWebsite?.id}
                                            period={period}
                                        />
                                        <div className="flex gap-2 justify-between items-center mt-4">
                                            {funnelQueryStats && (
                                                <span className="text-sm text-[var(--ax-text-subtle)] mr-auto">
                                                    Data prosessert: {funnelQueryStats.totalBytesProcessedGB} GB
                                                </span>
                                            )}
                                            <Button
                                                size="small"
                                                variant="tertiary"
                                                onClick={copyMetabaseSql}
                                                icon={metabaseCopySuccess ? <Check size={16} /> : <Code2 size={16} />}
                                            >
                                                {metabaseCopySuccess ? 'Kopiert!' : 'Kopier for Metabase'}
                                            </Button>
                                            {funnelSql && (
                                                <Button
                                                    size="small"
                                                    variant="tertiary"
                                                    onClick={() => setModalSql(funnelSql)}
                                                    icon={<Code2 size={16} />}
                                                >
                                                    Vis SQL
                                                </Button>
                                            )}
                                        </div>
                                    </Tabs.Panel>

                                    <Tabs.Panel value="table" className="pt-4">
                                        <div className="space-y-4">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <Heading level="3" size="small">Tabell</Heading>
                                                <div className="flex items-center gap-2">
                                                    <ActionMenu>
                                                        <Tooltip content="Flere valg" placement="top">
                                                            <ActionMenu.Trigger>
                                                                <Button
                                                                    type="button"
                                                                    variant="tertiary"
                                                                    size="xsmall"
                                                                    icon={<MoreVertical aria-hidden />}
                                                                    aria-label="Flere valg for tabell"
                                                                />
                                                            </ActionMenu.Trigger>
                                                        </Tooltip>
                                                        <ActionMenu.Content align="end">
                                                            <ActionMenu.Item onClick={() => downloadCSV(funnelData, selectedWebsite?.name)}>
                                                                Last ned CSV
                                                            </ActionMenu.Item>
                                                            <ActionMenu.Item onClick={copyMetabaseSql}>
                                                                {metabaseCopySuccess ? 'Kopiert!' : 'Kopier for Metabase'}
                                                            </ActionMenu.Item>
                                                            {funnelSql && (
                                                                <ActionMenu.Item onClick={() => setModalSql(funnelSql)}>
                                                                    Vis SQL
                                                                </ActionMenu.Item>
                                                            )}
                                                            {funnelQueryStats && (
                                                                <>
                                                                    <ActionMenu.Divider />
                                                                    <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                                                                        {funnelQueryStats.totalBytesProcessedGB} GB prosessert
                                                                    </div>
                                                                </>
                                                            )}
                                                        </ActionMenu.Content>
                                                    </ActionMenu>
                                                </div>
                                            </div>
                                        <div className="border rounded-lg overflow-hidden">
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
                                                    <thead className="bg-[var(--ax-bg-neutral-soft)]">
                                                        <tr>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Steg</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">URL</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Antall</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Gikk videre</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Falt fra</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
                                                        {funnelData.map((item, index) => {
                                                            const nextItem = funnelData[index + 1];
                                                            const percentageOfNext = nextItem && item.count > 0 ? Math.round((nextItem.count / item.count) * 100) : null;
                                                            const dropoffCount = nextItem ? item.count - nextItem.count : null;
                                                            const dropoffPercentage = percentageOfNext !== null ? 100 - percentageOfNext : null;

                                                            return (
                                                                <tr key={index} className="hover:bg-[var(--ax-bg-neutral-soft)]">
                                                                    <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-[var(--ax-text-default)]">
                                                                        Steg {item.step + 1}
                                                                    </td>
                                                                    <td className="px-6 py-4 text-base break-all">
                                                                        {(() => {
                                                                            const step = steps[index];
                                                                            if (step?.type === 'event') {
                                                                                const lenketekst = step.params?.find(p => p.key.toLowerCase() === 'lenketekst')?.value;
                                                                                const destinasjon = step.params?.find(p => p.key === 'destinasjon' || p.key === 'url')?.value;
                                                                                const tekst = step.params?.find(p => p.key.toLowerCase() === 'tekst')?.value;

                                                                                return (
                                                                                    <div className="flex flex-col gap-1">
                                                                                        <div className="font-semibold text-[var(--ax-text-default)]">{step.value}</div>
                                                                                        {(lenketekst || tekst) && (
                                                                                            <div className="text-sm font-medium text-[var(--ax-text-default)]">
                                                                                                {lenketekst || tekst}
                                                                                            </div>
                                                                                        )}
                                                                                        {destinasjon && (
                                                                                            <div className="text-xs text-gray-500 break-all bg-[var(--ax-bg-neutral-soft)] px-1 py-0.5 rounded border border-gray-100 italic">
                                                                                                {destinasjon}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            }

                                                                            if (item.url && selectedWebsite) {
                                                                                return (
                                                                                    <span
                                                                                        className="text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                                                                                        onClick={() => setSelectedTableUrl(item.url)}
                                                                                    >
                                                                                        {item.url} <ExternalLink className="h-4 w-4" />
                                                                                    </span>
                                                                                );
                                                                            }
                                                                            return <span className="text-gray-500">{item.url}</span>;
                                                                        })()}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-base text-[var(--ax-text-default)] font-bold">
                                                                        {item.count.toLocaleString('nb-NO')}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-base">
                                                                        {percentageOfNext !== null ? (
                                                                            <span className="text-green-700 font-medium">{percentageOfNext}%</span>
                                                                        ) : (
                                                                            <span className="text-[var(--ax-text-subtle)] font-medium">Fullført ✓</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-base">
                                                                        {dropoffCount !== null && dropoffCount > 0 ? (
                                                                            <span className="text-red-700 font-medium">
                                                                                {dropoffPercentage}% <span className="font-normal">(-{dropoffCount.toLocaleString('nb-NO')})</span>
                                                                            </span>
                                                                        ) : '-'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        </div>

                                        <AnalysisActionModal
                                            open={!!selectedTableUrl}
                                            onClose={() => setSelectedTableUrl(null)}
                                            urlPath={selectedTableUrl}
                                            websiteId={selectedWebsite?.id}
                                            period={period}
                                        />
                                    </Tabs.Panel>

                                    {/* Timing Data Tab */}
                                    <Tabs.Panel value="timing" className="pt-4">
                                        <>
                                            <div className="mb-6 flex items-center justify-between gap-2">
                                                <Heading level="3" size="small">
                                                    Tid per steg og for hele trakten
                                                </Heading>
                                                {showTiming && (
                                                    <ActionMenu>
                                                        <Tooltip content="Flere valg" placement="top">
                                                            <ActionMenu.Trigger>
                                                                <Button
                                                                    type="button"
                                                                    variant="tertiary"
                                                                    size="xsmall"
                                                                    icon={<MoreVertical aria-hidden />}
                                                                    aria-label="Flere valg for tidsbruk"
                                                                />
                                                            </ActionMenu.Trigger>
                                                        </Tooltip>
                                                        <ActionMenu.Content align="end">
                                                            <ActionMenu.Item onClick={copyTimingMetabaseSql}>
                                                                {timingMetabaseCopySuccess ? 'Kopiert!' : 'Kopier for Metabase'}
                                                            </ActionMenu.Item>
                                                            {timingSql && (
                                                                <ActionMenu.Item onClick={() => setModalSql(timingSql)}>
                                                                    Vis SQL
                                                                </ActionMenu.Item>
                                                            )}
                                                            {timingQueryStats && (
                                                                <>
                                                                    <ActionMenu.Divider />
                                                                    <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                                                                        {timingQueryStats.totalBytesProcessedGB} GB prosessert
                                                                    </div>
                                                                </>
                                                            )}
                                                        </ActionMenu.Content>
                                                    </ActionMenu>
                                                )}
                                            </div>

                                            {!showTiming && (
                                                <div className="space-y-2">
                                                    <Button
                                                        variant="secondary"
                                                        onClick={fetchTiming}
                                                        loading={timingLoading}
                                                        disabled={timingLoading}
                                                    >
                                                        Beregn tidsbruk
                                                    </Button>
                                                    <p className="text-sm text-gray-500">
                                                        Kan ta opptil 30 sekunder.
                                                    </p>
                                                </div>
                                            )}

                                            {timingError && (
                                                <Alert variant="error" className="mb-4">
                                                    {timingError}
                                                </Alert>
                                            )}

                                            {showTiming && !timingError && timingData.length === 0 && (
                                                <Alert variant="info" className="mb-4">
                                                    Fant ingen tidsdata for disse stegene i valgt periode.
                                                </Alert>
                                            )}

                                            {showTiming && !timingError && timingData.length > 0 && (() => {
                                                const totalTiming = timingData.find(t => t.fromStep === -1);
                                                const stepsTiming = timingData.filter(t => t.fromStep !== -1);

                                                return (
                                                    <>
                                                        {totalTiming && (
                                                            <div className="mt-2 grid grid-cols-2 gap-4 mb-6">
                                                                <div className="border rounded-lg p-4 bg-[var(--ax-bg-neutral-soft)] border-[var(--ax-border-neutral-subtle)]">
                                                                    <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Total tid (Gjennomsnitt)</div>
                                                                    <div className="text-2xl font-bold text-[var(--ax-text-default)]">{formatDuration(totalTiming.avgSeconds)}</div>
                                                                    <div className="text-xs text-[var(--ax-text-subtle)] mt-1">Gjennomsnittlig tid fra første til siste steg.</div>
                                                                </div>
                                                                <div className="border rounded-lg p-4 bg-[var(--ax-bg-neutral-soft)] border-[var(--ax-border-neutral-subtle)]">
                                                                    <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Total tid (Median)</div>
                                                                    <div className="text-2xl font-bold text-[var(--ax-text-default)]">{formatDuration(totalTiming.medianSeconds)}</div>
                                                                    <div className="text-xs text-[var(--ax-text-subtle)] mt-1">Median tid fra første til siste steg.</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="border rounded-lg overflow-hidden mb-3">
                                                            <div className="overflow-x-auto">
                                                                <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
                                                                    <thead className="bg-[var(--ax-bg-neutral-soft)]">
                                                                        <tr>
                                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Fra steg</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Til steg</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Gjennomsnitt</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Median</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
                                                                        {stepsTiming.map((timing, index) => (
                                                                            <tr key={index} className="hover:bg-[var(--ax-bg-neutral-soft)]">
                                                                                <td className="px-6 py-4 text-base text-[var(--ax-text-default)]">
                                                                                    <div className="flex flex-col gap-0.5">
                                                                                        <span className="font-medium">Steg {timing.fromStep + 1}</span>
                                                                                        {steps[timing.fromStep]?.type === 'url' && timing.fromUrl && selectedWebsite ? (
                                                                                            <span
                                                                                                className="text-base text-blue-600 hover:underline cursor-pointer break-all flex items-center gap-1"
                                                                                                onClick={() => setSelectedTimingUrl(timing.fromUrl || null)}
                                                                                            >
                                                                                                {timing.fromUrl} <ExternalLink className="h-4 w-4 flex-shrink-0" />
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-base text-[var(--ax-text-default)] break-all">{timing.fromUrl}</span>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-6 py-4 text-base text-[var(--ax-text-default)]">
                                                                                    <div className="flex flex-col gap-0.5">
                                                                                        <span className="font-medium">Steg {timing.toStep + 1}</span>
                                                                                        {steps[timing.toStep]?.type === 'url' && timing.toUrl && selectedWebsite ? (
                                                                                            <span
                                                                                                className="text-base text-blue-600 hover:underline cursor-pointer break-all flex items-center gap-1"
                                                                                                onClick={() => setSelectedTimingUrl(timing.toUrl || null)}
                                                                                            >
                                                                                                {timing.toUrl} <ExternalLink className="h-4 w-4 flex-shrink-0" />
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-base text-[var(--ax-text-default)] break-all">{timing.toUrl}</span>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-6 py-4 text-lg font-bold text-blue-700">
                                                                                    {formatDuration(timing.avgSeconds)}
                                                                                </td>
                                                                                <td className="px-6 py-4 text-lg font-bold text-green-700">
                                                                                    {formatDuration(timing.medianSeconds)}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}

                                            <AnalysisActionModal
                                                open={!!selectedTimingUrl}
                                                onClose={() => setSelectedTimingUrl(null)}
                                                urlPath={selectedTimingUrl}
                                                websiteId={selectedWebsite?.id}
                                                period={period}
                                            />
                                        </>
                                    </Tabs.Panel>
                                </Tabs>
                            </>
                        )
                    }

                    {
                        !loading && !error && funnelData.length === 0 && hasAttemptedFetch && (
                            <div className="text-center p-8 text-gray-500 bg-[var(--ax-bg-neutral-soft)] rounded-lg border border-[var(--ax-border-neutral-subtle)] mt-4">
                                Ingen data funnet for denne trakten i valgt periode.
                            </div>
                        )
                    }

                    <Modal
                        open={!!modalSql}
                        onClose={() => setModalSql(null)}
                        header={{ heading: 'SQL-spørring' }}
                        width={800}
                    >
                        <Modal.Body>
                            {modalSql && <SqlViewer sql={modalSql} withoutReadMore showEditButton />}
                        </Modal.Body>
                    </Modal>
                </div>
            </div>
        </ChartLayout >
    );
};

export default Funnel;
