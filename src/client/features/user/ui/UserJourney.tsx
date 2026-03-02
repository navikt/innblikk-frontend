import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Loader,
  ReadMore,
  Select,
  Tabs,
  TextField,
} from "@navikt/ds-react";
import {
  ResponsiveContainer,
  SankeyChart,
} from "@fluentui/react-charting";
import { Download, Minimize2, ExternalLink } from "lucide-react";
import ChartLayout from "../../analysis/ui/ChartLayout.tsx";
import WebsitePicker from "../../analysis/ui/WebsitePicker.tsx";
import PeriodPicker from "../../analysis/ui/PeriodPicker.tsx";
import UmamiJourneyView from "../../analysis/ui/journey/UmamiJourneyView.tsx";
import AnalysisActionModal from "../../analysis/ui/AnalysisActionModal.tsx";
import type { Website } from "../../../shared/types/chart.ts";
import { normalizeUrlToPath } from "../../../shared/lib/utils.ts";
import type { JourneyLink } from "../model";
import { useUrlState, useJourneyData } from "../hooks";
import {
  buildAppliedFilterKey,
  downloadJourneyCSV,
  downloadJourneyExcel,
  copyShareLink,
} from "../utils";

const UserJourney = () => {
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);

  // Use custom hooks for URL state management
  const urlState = useUrlState();
  const {
    startUrl,
    setStartUrl,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    steps,
    setSteps,
    limit,
    setLimit,
    limitInput,
    setLimitInput,
    journeyDirection,
    setJourneyDirection,
    searchParams,
  } = urlState;

  // Use custom hook for journey data fetching
  const journeyData = useJourneyData(
    selectedWebsite,
    period,
    customStartDate,
    customEndDate,
    limit,
    journeyDirection
  );
  const {
    data,
    rawData,
    loading,
    isUpdating,
    error,
    queryStats,
    lastAppliedFilterKey,
    reverseVisualOrder,
    fetchData,
  } = journeyData;

  // UI state
  const [activeTab, setActiveTab] = useState<string>("steps");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState<boolean>(false);
  const [selectedTableUrl, setSelectedTableUrl] = useState<string | null>(null);
  const sankeyContainerRef = useRef<HTMLDivElement | null>(null);

  const hasUnappliedFilterChanges = lastAppliedFilterKey
    ? buildAppliedFilterKey(
        selectedWebsite?.id,
        normalizeUrlToPath(startUrl) || "",
        period,
        customStartDate,
        customEndDate,
        steps,
        limit,
        journeyDirection
      ) !== lastAppliedFilterKey
    : true;

  const handleSearch = () => {
    void fetchData(startUrl, steps);
  };

  // Auto-submit when URL parameters are present (for shared links)
  useEffect(() => {
    const hasConfigParams =
      searchParams.has("period") ||
      searchParams.has("urlPath") ||
      searchParams.has("startUrl") ||
      searchParams.has("steps") ||
      searchParams.has("limit") ||
      searchParams.has("direction");
    if (selectedWebsite && hasConfigParams && !hasAutoSubmitted && !loading) {
      setHasAutoSubmitted(true);
      void fetchData(startUrl, steps);
    }
  }, [selectedWebsite, searchParams, hasAutoSubmitted, loading, fetchData, startUrl, steps]);

  const handleCopyShareLink = async () => {
    const success = await copyShareLink();
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleDownloadCSV = () => {
    downloadJourneyCSV(rawData, selectedWebsite?.name || "data", journeyDirection);
  };

  const handleDownloadExcel = () => {
    downloadJourneyExcel(rawData, selectedWebsite?.name || "data", journeyDirection);
  };


  const handleLoadMore = (increment: number) => {
    const newSteps = steps + increment;
    setSteps(newSteps);
    void fetchData(startUrl, newSteps, true);
  };

  return (
    <ChartLayout
      title="Navigasjonsflyt"
      description="Se hvilke veier folk tar på nettsiden."
      currentPage="brukerreiser"
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
            <TextField
              size="small"
              label="URL"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              onBlur={(e) => setStartUrl(normalizeUrlToPath(e.target.value))}
            />
          </div>

          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            startDate={customStartDate}
            onStartDateChange={setCustomStartDate}
            endDate={customEndDate}
            onEndDateChange={setCustomEndDate}
          />

          <div className="w-full sm:w-auto min-w-[150px]">
            <Select
              label="Reiseretning"
              size="small"
              value={journeyDirection}
              onChange={(e) => setJourneyDirection(e.target.value)}
            >
              <option value="forward">Fremover</option>
              <option value="backward">Bakover</option>
            </Select>
          </div>

          <div className="w-full sm:w-auto min-w-[100px]">
            <Select
              size="small"
              label="Antall steg"
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
            >
              <option value={1}>1 steg</option>
              <option value={2}>2 steg</option>
              <option value={3}>3 steg</option>
              <option value={4}>4 steg</option>
              <option value={5}>5 steg</option>
              <option value={6}>6 steg</option>
              <option value={7}>7 steg</option>
              <option value={8}>8 steg</option>
              <option value={9}>9 steg</option>
              <option value={10}>10 steg</option>
              <option value={11}>11 steg</option>
              <option value={12}>12 steg</option>
              <option value={13}>13 steg</option>
              <option value={14}>14 steg</option>
              <option value={15}>15 steg</option>
            </Select>
          </div>

          <div className="w-full sm:w-[100px]">
            <TextField
              size="small"
              label="Maks sider"
              type="number"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              onBlur={() => {
                const val = parseInt(limitInput);
                if (!isNaN(val) && val > 0) {
                  setLimit(val);
                } else {
                  setLimitInput(limit.toString());
                }
              }}
            />
          </div>

          <div className="w-full sm:w-auto self-end pb-[2px]">
            <Button
              onClick={handleSearch}
              disabled={!selectedWebsite || loading || !hasUnappliedFilterChanges}
              loading={loading}
              size="small"
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

      {!startUrl && !loading && !data && (
        <Alert variant="info" className="mb-4">
          Skriv inn en URL-sti for å se navigasjonsflyt.
        </Alert>
      )}

      {loading && (
        <div className="flex justify-center items-center h-full">
          <Loader size="xlarge" title="Laster brukerreiser..." />
        </div>
      )}

      {!loading && data && data.SankeyChartData?.nodes?.length && data.SankeyChartData?.nodes?.length > 0 && (
        <>
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="steps" label="Stegvisning" />
              <Tabs.Tab value="sankey" label="Flytdiagram" />
              <Tabs.Tab value="table" label="Tabell" />
            </Tabs.List>

            <Tabs.Panel value="sankey" className="pt-2">
              <div
                className={`${
                  isFullscreen
                    ? "fixed inset-0 z-50 bg-[var(--ax-bg-default)] p-8 overflow-auto"
                    : ""
                }`}
              >
                {isFullscreen && (
                  <div className="mb-4 flex justify-end">
                    <Button
                      size="small"
                      variant="tertiary"
                      onClick={() => setIsFullscreen(false)}
                      icon={<Minimize2 size={20} />}
                    >
                      Lukk fullskjerm
                    </Button>
                  </div>
                )}

                <div className="overflow-x-auto w-full" ref={sankeyContainerRef}>
                  <div
                    style={{
                      height: isFullscreen ? "calc(100vh - 120px)" : "700px",
                      minWidth: `${Math.max(1000, steps * 350)}px`,
                    }}
                  >
                    <ResponsiveContainer>
                      <SankeyChart data={data} />
                    </ResponsiveContainer>
                  </div>
                </div>
                {queryStats && (
                  <div className="text-sm text-[var(--ax-text-subtle)] text-right mt-4">
                    Data prosessert: {queryStats.totalBytesProcessedGB} GB
                  </div>
                )}
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="steps" className="pt-4">
              <div
                className={`${
                  isFullscreen
                    ? "fixed inset-0 z-50 bg-[var(--ax-bg-default)] p-8 overflow-auto"
                    : ""
                }`}
              >
                {!isFullscreen && (
                  <ReadMore
                    header="Slik bruker du denne analysen"
                    defaultOpen={true}
                    size="large"
                    className="mb-6"
                  >
                    <ul className="list-disc pl-5 space-y-1">
                      <li>
                        Klikk på et steg-kortene for å utheve flyten via bestemte
                        sider
                      </li>
                      <li>Bruk pluss-ikonet (+) for å legge til steg i en traktanalyse.</li>
                      <li>
                        Juster reiseretningen, for å se brukerreisen i motsatt
                        retning
                      </li>
                    </ul>
                  </ReadMore>
                )}
                {isFullscreen && (
                  <div className="mb-4 flex justify-end">
                    <Button
                      size="small"
                      variant="tertiary"
                      onClick={() => setIsFullscreen(false)}
                      icon={<Minimize2 size={20} />}
                    >
                      Lukk fullskjerm
                    </Button>
                  </div>
                )}
                {/*
                            {!isFullscreen && (
                                <div className="mb-2 flex justify-end">
                                    <Button
                                        size="small"
                                        variant="tertiary"
                                        onClick={() => setIsFullscreen(true)}
                                        icon={<Maximize2 size={20} />}
                                    >
                                        Fullskjerm
                                    </Button>
                                </div>
                            )}
                            */}

                <UmamiJourneyView
                  nodes={rawData?.nodes || []}
                  links={rawData?.links || []}
                  isFullscreen={isFullscreen}
                  reverseVisualOrder={reverseVisualOrder}
                  journeyDirection={journeyDirection}
                  websiteId={selectedWebsite?.id}
                  period={period}
                  customStartDate={customStartDate}
                  customEndDate={customEndDate}
                  domain={selectedWebsite?.domain}
                  onLoadMore={handleLoadMore}
                  isLoadingMore={isUpdating}
                />
                {queryStats && (
                  <div className="text-sm text-[var(--ax-text-subtle)] text-right mt-4">
                    Data prosessert: {queryStats.totalBytesProcessedGB} GB
                  </div>
                )}
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="table" className="pt-4">
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
                    <thead className="bg-[var(--ax-bg-neutral-soft)] sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase">
                          Steg
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase">
                          Til side
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase">
                          Fra side
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase">
                          Antall brukere
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
                      {rawData &&
                        rawData.links.map((link: JourneyLink, idx: number) => {
                          const sourceNode = rawData.nodes.find(
                            (n) => rawData.nodes.indexOf(n) === link.source
                          );
                          const targetNode = rawData.nodes.find(
                            (n) => rawData.nodes.indexOf(n) === link.target
                          );

                          const stepMatch = sourceNode?.nodeId?.match(/^(\d+):/);
                          let step: number | string = "-";
                          if (stepMatch) {
                            const rawStep = parseInt(stepMatch[1]);
                            step = journeyDirection === "backward" ? rawStep * -1 : rawStep;
                          }

                          return (
                            <tr key={idx} className="hover:bg-[var(--ax-bg-neutral-soft)]">
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                                {step}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {targetNode?.name && selectedWebsite ? (
                                  <span
                                    className="text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                                    onClick={() => {
                                      if (typeof targetNode.name === "string") setSelectedTableUrl(targetNode.name);
                                    }}
                                  >
                                    {targetNode.name}{" "}
                                    <ExternalLink className="h-3 w-3" />
                                  </span>
                                ) : (
                                  <span className="text-[var(--ax-text-default)]">
                                    {targetNode?.name || "-"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {sourceNode?.name && selectedWebsite ? (
                                  <span
                                    className="text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                                    onClick={() => {
                                      if (typeof sourceNode.name === "string") setSelectedTableUrl(sourceNode.name);
                                    }}
                                  >
                                    {sourceNode.name}{" "}
                                    <ExternalLink className="h-3 w-3" />
                                  </span>
                                ) : (
                                  <span className="text-[var(--ax-text-default)]">
                                    {sourceNode?.name || "-"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                                {link.value.toLocaleString("nb-NO")}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 bg-[var(--ax-bg-neutral-soft)] text-sm text-[var(--ax-text-subtle)] border-t flex justify-between items-center">
                  <span>
                    {rawData &&
                      `${rawData.links.length} forbindelser mellom ${rawData.nodes.length} sider`}
                  </span>
                  {queryStats && (
                    <span>Data prosessert: {queryStats.totalBytesProcessedGB} GB</span>
                  )}
                </div>
                <div className="flex gap-2 p-3 bg-[var(--ax-bg-neutral-soft)] border-b">
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={handleDownloadCSV}
                    icon={<Download size={16} />}
                  >
                    Last ned CSV
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={handleDownloadExcel}
                    icon={<Download size={16} />}
                  >
                    Last ned Excel
                  </Button>
                </div>
              </div>

              <AnalysisActionModal
                open={!!selectedTableUrl}
                onClose={() => setSelectedTableUrl(null)}
                urlPath={selectedTableUrl}
                websiteId={selectedWebsite?.id}
                period={period}
                domain={selectedWebsite?.domain}
              />
            </Tabs.Panel>
          </Tabs>
          <div className="flex justify-end mt-8">
            <Button
              size="small"
              variant="secondary"
              onClick={handleCopyShareLink}
            >
              {copySuccess ? "Kopiert!" : "Del analyse"}
            </Button>
          </div>
        </>
      )}

      {!loading && data && (data.SankeyChartData?.nodes?.length ?? 0) === 0 && (
        <div className="flex justify-center items-center h-full text-gray-500">
          Ingen data funnet for valgt periode og start-URL.
        </div>
      )}
    </ChartLayout>
  );
};

export default UserJourney;
