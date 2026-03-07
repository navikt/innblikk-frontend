import { useEffect, useRef, useState } from "react";
import {
  ActionMenu,
  Alert,
  Button,
  Loader,
  ReadMore,
  Select,
  Switch,
  TextField,
  Tooltip,
} from "@navikt/ds-react";
import { Minimize2, ExternalLink, MoreVertical, Search } from "lucide-react";
import ChartLayout from "../../analysis/ui/ChartLayout.tsx";
import WebsitePicker from "../../analysis/ui/WebsitePicker.tsx";
import PeriodPicker from "../../analysis/ui/PeriodPicker.tsx";
import UmamiJourneyView from "../../analysis/ui/journey/UmamiJourneyView.tsx";
import AnalysisActionModal from "../../analysis/ui/AnalysisActionModal.tsx";
import TableSectionHeader from "../../../shared/ui/TableSectionHeader.tsx";
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
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showTableSection, setShowTableSection] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [selectedTableUrl, setSelectedTableUrl] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState<string>("");
  const [showTableSearch, setShowTableSearch] = useState<boolean>(false);
  const tableSearchInputRef = useRef<HTMLInputElement>(null);
  const hasAutoSubmittedRef = useRef<boolean>(false);

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
    if (selectedWebsite && hasConfigParams && !hasAutoSubmittedRef.current && !loading) {
      hasAutoSubmittedRef.current = true;
      void fetchData(startUrl, steps);
    }
  }, [selectedWebsite, searchParams, loading, fetchData, startUrl, steps]);

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
    void downloadJourneyExcel(rawData, selectedWebsite?.name || "data", journeyDirection);
  };


  const handleLoadMore = (increment: number) => {
    const newSteps = steps + increment;
    setSteps(newSteps);
    void fetchData(startUrl, newSteps, true);
  };

  const filteredTableLinks = rawData
    ? rawData.links.filter((link: JourneyLink) => {
        const sourceNode = rawData.nodes[link.source];
        const targetNode = rawData.nodes[link.target];
        const haystack = `${sourceNode?.name ?? ""} ${targetNode?.name ?? ""}`.toLowerCase();
        return haystack.includes(tableSearch.toLowerCase());
      })
    : [];

  useEffect(() => {
    if (showTableSearch) tableSearchInputRef.current?.focus();
  }, [showTableSearch]);

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
          <div
            className={`${
              isFullscreen
                ? "fixed inset-0 z-50 bg-[var(--ax-bg-default)] p-8 overflow-auto"
                : "-mt-2 md:-mt-4"
            }`}
          >
            {!isFullscreen && (
              <ReadMore
                header="Slik leser du flyten"
                defaultOpen={true}
                size="large"
                className="mt-0 mb-6"
              >
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Klikk på et steg for å utheve trafikken via den siden
                  </li>
                  <li>Bruk + for å legge til steget i en traktanalyse</li>
                  <li>
                    Bytt reiseretning for å se brukerreisen bakover
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
                  <TableSectionHeader
                    title="Tabell"
                    actions={(
                      <>
                        <Tooltip content="Søk" placement="top">
                          <Button
                            type="button"
                            variant={showTableSearch ? "secondary" : "tertiary"}
                            size="xsmall"
                            icon={<Search aria-hidden />}
                            aria-label="Søk i tabell"
                            aria-pressed={showTableSearch}
                            onClick={() => {
                              setShowTableSearch((prev) => !prev);
                              if (showTableSearch) setTableSearch("");
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
                                aria-label="Flere valg for tabell"
                              />
                            </ActionMenu.Trigger>
                          </Tooltip>
                          <ActionMenu.Content align="end">
                            <ActionMenu.Item onClick={handleDownloadCSV}>
                              Last ned CSV
                            </ActionMenu.Item>
                            <ActionMenu.Item onClick={handleDownloadExcel}>
                              Last ned Excel
                            </ActionMenu.Item>
                            <ActionMenu.Divider />
                            <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                              {rawData &&
                                `${filteredTableLinks.length} forbindelser mellom ${rawData.nodes.length} sider`}
                              {queryStats && (
                                <span> • {queryStats.totalBytesProcessedGB} GB prosessert</span>
                              )}
                            </div>
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
                          value={tableSearch}
                          ref={tableSearchInputRef}
                          onChange={(e) => setTableSearch(e.target.value)}
                        />
                      </div>
                    ) : undefined}
                  />
                </div>
                <div className="overflow-x-auto max-h-[550px] overflow-y-auto px-4">
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
                        filteredTableLinks.map((link: JourneyLink, idx: number) => {
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
                                {step === "-" ? "-" : `Steg ${step}`}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {targetNode?.name && selectedWebsite ? (
                                  <span
                                    className="text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                                    onClick={() => {
                                      if (typeof targetNode.name === "string") {
                                        setSelectedTableUrl(targetNode.name);
                                      }
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
                                      if (typeof sourceNode.name === "string") {
                                        setSelectedTableUrl(sourceNode.name);
                                      }
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
                <div className="px-4 pb-4" aria-hidden="true" />
              </div>
            </div>
          )}

          <AnalysisActionModal
            open={!!selectedTableUrl}
            onClose={() => setSelectedTableUrl(null)}
            urlPath={selectedTableUrl}
            websiteId={selectedWebsite?.id}
            period={period}
            domain={selectedWebsite?.domain}
          />
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
